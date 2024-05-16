const express = require('express')
const https = require('https')
const fs = require('fs')
const crypto = require('crypto')
const cors = require('cors')
const { JsonDB, Config } = require('node-json-db')
const app = express()

app.use(express.json({ extended: true, limit: '50mb' }));
app.use(cors())
let maindb = new JsonDB(new Config('wpnews', true, false, '/'))

const options = {
    ca: fs.readFileSync('/etc/letsencrypt/live/domain/fullchain.pem'),
    key: fs.readFileSync('/etc/letsencrypt/live/domain/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/domain/cert.pem')
};

// app.get('/', async (req, res) => {
// let st = await userdb.getData("/nav")
// res.send('')
// await maindb.push("/userdata", ["blue archive"], false)
// })

app.get('/user', async (req, res) => {
    try {
        let userdata = await maindb.getData('/userdata')
        userdata = userdata.filter(e => e.reportid === req.query.reportid)[0]
        if (userdata.length == 0) return res.status(404).json({ message: 'User Not Found' })
        res.status(200).json({ message: 'Success', userdata: { belong: userdata.belong, name: userdata.name, pfimg: userdata.pfimg } })
    } catch (error) {
        res.status(500).json({ message: 'Error happened!' })
        console.log(error)
    }
})

app.post('/login', async (req, res) => {
    if (!req.headers.referer || req.headers.referer != 'https://domain/login') return res.status(403).json({ message: 'Only from WPNEWS can be requested' })

    try {
        if (!req.body.id) {
            res.status(400).json({ message: 'id is required' })
            console.log('[Error] id is required [from: ' + req.ip + ']')
            return
        } else if (!req.body.pw) {
            res.status(400).json({ message: 'password is required' })
            console.log('[Error] password is required [from: ' + req.ip + ']')
            return
        } else {
            let userdata = await maindb.getData('/userdata')
            let responded = false
            userdata.forEach(async (element, index) => {
                if (element.id == req.body.id && element.pw == req.body.pw) {
                    responded = true
                    const sessionid = crypto.randomBytes(25).toString('hex')
                    let date = new Date()
                    await maindb.push('/sessid', [{ sessid: sessionid, expire: date.setHours(date.getHours() + 1), reportid: element.reportid }], false)
                    res.status(200).json({ message: 'Login Success', sessid: sessionid, reportid: element.reportid })
                } else {
                    if (index == userdata.length - 1 && responded == false) {
                        console.log('Nope')
                        res.status(401).json({ message: 'ID or PW not correct' })
                    }
                }
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error happened!' })
        console.log(error)
    }
});

app.get('/session', async (req, res) => {
    let sessdata = await maindb.getData('/sessid')
    let ifexist = sessdata.filter(element => element.sessid === req.query.id)
    if (ifexist.length != 0) return res.status(200).json({ message: 'Session Found!', session: ifexist })
    else res.status(404).json({ message: 'Session Not Found' })
})

app.get('/session/delete/:id', async (req, res) => {
    try {
        let sessdata = await maindb.getData('/sessid')
        let newsess = []

        sessdata.forEach(element => {
            if (element.sessid == req.params.id) return
            newsess.push(element)
        });

        console.log(newsess)

        await maindb.push('/sessid', newsess)
        res.status(200).json({ message: 'Delete Success' })
    } catch (error) {
        res.status(500).json({ message: 'Error happened!' })
        console.log(error)
    }
})

app.get('/article/category', async (req, res) => {
    let category = await maindb.getData('/category')
    res.send(category)
})

app.post('/article/public', async (req, res) => {
    try {
        let now = new Date().getTime()
        if (!req.body.id) {
            let sessdata = await maindb.getData('/sessid')
            sessdata = sessdata.filter(e => e.sessid == req.body.sessid)[0]
            console.log(sessdata)
            let id = crypto.randomBytes(15).toString('hex')
            let data = {
                "arttitle": req.body.arttitle,
                "arttype": req.body.arttype,
                "artbody": req.body.artbody,
                "artcategory": req.body.artcategory,
                "thumbnail": req.body.thumbnail,
                "id": id,
                "ifpublic": true,
                "writedate": now,
                "editdate": now,
                "reportid": sessdata.reportid
            }
            await maindb.push('/article', [data], false)
        } else {
            let articles = await maindb.getData('/article')
            let article = articles.filter(e => e.id == req.body.id)[0]
            let index = articles.indexOf(article)
            articles[index].ifpublic = true
            articles[index].writedate = now
            articles[index].editdate = 0

            await maindb.push('/article', articles)
        }

        let category = await maindb.getData('/category')
        let ctindex = category.indexOf(req.body.artcategory)
        console.log(ctindex)
        if (ctindex != -1) {
            category.splice(ctindex, 1)
            category.push(req.body.artcategory)
            await maindb.push('/category', category)
        }

        res.status(200).json({ message: 'Successfully done' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Server Error' })
    }
    console.log(req.body.id)
})

app.post('/article/save', async (req, res) => {
    try {
        if (!req.body.id) {
            console.log('ID NOT FOUND')
            let id = crypto.randomBytes(15).toString('hex')
            let sessdata = await maindb.getData('/sessid')
            sessdata = sessdata.filter(e => e.sessid == req.body.sessid)[0]
            let data = {
                "arttitle": req.body.arttitle,
                "arttype": req.body.arttype,
                "artbody": req.body.artbody,
                "artcategory": req.body.artcategory,
                "thumbnail": req.body.thumbnail,
                "id": id,
                "ifpublic": false,
                "writedate": 0,
                "editdate": 0,
                "reportid": sessdata.reportid
            }
            await maindb.push('/article', [data], false)
        }
        else {
            let data = await maindb.getData('/article')
            data.forEach(element => {
                if (element.id === req.body.id) {
                    element.arttitle = req.body.arttitle
                    element.arttype = req.body.arttype
                    element.artbody = req.body.artbody
                    element.editdate = req.body.editdate
                }
            });

            await maindb.push('/article', data)
        }
        res.status(200).json({ message: 'Successfully Done' })
    } catch (error) {
        res.status(500).json({ message: 'Error happened' })
        console.log(error)
    }
})

app.get('/article/delete/:id', async (req, res) => {
    let articles = await maindb.getData('/article')
    let newartlist = []
    articles.forEach(element => {
        if (element.id == req.params.id) return
        newartlist.push(element)
    });
    await maindb.push('/article', newartlist)
    res.status(200).json({ message: 'Successfully Done' })
})

app.get('/article/list', async (req, res) => {
    let articles = await maindb.getData('/article')
    // if (!articles) return
    res.status(200).json(articles)
})

app.get('/article/find', async (req, res) => {
    let id = req.query.id
    let data = await maindb.getData('/article')
    data = data.filter(e => e.id == id)
    if (data.length == 0) return res.status(404).json({ message: 'Article Not Found' })
    res.status(200).json(data[0])
})

app.post('/category/add', async (req, res) => {
    console.log(req.body.category)
    await maindb.push('/category', [req.body.category], false)
    res.status(200).json({ message: 'Successfully done' })
})

app.get('/parts/list', async (req, res) => {
    try {
        let data = await maindb.getData('/parts')
        res.status(200).json(data)
    } catch (error) {
        res.status(500).json({ message: 'Error happened' })
        console.log(error)
    }
})

app.post('/parts/change', async (req, res) => {
    try {
        let data = await maindb.getData('/parts')
        // console.log(req.body.indexes)
        data[req.body.indexes].forEach(element => {
            if (element.name == req.body.name) {
                element.artid = req.body.artid
            }
        });
        await maindb.push('/parts', data)
        res.status(200).json({ message: 'Successfully done' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error happened' })
    }
})

app.get('/pfimg', async (req, res) => {
    let userdata = await maindb.getData('/userdata')
    userdata = userdata.filter(e => e.reportid = req.query.id)
    if (userdata.length == 0) return res.status(404).json({message: 'Not Found'})
    res.status(200).json({message: 'Successfully Done', pfimg: userdata[0].pfimg})
})

app.post('/pfimg', async (req, res) => {
    let userdata = await maindb.getData('/userdata')
    userdata.forEach(element => {
        if (element.reportid == req.body.reportid) element.pfimg = req.body.pfimg
    });
    await maindb.push('/userdata', userdata)
    res.status(200).json({message: 'Successfully done'})
})

setInterval(async () => {
    let sessions = await maindb.getData('/sessid')
    let newsess = []
    sessions.forEach(async element => {
        let now = new Date().getTime()
        if (element.expire <= now) return
        newsess.push(element)
    });

    await maindb.push('/sessid', newsess)
}, 60000);

const server = https.createServer(options, app)

server.listen(3005, () => {
    console.log('Listening to port 3005')
})
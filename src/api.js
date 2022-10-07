import * as dotenv from 'dotenv'
dotenv.config()
import * as mariadb from "mariadb"
import express from "express"

const app = express()
const port = process.env.PORT

function convertIntObj(obj) {
    const res = {}
    for (const key in obj) {
        const parsed = parseInt(obj[key], 10)
        res[key] = isNaN(parsed) ? obj[key] : parsed
    }
    return res
}

app.get('/counts/:user_id', async (req, res) => {
    const user_id = req.params.user_id
    const conn = await mariadb.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE
    })

    const query = `
SELECT  SUM(CASE WHEN position=1 THEN 1 ELSE 0 END)    as top1s,
        SUM(CASE WHEN position<=8 THEN 1 ELSE 0 END)   as top8s,
        SUM(CASE WHEN position<=25 THEN 1 ELSE 0 END)  as top25s,
        SUM(CASE WHEN position<=50 THEN 1 ELSE 0 END)  as top50s,
        SUM(CASE WHEN position<=100 THEN 1 ELSE 0 END) as top100s
FROM    scores
WHERE user_id = ?
GROUP BY user_id`

    const result = await conn.query(query, [user_id])
    console.log(convertIntObj(result[0]))
    res.status(200)
    res.json(convertIntObj(result[0]))
})

app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})
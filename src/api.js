import * as dotenv from 'dotenv'
dotenv.config()
import express from "express"
import { getRankings, getCounts } from "./redis.js"

const app = express()
const port = process.env.PORT

app.get("/rankings/:type", async (req, res) => {
    const type = req.params.type ?? "top50s"
    const limit = req.query.limit ?? 50
    const offset = req.query.offset ?? 0
    console.log("get rankings")
    const rankings = await getRankings(type, limit, offset)

    res.status(200)
    res.json(rankings)
})

app.get('/counts/:user_id', async (req, res) => {
    const user_id = req.params.user_id
    console.log("get counts")
    const counts = await getCounts(user_id)

    res.status(200)
    res.json(counts)
})

app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})
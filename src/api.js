import * as dotenv from 'dotenv'
dotenv.config()
import express from "express"
import logger from "morgan"
import { getRankings, getCounts } from "./redis.js"
import path from "path"
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express()
const port = process.env.PORT

app.use(express.static(path.join(__dirname, "frontend", "build")))
app.use(logger("dev"))

app.get("/rankings/:type", async (req, res) => {
    const type = req.params.type ?? "top50s"
    let limit = (parseInt(req.query.limit) <= 100 && parseInt(req.query.limit) > 0) ? req.query.limit : 50
    let offset = req.query.offset ?? 0

    if (req.query.page) {
        if (req.query.page < 1 || isNaN(req.query.page)) {
            req.query.page = 1;
        }
        offset = (req.query.page - 1) * limit;
    }

    const rankings = await getRankings(type, limit, offset)

    res.status(200)
    res.json(rankings)
})

app.get('/counts/:user_id', async (req, res) => {
    const user_id = req.params.user_id

    const counts = await getCounts(user_id)

    res.status(200)
    res.json(counts)
})

app.get("/*", async (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "build", "index.html"))
})

app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})
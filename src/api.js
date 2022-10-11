import * as dotenv from 'dotenv'
dotenv.config()
import express from "express"
import logger from "morgan"
import { getRankings, getCounts, getLastUpdate, getCountsSQL, getRankingsSQL } from "./redis.js"
import path from "path"
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TYPES = ["top50s", "top25s", "top8s", "top1s"]

const app = express()
const port = process.env.PORT

app.use(express.static(path.join(__dirname, "frontend", "build")))
app.use(logger("dev"))

app.get("/rankings/:type?", async (req, res) => {
    const type = req.params.type && TYPES.includes(req.params.type) ? req.params.type : "top50s"
    let limit = (parseInt(req.query.limit) <= 100 && parseInt(req.query.limit) > 0) ? req.query.limit : 50
    let offset = req.query.offset ?? 0
    let filtered = false
    const pos = parseInt(type.replace(/\D/g, ""))
    let params = [type, pos]

    if (req.query.page) {
        if (req.query.page < 1 || isNaN(req.query.page)) {
            req.query.page = 1;
        }
        offset = (req.query.page - 1) * limit;
    }

    const query = `SELECT user_id, count(score_id) as ? FROM osustats.scores 
    WHERE position<= ? AND beatmap_id IN (SELECT beatmap_id FROM osu.beatmap WHERE approved > 0 AND approved != 3 AND mode = 0`;

    let filter = "";

    if (req.query.from) {
        filter += ` AND approved_date > ?`;
        params.push(new Date(req.query.from).toISOString().slice(0, 19).replace('T', ' '));
        filtered = true
    }

    if (req.query.to) {
        filter += ` AND approved_date < ?`;
        params.push(new Date(req.query.to).toISOString().slice(0, 19).replace('T', ' '));
        filtered = true
    }

    if (req.query.length_min) {
        filter += ` AND total_length >= ?`;
        params.push(req.query.length_min);
        filtered = true
    }

    if (req.query.length_max) {
        filter += ` AND total_length <= ?`;
        params.push(req.query.length_max);
        filtered = true
    }

    if (req.query.star_rating) {
        let star_range = req.query.star_rating.split("-");

        const range = [];

        for (const part of star_range)
            range.push(parseFloat(part));

        if (range.length == 1)
            range.push(Math.floor(range[0] + 1));

        filter += ` AND star_rating BETWEEN ? and ?`;

        params.push(range[0], range[1]);
        filtered = true
    }

    if (req.query.tags) {
        let tags = req.query.tags.replace(',', '%')
        filter += ` AND CONCAT(source, '|', tags, '|', artist, '|', title, '|', creator, '|', version) like ?`;
        params.push('%' + tags + '%');
        filtered = true
    }

    filter += `) GROUP BY user_id ORDER BY ${type} DESC LIMIT ? OFFSET ?`
    params.push(parseInt(limit), parseInt(offset))

    let rankings
    if (filtered) {
        rankings = await getRankingsSQL(type, `${query} ${filter}`, params, offset)
    } else {
        rankings = await getRankings(type, limit, offset)
    }

    res.status(200)
    res.json(rankings)
})

app.get('/counts/:user_id', async (req, res) => {
    const user_id = !Number.isNaN(req.params.user_id) ? req.params.user_id : 0

    const params = [user_id];

    const query = `SELECT user_id, 
    SUM(CASE WHEN position=1 THEN 1 ELSE 0 END) as top1s,
    SUM(CASE WHEN position<=8 THEN 1 ELSE 0 END) as top8s,
    SUM(CASE WHEN position<=25 THEN 1 ELSE 0 END) as top25s,
    SUM(CASE WHEN position<=50 THEN 1 ELSE 0 END) as top50s
    FROM osustats.scores WHERE user_id = ? AND beatmap_id IN
    (SELECT beatmap_id FROM osu.beatmap WHERE approved > 0 AND approved != 3 AND mode = 0`;

    let filter = "";

    if (req.query.from) {
        filter += ` AND approved_date > ?`;
        params.push(new Date(req.query.from).toISOString().slice(0, 19).replace('T', ' '));
    }

    if (req.query.to) {
        filter += ` AND approved_date < ?`;
        params.push(new Date(req.query.to).toISOString().slice(0, 19).replace('T', ' '));
    }

    if (req.query.length_min) {
        filter += ` AND total_length >= ?`;
        params.push(req.query.length_min);
    }

    if (req.query.length_max) {
        filter += ` AND total_length <= ?`;
        params.push(req.query.length_max);
    }

    if (req.query.star_rating) {
        let star_range = req.query.star_rating.split("-");

        const range = [];

        for (const part of star_range)
            range.push(parseFloat(part));

        if (range.length == 1)
            range.push(Math.floor(range[0] + 1));

        filter += ` AND star_rating BETWEEN ? and ?`;

        params.push(range[0], range[1]);
    }

    if (req.query.tags) {
        let tags = req.query.tags.replace(',', '%')
        filter += ` AND CONCAT(source, '|', tags, '|', artist, '|', title, '|', creator, '|', version) like ?`;
        params.push('%' + tags + '%');
    }

    filter += ")"

    let counts
    if (Object.keys(req.query).length === 0) {
        counts = await getCounts(user_id)
    } else {
        counts = await getCountsSQL(`${query} ${filter}`, params)
    }

    res.status(200)
    res.json(counts)
})

app.get("/last_update", async (req, res) => {
    const last_update = await getLastUpdate()

    res.status(200)
    res.json({ last_update })
})

app.get("/*", async (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "build", "index.html"))
})

app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})
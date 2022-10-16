import * as dotenv from 'dotenv'
dotenv.config()
import express from "express"
import logger from "morgan"
import { getRankings, getCounts, getLastUpdate, getCountsSQL, getRankingsSQL } from "./redis.js"
import path from "path"
import { fileURLToPath } from "url";
import { getModsEnum } from './mods.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TYPES = ["top50s", "top25s", "top15s", "top8s", "top1s"]

const app = express()
const port = process.env.PORT

app.use(express.static(path.join(__dirname, "frontend", "build")))
app.use(logger("dev"))

app.get("/rankings/:type?", async (req, res) => {
    const type = req.params.type && TYPES.includes(req.params.type) ? req.params.type : "top50s"
    let limit = (parseInt(req.query.limit) <= 100 && parseInt(req.query.limit) > 0) ? req.query.limit : 50
    let offset = req.query.offset ?? 0
    const pos = parseInt(type.replace(/\D/g, ""))

    if (req.query.page) {
        if (req.query.page < 1 || isNaN(req.query.page)) {
            req.query.page = 1;
        }
        offset = (req.query.page - 1) * limit;
    }

    const query = `SELECT scores.user_id, count(score_id) as ? FROM osustats.scores 
    INNER JOIN osustats.user_countries ON osustats.scores.user_id = osustats.user_countries.user_id 
    WHERE position<= ? AND beatmap_id IN (SELECT beatmap_id FROM osu.beatmap WHERE approved > 0 AND approved != 3 AND mode = 0`;

    let { filter, params, filtered } = getFilters(req.query, [type, pos])

    filter += ` GROUP BY user_id ORDER BY ${type} DESC LIMIT ? OFFSET ?`
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

    const query = `SELECT scores.user_id, 
    SUM(CASE WHEN position=1 THEN 1 ELSE 0 END) as top1s,
    SUM(CASE WHEN position<=8 THEN 1 ELSE 0 END) as top8s,
    SUM(CASE WHEN position<=15 THEN 1 ELSE 0 END) as top15s,
    SUM(CASE WHEN position<=25 THEN 1 ELSE 0 END) as top25s,
    SUM(CASE WHEN position<=50 THEN 1 ELSE 0 END) as top50s
    FROM osustats.scores 
    INNER JOIN osustats.user_countries ON osustats.scores.user_id = osustats.user_countries.user_id 
    WHERE user_id = ? AND beatmap_id IN
    (SELECT beatmap_id FROM osu.beatmap WHERE approved > 0 AND approved != 3 AND mode = 0`;

    // useless for counts
    delete req.query.page
    delete req.query.limit

    let { filter, params } = getFilters(req.query, [user_id])

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

function getFilters(query, _params) {
    let filtered = false
    let filter = ""
    let params = _params
    if (query.from) {
        filter += ` AND approved_date > ?`;
        params.push(new Date(query.from).toISOString().slice(0, 19).replace('T', ' '));
    }

    if (query.to) {
        filter += ` AND approved_date < ?`;
        params.push(new Date(query.to).toISOString().slice(0, 19).replace('T', ' '));
    }

    if (query.length_min) {
        filter += ` AND total_length >= ?`;
        params.push(query.length_min);
    }

    if (query.length_max) {
        filter += ` AND total_length <= ?`;
        params.push(query.length_max);
    }

    if (query.spinners_min) {
        filter += ` AND num_spinners >= ?`;
        params.push(query.spinners_min);
    }

    if (query.spinners_max) {
        filter += ` AND num_spinners < ?`;
        params.push(query.spinners_max);
    }

    if (query.star_rating) {
        let star_range = query.star_rating.split("-");

        const range = [];

        for (const part of star_range)
            range.push(parseFloat(part));

        if (range.length == 1)
            range.push(Math.floor(range[0] + 1));

        filter += ` AND star_rating BETWEEN ? and ?`;

        params.push(range[0], range[1]);
    }

    if (query.tags) {
        let tags = query.tags.replace(',', '%')
        filter += ` AND CONCAT(source, '|', tags, '|', artist, '|', title, '|', creator, '|', version) like ?`;
        params.push('%' + tags + '%');
    }

    filter += ")"

    if (query.mods) {
        const mods_array = query.mods.match(/.{2}/g)
        filter += ` AND enabled_mods = ?`;
        params.push(getModsEnum(mods_array));
    }

    if (query.mods_include) {
        const mods_array = query.mods_include.match(/.{2}/g)
        for (const mod of mods_array) {
            filter += ` AND mods LIKE ?`;
            params.push(`%${mod}%`);
        }
    }

    if (query.mods_exclude) {
        const mods_array = query.mods_exclude.match(/.{2}/g)
        for (const mod of mods_array) {
            filter += ` AND mods NOT LIKE ?`;
            params.push(`%${mod}%`);
        }
    }

    if (query.country) {
        filter += ` AND country = ?`;
        params.push(query.country);
    }

    if (filter.length > 1)
        filtered = true

    return { filter, params, filtered }
}
import * as dotenv from 'dotenv'
dotenv.config()
import express from "express"
import logger from "morgan"
import statusMonitor from "express-status-monitor"
import { getRankings, getCounts, getLastUpdate, getCountsSQL, getRankingsSQL, runSQL, getUserId } from "./redis.js"
import path from "path"
import { fileURLToPath } from "url";
import { getModsEnum } from './mods.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TYPES = ["top50s", "top25s", "top15s", "top8s", "top1s", "custom"]
const MODES = ["osu", "taiko", "catch", "mania"]
const MODE_NUMBER = {
    "osu": 0,
    "taiko": 1,
    "catch": 2,
    "mania": 3
}

const app = express()
const port = process.env.PORT

app.use(express.static(path.join(__dirname, "frontend", "build")))
app.use(logger("dev"))
app.use(statusMonitor());

app.get("/rankings/:type?", async (req, res) => {
    let type = req.params.type && TYPES.includes(req.params.type) ? req.params.type : "top50s"
    let limit = (parseInt(req.query.limit) <= 100 && parseInt(req.query.limit) > 0) ? req.query.limit : 50
    let offset = req.query.offset ?? 0
    let pos = 50
    if (type == "custom" && req.query.rank) {
        pos = req.query.rank.split("-")
        if (!pos[1]) {
            pos[1] = pos[0]
        }
        if (!+pos[0] || !+pos[1]) {
            type = "top50s"
            pos = 50
        }
    }
    else {
        pos = parseInt(type.replace(/\D/g, ""))
    }

    let mode
    if (+req.query.mode) {
        mode = MODES[+req.query.mode]
    } else if (req.query.mode) {
        mode = req.query.mode.toLowerCase()
    }
    if (!mode || !MODES.includes(mode)) {
        mode = "osu"
    }
    let scores_table = "scores"
    if (mode != "osu" && MODES.includes(mode)) {
        scores_table = `scores_${mode}`
    }

    if (req.query.page) {
        if (req.query.page < 1 || isNaN(req.query.page)) {
            req.query.page = 1;
        }
        offset = (req.query.page - 1) * limit;
    }

    const query = `SELECT ${scores_table}.user_id,
    COUNT(score_id) as ? FROM osustats.${scores_table} 
    INNER JOIN osustats.user_countries ON osustats.${scores_table}.user_id = osustats.user_countries.user_id 
    INNER JOIN osu.beatmap ON osustats.${scores_table}.beatmap_id = osu.beatmap.beatmap_id
    WHERE ${type == "custom" && +pos[0] ? `position >= ? AND position <= ?` : `position <= ?`} 
    AND osu.beatmap.approved > 0 AND osu.beatmap.approved != 3 AND osu.beatmap.mode in (0,${MODE_NUMBER[mode]})`;

    const beatmap_query = `SELECT COUNT(distinct beatmap_id) as beatmaps_amount FROM osu.beatmap WHERE mode in (0,${MODE_NUMBER[mode]}) AND approved>0 AND approved!=3`
    const beatmap_filters = getFilters(req.query, [], true)

    let param_array
    if (Array.isArray(pos)) {
        param_array = [type, pos[0], pos[1]]
    } else {
        param_array = [type, pos]
    }
    let { filter, params, filtered } = getFilters(req.query, param_array, false, scores_table)

    filter += ` GROUP BY user_id ORDER BY ${type} DESC LIMIT ? OFFSET ?`
    params.push(parseInt(limit), parseInt(offset))

    let rankings
    if (filtered || type == "custom") {
        rankings = await getRankingsSQL(type, `${query} ${filter}`, params, offset, {
            query: `${beatmap_query} ${beatmap_filters.filter}`,
            params: beatmap_filters.params
        })
    } else {
        rankings = await getRankings(type, limit, offset, mode)
    }

    if (rankings.error) {
        res.status(404)
    }
    else {
        res.status(200)
    }
    res.json(rankings)
})

app.get('/counts/:user', async (req, res) => {
    let user_id
    if (+req.params.user) {
        user_id = parseInt(req.params.user)
    } else {
        user_id = await getUserId(req.params.user)
    }

    let mode
    if (+req.query.mode) {
        mode = MODES[+req.query.mode]
    } else if (req.query.mode) {
        mode = req.query.mode.toLowerCase()
    }
    if (!mode || !MODES.includes(mode)) {
        mode = "osu"
    }
    let scores_table = "scores"
    if (mode != "osu" && MODES.includes(mode)) {
        scores_table = `scores_${mode}`
    }

    if (!user_id) {
        res.status(404)
        res.json({ "error": "user not found" })
        return
    }

    let custom_rank
    if (req.query.rank)
        custom_rank = req.query.rank.split("-")

    const query = `SELECT ${scores_table}.user_id,
    ${custom_rank && parseInt(custom_rank[0]) ? `SUM(CASE WHEN position>=${parseInt(custom_rank[0])} AND position<=${parseInt(custom_rank[1]) || parseInt(custom_rank[0])} THEN 1 ELSE 0 END) as 'rank_${parseInt(custom_rank[0]) + (parseInt(custom_rank[1]) ? "-" + parseInt(custom_rank[1]) + "'" : "'")},` : ""}
    SUM(CASE WHEN position=1 THEN 1 ELSE 0 END) as top1s,
    SUM(CASE WHEN position<=8 THEN 1 ELSE 0 END) as top8s,
    SUM(CASE WHEN position<=15 THEN 1 ELSE 0 END) as top15s,
    SUM(CASE WHEN position<=25 THEN 1 ELSE 0 END) as top25s,
    SUM(CASE WHEN position<=50 THEN 1 ELSE 0 END) as top50s
    FROM osustats.${scores_table} INNER JOIN osustats.user_countries ON osustats.${scores_table}.user_id = osustats.user_countries.user_id
    INNER JOIN osu.beatmap ON osustats.${scores_table}.beatmap_id = osu.beatmap.beatmap_id
    WHERE osustats.${scores_table}.user_id = ? AND osu.beatmap.approved > 0 AND osu.beatmap.approved != 3 AND osu.beatmap.mode in (0,${MODE_NUMBER[mode]})`;

    const beatmap_query = `SELECT COUNT(distinct beatmap_id) as beatmaps_amount FROM osu.beatmap WHERE mode in (0,${MODE_NUMBER[mode]}) AND approved>0 AND approved!=3`
    const beatmap_filters = getFilters(req.query, [], true)
    // useless for counts
    delete req.query.page
    delete req.query.limit

    let { filter, params, filtered } = getFilters(req.query, [user_id], false, scores_table)

    let counts
    if (filtered) {
        counts = await getCountsSQL(`${query} ${filter}`, params, custom_rank)
        const rows = await runSQL(`${beatmap_query} ${beatmap_filters.filter}`, beatmap_filters.params)
        counts["beatmaps_amount"] = parseInt(rows[0].beatmaps_amount)
    } else {
        counts = await getCounts(user_id, mode)
        if (custom_rank && parseInt(custom_rank[0])) {
            if (custom_rank.length == 1) {
                const rows = await runSQL(`SELECT COUNT(score_id) as amount FROM osustats.${scores_table} WHERE ${scores_table}.user_id = ? AND position = ?`, [user_id, parseInt(custom_rank[0])])
                if (Array.isArray(rows) && rows[0].amount)
                    counts[`rank_${parseInt(custom_rank[0])}`] = parseInt(rows[0].amount)
            } else {
                const rows = await runSQL(`SELECT COUNT(score_id) as amount FROM osustats.${scores_table} WHERE ${scores_table}.user_id = ? AND position >= ? AND position <= ?`, [user_id, parseInt(custom_rank[0]), parseInt(custom_rank[1])])
                if (Array.isArray(rows) && rows[0].amount)
                    counts[`rank_${parseInt(custom_rank[0]) + "-" + parseInt(custom_rank[1])}`] = parseInt(rows[0].amount)
            }
        }
    }
    if (counts.error) {
        res.status(404)
    }
    else {
        res.status(200)
    }
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

function getFilters(query, _params, b = false, scores_table) {
    let filtered = false
    let filter = ""
    let params = _params
    if (query.from) {
        filter += ` AND osu.beatmap.approved_date >= ?`;
        params.push(new Date(query.from).toISOString().slice(0, 19).replace('T', ' '));
    }

    if (query.to) {
        filter += ` AND osu.beatmap.approved_date < ?`;
        params.push(new Date(query.to).toISOString().slice(0, 19).replace('T', ' '));
    }

    if (query.played_from && !b) {
        filter += ` AND osustats.${scores_table}.date >= ?`
        params.push(new Date(query.played_from).toISOString().slice(0, 19).replace('T', ' '));
    }

    if (query.played_to && !b) {
        filter += ` AND osustats.${scores_table}.date < ?`
        params.push(new Date(query.played_to).toISOString().slice(0, 19).replace('T', ' '));
    }

    if (query.length_min) {
        filter += ` AND osu.beatmap.total_length >= ?`;
        params.push(query.length_min);
    }

    if (query.length_max) {
        filter += ` AND osu.beatmap.total_length <= ?`;
        params.push(query.length_max);
    }

    if (query.spinners_min) {
        filter += ` AND osu.beatmap.num_spinners >= ?`;
        params.push(query.spinners_min);
    }

    if (query.spinners_max) {
        filter += ` AND osu.beatmap.num_spinners < ?`;
        params.push(query.spinners_max);
    }

    if (query.star_rating) {
        let star_range = query.star_rating.split("-");

        const range = [];

        for (const part of star_range)
            range.push(parseFloat(part));

        if (range.length == 1)
            range.push(Math.floor(range[0] + 1));

        filter += ` AND osu.beatmap.star_rating BETWEEN ? and ?`;

        params.push(range[0], range[1]);
    }

    if (query.tags) {
        let tags = query.tags.replace(',', '%')
        filter += ` AND CONCAT(osu.beatmap.source, '|', osu.beatmap.tags, '|', osu.beatmap.artist, '|', osu.beatmap.title, '|', osu.beatmap.creator, '|', osu.beatmap.version) like ?`;
        params.push('%' + tags + '%');
    }

    if (query.mods && !b) {
        const mods_array = query.mods.match(/.{2}/g)
        filter += ` AND osustats.${scores_table}.enabled_mods = ?`;
        params.push(getModsEnum(mods_array));
    }

    if (query.mods_include && !b) {
        const mods_array = query.mods_include.match(/.{2}/g)
        for (const mod of mods_array) {
            filter += ` AND osustats.${scores_table}.mods LIKE ?`;
            params.push(`%${mod}%`);
        }
    }

    if (query.mods_exclude && !b) {
        const mods_array = query.mods_exclude.match(/.{2}/g)
        for (const mod of mods_array) {
            filter += ` AND osustats.${scores_table}.mods NOT LIKE ?`;
            params.push(`%${mod}%`);
        }
    }

    if (query.country && !b) {
        filter += ` AND osustats.user_countries.country = ?`;
        params.push(query.country);
    }

    if (filter.length > 0)
        filtered = true

    return { filter, params, filtered }
}
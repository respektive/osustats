import * as dotenv from 'dotenv'
dotenv.config()
import * as mariadb from "mariadb"
import Redis from "ioredis"
const redis = new Redis();
import axios from "axios"
import axiosRetry from 'axios-retry';
import { insertIntoRedis } from "./redis.js"
import { getMods } from "./mods.js"

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: 10
})

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay })

async function fetchLeaderboardsV1(skip = 0) {
    console.log("Starting Leaderboard fetching now.")

    const beatmapsRes = await axios.get("https://osu.respektive.pw/beatmaps")
    const beatmaps = beatmapsRes.data
    let beatmapIds = beatmaps.ranked.beatmaps.concat(beatmaps.loved.beatmaps)
    if (skip > 0) {
        beatmapIds = beatmapIds.slice(skip)
    }

    let scoresToInsert = []
    let beatmapsToClear = []

    for (const [idx, beatmap_id] of beatmapIds.entries()) {
        beatmapsToClear.push(beatmap_id)

        let conn
        try {
            const response = await axios.get(`https://osu.ppy.sh/api/get_scores?k=${process.env.OSU_API_KEY}&b=${beatmap_id}&m=0&limit=50`)
            const beatmapScores = response.data
            for (const [index, score] of beatmapScores.entries()) {
                const position = index + 1
                const mods = getMods(score.enabled_mods)

                scoresToInsert.push([
                    beatmap_id,
                    score.score_id,
                    score.score,
                    score.username,
                    score.maxcombo,
                    score.count50,
                    score.count100,
                    score.count300,
                    score.countmiss,
                    score.countkatu,
                    score.countgeki,
                    score.perfect,
                    score.enabled_mods,
                    score.date,
                    score.pp,
                    score.rank,
                    score.replay_available,
                    position,
                    score.user_id,
                    mods.join()
                ])
            }

            if (scoresToInsert.length >= 1000 || idx + 1 == beatmapIds.length) {
                conn = await pool.getConnection()

                await conn.query("DELETE FROM scores WHERE beatmap_id IN (?)", [beatmapsToClear])
                const res = await conn.batch("INSERT INTO scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", scoresToInsert)
                console.log(`(${idx + 1}/${beatmapIds.length})`, "added", res.affectedRows, "scores for beatmap_ids", beatmapsToClear)
                scoresToInsert = []
                beatmapsToClear = []
            }
        } catch (e) {
            console.error(e)
            console.log(beatmap_id, "Couldn't fetch scores, continuing with next beatmap.")
            continue
        } finally {
            if (conn) conn.release()
        }
    }

    console.log("done.")
    await insertIntoRedis()
    await redis.set("last_update", new Date().toISOString())
}

export { fetchLeaderboardsV1 }
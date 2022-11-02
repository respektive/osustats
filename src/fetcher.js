import * as dotenv from 'dotenv'
dotenv.config()
import * as mariadb from "mariadb"
import Redis from "ioredis"
const redis = new Redis();
import fetch from 'node-fetch'
import { insertIntoRedis } from "./redis.js"
import { getMods } from "./mods.js"

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: 10
})

async function fetchLeaderboardsV1(skip = 0, mode = 0) {
    console.log(mode, "Starting Leaderboard fetching now.")

    const res = await fetch("https://osu.respektive.pw/beatmaps")
    const beatmaps = await res.json()
    let beatmapIds = beatmaps.ranked.beatmaps.concat(beatmaps.loved.beatmaps)

    let modeString
    switch (parseInt(mode)) {
        case 3: {
            modeString = "_mania"
            const res = await fetch("https://osu.respektive.pw/beatmaps?mode=3")
            const beatmaps = await res.json()
            beatmapIds = beatmapIds.concat(beatmaps.ranked.beatmaps.concat(beatmaps.loved.beatmaps))
            break
        }
        case 2: {
            modeString = "_catch"
            const res = await fetch("https://osu.respektive.pw/beatmaps?mode=2")
            const beatmaps = await res.json()
            beatmapIds = beatmapIds.concat(beatmaps.ranked.beatmaps.concat(beatmaps.loved.beatmaps))
            break
        }
        case 1: {
            modeString = "_taiko"
            const res = await fetch("https://osu.respektive.pw/beatmaps?mode=1")
            const beatmaps = await res.json()
            beatmapIds = beatmapIds.concat(beatmaps.ranked.beatmaps.concat(beatmaps.loved.beatmaps))
            break
        }
        default: {
            modeString = ""
            break
        }
    }

    if (skip > 0) {
        beatmapIds = beatmapIds.slice(skip)
    }

    let scoresToInsert = []
    let beatmapsToClear = []

    for (const [idx, beatmap_id] of beatmapIds.entries()) {
        beatmapsToClear.push(beatmap_id)

        let conn
        try {
            const response = await fetch(`https://osu.ppy.sh/api/get_scores?k=${process.env.OSU_API_KEY}&b=${beatmap_id}&m=${mode}&limit=50`)
            const beatmapScores = await response.json()
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

                await conn.query(`DELETE FROM scores${modeString} WHERE beatmap_id IN (?)`, [beatmapsToClear])
                const res = await conn.batch(`INSERT INTO scores${modeString} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, scoresToInsert)
                console.log(mode, `(${idx + 1}/${beatmapIds.length})`, "added", res.affectedRows, "scores for beatmap_ids", beatmapsToClear)
                scoresToInsert = []
                beatmapsToClear = []
            }
        } catch (e) {
            console.error(e)
            console.log(mode, beatmap_id, "Couldn't fetch scores, continuing with next beatmap.")
            scoresToInsert = []
            beatmapsToClear = []
            continue
        } finally {
            if (conn) conn.release()
        }
    }

    console.log(mode, "done.")
    await insertIntoRedis(false, modeString)
    if (parseInt(mode) === 0)
        await redis.set("last_update", new Date().toISOString())
}

export { fetchLeaderboardsV1 }
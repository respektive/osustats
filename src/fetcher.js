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
    let beatmapsToFetch = []

    for (const [idx, beatmap_id] of beatmapIds.entries()) {
        beatmapsToFetch.push(beatmap_id)

        let conn
        if (beatmapsToFetch.length >= 4 || idx + 1 == beatmapIds.length) {
            try {
                const reqs = beatmapsToFetch.map(async id => {
                    return await fetch(`https://osu.ppy.sh/api/get_scores?k=${process.env.OSU_API_KEY}&b=${id}&m=${mode}&limit=50`)
                })
                const results = await Promise.all(reqs)

                for (const [idx, response] of results.entries()) {

                    const beatmapScores = await response.json()
                    for (const [index, score] of beatmapScores.entries()) {
                        const position = index + 1
                        const mods = getMods(score.enabled_mods)

                        scoresToInsert.push([
                            beatmapsToFetch[idx],
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
                }
                beatmapsToFetch = []
                if (scoresToInsert.length >= 10000 || idx + 1 == beatmapIds.length) {
                    conn = await pool.getConnection()

                    const res = await conn.batch(`INSERT INTO tmp_scores${modeString} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE score_id = score_id`, scoresToInsert)
                    console.log(mode, `(${idx + 1}/${beatmapIds.length})`, "added", res.affectedRows, "scores")
                    scoresToInsert = []
                    beatmapsToFetch = []
                }
            } catch (e) {
                console.error(e)
                console.log(mode, beatmap_id, "Couldn't fetch scores, continuing with next beatmap.")
                scoresToInsert = []

                continue
            } finally {
                if (conn) conn.release()
            }
        }
    }
    if (skip == 0) {
        let conn
        try {
            conn = await pool.getConnection()

            const del = await conn.query(`TRUNCATE scores${modeString}`)
            console.log(mode, del)
            const res = await conn.query(`INSERT INTO scores${modeString} SELECT * FROM tmp_scores${modeString}`)
            console.log(mode, res)
            const del2 = await conn.query(`TRUNCATE tmp_scores${modeString}`)
            console.log(mode, del2)
        } catch (e) {
            console.error(e)
            console.log(mode, "Insert into scores table failed.")
        } finally {
            if (conn) conn.release()
        }
    }

    console.log(mode, "done.")
    await insertIntoRedis(false, modeString)
    return
}

async function setLastUpdate() {
    await redis.set("last_update", new Date().toISOString())
    return
}

export { fetchLeaderboardsV1, setLastUpdate }
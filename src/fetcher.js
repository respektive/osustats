import * as dotenv from 'dotenv'
dotenv.config()
import * as mariadb from "mariadb"
import Redis from "ioredis"
const redis = new Redis();
import fetch from '@adobe/node-fetch-retry'
import { insertIntoRedis } from "./redis.js"
import { getMods } from "./mods.js"

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: 100
})

async function fetchLeaderboardsV1(skip = 0, mode = 0, fix = false) {
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

    if (fix) {
        let connec
        connec = await pool.getConnection()
        const rows = await connec.query(`select beatmap_id from osu.beatmap where mode=${mode} and approved > 0 and approved != 3 and beatmap_id not in (select distinct beatmap_id from scores${modeString})`)
        beatmapIds = rows.map(row => row.beatmap_id)
        console.log(mode, "fixing", beatmapIds.length, "missing maps")
        if (connec) connec.release()
    }

    let bidx
    let scoresToInsert = []
    let beatmapsToFetch = []
    let beatmapsToUpdate = []
    let checkedScoreIds = []

    for (const [idx, beatmap_id] of beatmapIds.entries()) {
        beatmapsToFetch.push(beatmap_id)
        beatmapsToUpdate.push(beatmap_id)

        let conn
        if (beatmapsToFetch.length >= 4 || idx + 1 == beatmapIds.length) {
            try {
                const reqs = beatmapsToFetch.map(async id => {
                    return await fetch(`https://osu.ppy.sh/api/get_scores?k=${process.env.OSU_API_KEY}&b=${id}&m=${mode}&limit=100`, {
                        retryOptions: {
                            retryMaxDuration: 300000,
                            retryInitialDelay: 1000,
                            retryOnHttpResponse: function (response) {
                                if ((response.status >= 500) || response.status == 429) {
                                    return true;
                                }
                            }
                        }
                    })
                })
                const results = await Promise.all(reqs)

                for (const [ndx, response] of results.entries()) {
                    bidx = ndx
                    const beatmapScores = await response.json()
                    for (const [index, score] of beatmapScores.entries()) {
                        const position = index + 1
                        const mods = getMods(score.enabled_mods)

                        scoresToInsert.push([
                            beatmapsToFetch[ndx],
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

                        checkedScoreIds.push(score.score_id)
                    }
                }
                beatmapsToFetch = []
                if (scoresToInsert.length >= 20000 || idx + 1 == beatmapIds.length) {
                    conn = await pool.getConnection()

                    // Insert checked score_ids
                    const trunc = await conn.query(`TRUNCATE checked_score_ids${modeString}`)
                    console.log(mode, "truncated ", trunc.affectedRows, ` rows from checked_score_ids${modeString}`)
                    const ins = await conn.batch(`INSERT INTO checked_score_ids${modeString} VALUES (?) ON DUPLICATE KEY UPDATE score_id = score_id`, checkedScoreIds)
                    console.log(mode, `(${idx + 1}/${beatmapIds.length})`, "added", ins.affectedRows, "score_ids")

                    // Insert scores
                    const res = await conn.batch(`INSERT INTO scores${modeString} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE score_id = score_id`, scoresToInsert)
                    console.log(mode, `(${idx + 1}/${beatmapIds.length})`, "added", res.affectedRows, "scores")
                    const upd = await conn.query(`UPDATE scores${modeString} s
                    INNER JOIN (
                        SELECT score_id, ROW_NUMBER() OVER (PARTITION BY beatmap_id ORDER BY score DESC, score_id) pos
                        FROM scores${modeString} WHERE beatmap_id IN (?)
                    ) r ON r.score_id = s.score_id
                    SET s.position = r.pos`, [beatmapsToUpdate])
                    console.log(mode, `Updated positions for`, upd.affectedRows, "scores")
                    scoresToInsert = []
                    beatmapsToFetch = []
                    beatmapsToUpdate = []
                    checkedScoreIds = []
                }
            } catch (e) {
                console.error(e)
                console.log(mode, beatmapsToFetch[bidx], "Couldn't fetch scores, continuing with next beatmap.")

                continue
            } finally {
                if (conn) conn.release()
            }
        }
    }

    console.log(mode, "done.")
    if (!fix) {
        await insertIntoRedis(true, modeString)
    }
    return
}

async function setLastUpdate() {
    await redis.set("last_update", new Date().toISOString())
    return
}

export { fetchLeaderboardsV1, setLastUpdate }
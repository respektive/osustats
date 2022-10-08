import * as dotenv from 'dotenv'
dotenv.config()
import * as mariadb from "mariadb"
import axios from "axios"

async function fetchLeaderboardsV1(skip = 0) {
    const conn = await mariadb.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE
    })

    const beatmapsRes = await axios.get("https://osu.respektive.pw/beatmaps")
    const beatmaps = beatmapsRes.data
    const beatmapIds = beatmaps.ranked.beatmaps.concat(beatmaps.loved.beatmaps)

    let scoresToInsert = []
    let beatmapsToClear = []

    for (const [idx, beatmap_id] of beatmapIds.slice(skip).entries()) {
        beatmapsToClear.push(beatmap_id)

        const response = await axios.get(`https://osu.ppy.sh/api/get_scores?k=${process.env.OSU_API_KEY}&b=${beatmap_id}&m=0&limit=100`)
        const beatmapScores = response.data

        for (const [index, score] of beatmapScores.entries()) {
            const position = index + 1

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
            ])
        }

        if (scoresToInsert.length >= 2500 || idx + 1 == beatmapIds.slice(skip).length) {
            await conn.query("DELETE FROM scores WHERE beatmap_id IN (?)", [beatmapsToClear])
            const res = await conn.batch("INSERT INTO scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", scoresToInsert)
            console.log(new Date, `[${idx + 1}/${beatmapIds.slice(skip).length}]`, "added", res.affectedRows, "scores for beatmap_ids", beatmapsToClear)
            scoresToInsert = []
            beatmapsToClear = []
        }
    }

    console.log("done.")
    conn.end()
}

export { fetchLeaderboardsV1 }
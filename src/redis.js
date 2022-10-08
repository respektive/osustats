import * as dotenv from 'dotenv'
dotenv.config()
import * as mariadb from "mariadb"
import Redis from "ioredis"
const redis = new Redis();

const QUERY = `SELECT user_id, username,
SUM(CASE WHEN position=1 THEN 1 ELSE 0 END) AS top1s,
SUM(CASE WHEN position<=8 THEN 1 ELSE 0 END) AS top8s,
SUM(CASE WHEN position<=25 THEN 1 ELSE 0 END) AS top25s,
SUM(CASE WHEN position<=50 THEN 1 ELSE 0 END) AS top50s
FROM scores GROUP BY user_id ORDER BY top50s DESC`

async function insertIntoRedis() {
    const conn = await mariadb.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE
    })

    const rows = await conn.query(QUERY)

    for (const row of rows) {
        redis.zadd("top50s", parseInt(row.top50s), row.user_id)
        redis.zadd("top25s", parseInt(row.top25s), row.user_id)
        redis.zadd("top8s", parseInt(row.top8s), row.user_id)
        redis.zadd("top1s", parseInt(row.top1s), row.user_id)
        redis.set(`user_${row.user_id}`, row.username)
    }

    console.log("done.")
    conn.end()
    process.exit(0)
}

async function getRankings(type = "top50s", limit = -1, offset = 0) {
    try {
        if (limit >= 0) {
            limit = parseInt(limit) + parseInt(offset)
        }

        const ranking = await redis.zrevrange(type, offset, limit, "WITHSCORES")

        const leaderboard = []
        for (let i = 0; i < ranking.length; i += 2) {
            let data = {}
            data["rank"] = await redis.zrevrank(type, ranking[i]) + 1
            data["user_id"] = parseInt(ranking[i])
            data["username"] = await redis.get(`user_${ranking[i]}`)
            data[type] = parseInt(ranking[i + 1])

            leaderboard.push(data)
        }

        return leaderboard
    } catch (e) {
        return { "error": e.message }
    }
}

async function getCounts(user_id) {
    try {
        let data = {}
        data["user_id"] = parseInt(user_id)
        data["username"] = await redis.get(`user_${user_id}`)
        data["top50s"] = parseInt(await redis.zscore("top50s", user_id))
        data["top25s"] = parseInt(await redis.zscore("top25s", user_id))
        data["top8s"] = parseInt(await redis.zscore("top8s", user_id))
        data["top1s"] = parseInt(await redis.zscore("top1s", user_id))

        return data
    } catch (e) {
        return { "error": e.message }
    }
}

export { insertIntoRedis, getRankings, getCounts }

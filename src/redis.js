import * as dotenv from 'dotenv'
dotenv.config()
import * as mariadb from "mariadb"
import Redis from "ioredis"
const redis = new Redis();

import axios from "axios"
import axiosRetry from 'axios-retry';
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay })

const COUNTS = [1, 8, 25, 50]

async function insertIntoRedis(clear = false) {
    const conn = await mariadb.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE
    })

    for (const count of COUNTS) {
        const type = `top${count}s`

        const query = `SELECT user_id, username, COUNT(score_id) AS ${type} FROM scores WHERE position <= ${count} GROUP BY user_id ORDER BY ${type} DESC`
        const rows = await conn.query(query)
        console.log(type, "MariaDB Row Count:", rows.length)

        if (clear === true) {
            await redis.del(type)
        }

        for (const row of rows) {
            if (!await redis.hget(row.user_id, "country")) {
                const res = await axios.get(`https://osu.ppy.sh/api/get_user?k=${process.env.OSU_API_KEY}&u=${row.user_id}&type=id`)
                const user = res.data[0]
                redis.hset(row.user_id, { username: row.username, country: user?.country ?? null })
            } else {
                redis.hset(row.user_id, { username: row.username })
            }
            redis.zadd(type, parseInt(row[type]), row.user_id)
        }
    }

    console.log("done.")
    conn.end()
}

async function getRankings(type = "top50s", limit = 50, offset = 0) {
    try {
        if (limit >= 0) {
            limit = parseInt(limit) + parseInt(offset)
        }

        const ranking = await redis.zrevrange(type, offset, limit - 1, "WITHSCORES")

        const leaderboard = []
        for (let i = 0; i < ranking.length; i += 2) {
            let data = {}
            const [username, country] = await redis.hmget(ranking[i], ["username", "country"])
            data["rank"] = await redis.zrevrank(type, ranking[i]) + 1
            data["user_id"] = parseInt(ranking[i])
            data["username"] = username
            data["country"] = country
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
        const [username, country] = await redis.hmget(user_id, ["username", "country"])
        data["user_id"] = parseInt(user_id)
        data["username"] = username
        data["country"] = country
        data["top50s"] = parseInt(await redis.zscore("top50s", user_id)) ?? 0
        data["top25s"] = parseInt(await redis.zscore("top25s", user_id)) ?? 0
        data["top8s"] = parseInt(await redis.zscore("top8s", user_id)) ?? 0
        data["top1s"] = parseInt(await redis.zscore("top1s", user_id)) ?? 0

        return data
    } catch (e) {
        return { "error": e.message }
    }
}

export { insertIntoRedis, getRankings, getCounts }

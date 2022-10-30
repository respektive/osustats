import * as dotenv from 'dotenv'
dotenv.config()
import * as mariadb from "mariadb"
import Redis from "ioredis"
const redis = new Redis();

import axios from "axios"
import axiosRetry from 'axios-retry';
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay })

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: 10
})

const COUNTS = [1, 8, 15, 25, 50]

async function insertIntoRedis(clear = false) {
    let conn
    try {
        conn = await pool.getConnection()
        for (const count of COUNTS) {
            const type = `top${count}s`

            const query = `SELECT user_id, username, COUNT(score_id) AS ${type} FROM scores WHERE position <= ${count} GROUP BY user_id ORDER BY ${type} DESC`
            const rows = await conn.query(query)
            console.log(`[${new Date().toISOString()}]`, type + ":", "MariaDB Row Count:", rows.length)

            if (clear === true) {
                await redis.del(type)
            }
            let total = rows.length
            console.log(`[${new Date().toISOString()}]`, type + ":", `inserting ${total} users into redis...`)
            let counter = 0
            for (const row of rows) {
                if (!await redis.hget(row.user_id, "country")) {
                    const res = await axios.get(`https://osu.ppy.sh/api/get_user?k=${process.env.OSU_API_KEY}&u=${row.user_id}&type=id`)
                    const user = res.data[0]
                    await redis.hset(row.user_id, { username: row.username, country: user?.country ?? null })
                    await redis.hset(row.username.toLowerCase(), { user_id: row.user_id })
                    await conn.query("INSERT INTO user_countries VALUES (?, ?) ON DUPLICATE KEY UPDATE country = ?", [row.user_id, user?.country ?? null, user?.country ?? null])
                } else {
                    await redis.hset(row.user_id, { username: row.username })
                    await redis.hset(row.username.toLowerCase(), { user_id: row.user_id })
                }
                await redis.zadd(type, parseInt(row[type]), row.user_id)
                counter += 1
                console.log(`[${new Date().toISOString()}]`, `(${counter}/${total})`, row.user_id, row.username)
            }
            console.log(`[${new Date().toISOString()}]`, type + ":", "done inserting into redis.")
        }

        console.log(`[${new Date().toISOString()}]`, "done updating.")
    } catch (e) {
        console.error(`[${new Date().toISOString()}]`, e)
        console.log(`[${new Date().toISOString()}]`, "Something went wrong when trying to insert into redis, check error logs.")
    } finally {
        if (conn) conn.release()
    }
}

async function runSQL(query, params) {
    let conn
    try {
        conn = await pool.getConnection()
        return await conn.query(query, params)
    } catch (e) {
        return { "error": e.message }
    } finally {
        if (conn) conn.release()
    }
}

async function getRankings(type = "top50s", limit = 50, offset = 0) {
    try {
        if (limit >= 0) {
            limit = parseInt(limit) + parseInt(offset)
        }

        const ranking = await redis.zrevrange(type, offset, limit - 1, "WITHSCORES")
        const beatmaps = await axios.get("https://osu.respektive.pw/amount")

        const leaderboard = []
        for (let i = 0; i < ranking.length; i += 2) {
            let data = {}
            const [username, country] = await redis.hmget(ranking[i], ["username", "country"])
            data["rank"] = await redis.zrevrank(type, ranking[i]) + 1
            data["user_id"] = parseInt(ranking[i])
            data["username"] = username
            data["country"] = country
            data[type] = parseInt(ranking[i + 1])
            data["beatmaps_amount"] = beatmaps.data[0]["loved+ranked"]

            leaderboard.push(data)
        }

        return leaderboard
    } catch (e) {
        return { "error": e.message }
    }
}

async function getRankingsSQL(type, query, params, offset, beatmap) {
    let conn
    try {
        conn = await pool.getConnection()
        const rows = await conn.query(query, params)
        const beatmap_rows = await conn.query(beatmap.query, beatmap.params)

        const leaderboard = []
        for (const [index, row] of rows.entries()) {
            let data = {
                "beatmaps_amount": parseInt(beatmap_rows[0]["beatmaps_amount"]),
            }
            const [username, country] = await redis.hmget(row.user_id, ["username", "country"])
            data["rank"] = parseInt(offset) + (index + 1)
            data["user_id"] = parseInt(row.user_id)
            data["username"] = username
            data["country"] = country
            data[type] = parseInt(row[type] ?? 0)

            leaderboard.push(data)
        }

        return leaderboard
    } catch (e) {
        return { "error": e.message }
    } finally {
        if (conn) conn.release()
    }
}

async function getCounts(user_id) {
    try {
        const beatmaps = await axios.get("https://osu.respektive.pw/amount")

        let data = {
            "beatmaps_amount": beatmaps.data[0]["loved+ranked"],
        }
        const [username, country] = await redis.hmget(user_id, ["username", "country"])
        if (!username)
            return { "error": "user not found" }
        data["user_id"] = parseInt(user_id)
        data["username"] = username
        data["country"] = country
        for (const count of COUNTS) {
            const type = `top${count}s`
            data[type] = parseInt(await redis.zscore(type, user_id) ?? 0)
            const type_rank = parseInt(await redis.zrevrank(type, user_id))
            data[`${type}_rank`] = isNaN(type_rank) ? null : type_rank + 1
        }

        return data
    } catch (e) {
        return { "error": e.message }
    }
}

async function getCountsSQL(query, params, custom_rank) {
    let conn
    try {
        conn = await pool.getConnection()
        const rows = await conn.query(query, params)
        const row = rows[0]
        let data = {
            "beatmaps_amount": parseInt(row["beatmaps_amount"]),
        }
        const [username, country] = await redis.hmget(row.user_id, ["username", "country"])
        if (!username)
            return { "error": "user not found" }
        data["user_id"] = parseInt(row.user_id)
        data["username"] = username
        data["country"] = country
        for (const count of COUNTS) {
            const type = `top${count}s`
            data[type] = parseInt(row[type] ?? 0)
        }
        if (custom_rank && parseInt(custom_rank[0])) {
            if (custom_rank.length == 1) {
                data[`rank_${parseInt(custom_rank[0])}`] = parseInt(row[`rank_${parseInt(custom_rank[0])}`] ?? 0)
            } else {
                data[`rank_${parseInt(custom_rank[0]) + "-" + parseInt(custom_rank[1])}`] = parseInt(row[`rank_${parseInt(custom_rank[0]) + "-" + parseInt(custom_rank[1])}`] ?? 0)
            }
        }

        return data
    } catch (e) {
        return { "error": e.message }
    } finally {
        if (conn) conn.release()
    }
}

async function getLastUpdate() {
    try {
        return await redis.get("last_update")
    } catch (e) {
        return { "error": e.message }
    }
}

async function getUserId(username) {
    try {
        return await redis.hget(username.toLowerCase(), "user_id")
    } catch (e) {
        return { "error": e.message }
    }
}

export { insertIntoRedis, runSQL, getRankings, getRankingsSQL, getCounts, getCountsSQL, getLastUpdate, getUserId }

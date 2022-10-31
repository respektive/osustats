import * as dotenv from 'dotenv'
dotenv.config()
import * as mariadb from "mariadb"
import Redis from "ioredis"
const redis = new Redis();

async function main() {
    const conn = await mariadb.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE
    })

    const users = await redis.zrevrange("top50s", 0, -1)

    let users_to_insert = []
    for (const user of users) {
        const country = await redis.hget(user, "country")
        users_to_insert.push([
            user,
            country,
            country
        ])
    }
    const res = await conn.batch("INSERT INTO user_countries VALUES (?, ?) ON DUPLICATE KEY UPDATE country = ?", users_to_insert)
    console.log(res)
    process.exit(0)
}

main()
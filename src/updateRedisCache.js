import { insertIntoRedis } from "./redis.js"

const args = process.argv.slice(2)
let clear = true
if (args[0] && args[0] == "false")
    clear = false


async function main() {
    console.time("Redis Update")
    await insertIntoRedis(clear, "")
    await insertIntoRedis(clear, "_catch")
    await insertIntoRedis(clear, "_taiko")
    await insertIntoRedis(clear, "_mania")
    console.timeEnd("Redis Update")
    process.exit(0)
}

main()
import { insertIntoRedis } from "./redis.js"

const args = process.argv.slice(2)
let clear = true
let mode
if (args[0] && args[0] == "false")
    clear = false
if (args[1])
    mode = args[1]


async function main() {
    console.time("Redis Update")
    if (mode) {
        if (mode == "osu") mode = ""
        await insertIntoRedis(clear, mode)
    } else {
        await insertIntoRedis(clear, "")
        await insertIntoRedis(clear, "_taiko")
        await insertIntoRedis(clear, "_catch")
        await insertIntoRedis(clear, "_mania")
    }
    console.timeEnd("Redis Update")
    process.exit(0)
}

main()
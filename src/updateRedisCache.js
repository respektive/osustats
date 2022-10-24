import { insertIntoRedis } from "./redis.js"

const args = process.argv.slice(2)
let clear = true
if (args[0] && args[0] == "false")
    clear = false

insertIntoRedis(clear)
import { fetchLeaderboardsV1 } from "./fetcher.js"

const args = process.argv.slice(2)
let skip = 0
if (args[0])
    skip = args[0]

fetchLeaderboardsV1(skip)
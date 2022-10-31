import { fetchLeaderboardsV1 } from "./fetcher.js"

const args = process.argv.slice(2)
let skip = 0
let mode
if (args[0])
    skip = args[0]
if (args[1])
    mode = args[1]

if (mode) {
    fetchLeaderboardsV1(skip, mode)
} else {
    fetchLeaderboardsV1(skip, 0)
    fetchLeaderboardsV1(skip, 1)
    fetchLeaderboardsV1(skip, 2)
    fetchLeaderboardsV1(skip, 3)
}

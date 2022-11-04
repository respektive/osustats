import { fetchLeaderboardsV1, setLastUpdate } from "./fetcher.js"

const args = process.argv.slice(2)
let skip = 0
let mode
let fix = false
if (args[0])
    skip = args[0]
if (args[1])
    mode = args[1]
if (args[2])
    fix = true

async function main() {
    console.time("Fetcher")
    if (mode) {
        await fetchLeaderboardsV1(skip, mode, fix)
    } else {
        await Promise.all([
            fetchLeaderboardsV1(skip, 0),
            fetchLeaderboardsV1(skip, 1),
            fetchLeaderboardsV1(skip, 2),
            fetchLeaderboardsV1(skip, 3),
        ])
        if (skip == 0)
            await setLastUpdate()
    }
    console.timeEnd("Fetcher")
    process.exit(0)
}

main()
import { fetchLeaderboardsV1, setLastUpdate } from "./fetcher.js"

const args = process.argv.slice(2)
let skip = 0
let mode
if (args[0])
    skip = args[0]
if (args[1])
    mode = args[1]

async function main() {
    console.time("Fetcher")
    if (mode) {
        await fetchLeaderboardsV1(skip, mode)
    } else {
        await Promise.all([
            fetchLeaderboardsV1(skip, 0),
            fetchLeaderboardsV1(skip, 1),
            fetchLeaderboardsV1(skip, 2),
            fetchLeaderboardsV1(skip, 3),
        ])
        await setLastUpdate()
    }
    console.timeEnd("Fetcher")
    process.exit(0)
}

main()
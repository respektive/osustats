import * as cron from "node-cron"
import { fetchLeaderboardsV1, setLastUpdate } from "./fetcher.js"
import "./api.js"

// run every night at midnight.
cron.schedule("0 0 * * *", async () => {
    await Promise.all([
        fetchLeaderboardsV1(0, 0),
        fetchLeaderboardsV1(0, 1),
        fetchLeaderboardsV1(0, 2),
        fetchLeaderboardsV1(0, 3),
    ])
    await setLastUpdate()
})
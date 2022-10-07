import * as cron from "node-cron"
import { fetchLeaderboardsV1 } from "./fetcher.js"
import "./api.js"

// run every night at midnight.
cron.schedule("0 0 * * *", fetchLeaderboardsV1)
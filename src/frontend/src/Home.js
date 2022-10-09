import { useEffect, useState } from 'react'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'

export default function Home() {
    const [ranking, setRanking] = useState([])
    const [page, setPage] = useState(1)

    const fetchRankings = async () => {
        const res = await fetch(`https://osustats.respektive.pw/rankings/top50s?page=${page}`)
        const lb = await res.json()
        setRanking(lb)
    }

    useEffect(() => {
        fetchRankings()
    }, [page, setPage])

    return (
        <Grid
            container
            spacing={0}
            align="center"
            justify="center"
            direction="column"
        >
            <Grid item sx={{ pt: 10, pl: 25, pr: 25 }}>
                <Paper sx={{ padding: 5 }}>
                    <Typography variant="h4" sx={{ p: 1 }}>Top 50s</Typography>
                    <Stack direction="row" spacing={2} justifyContent="center" alignItems="center" sx={{ pb: 2 }}>
                        <Button disabled={(page <= 1)} variant="contained" onClick={() => { setPage(page - 1) }}>PREV</Button>
                        <Button variant="contained" onClick={() => { setPage(page + 1) }}>NEXT</Button>
                    </Stack>
                    <Stack spacing={1} justifyContent="center" alignItems="center">
                        {ranking.map((e, i) => {
                            return (
                                <Paper elevation={3} sx={{ p: 1 }}>
                                    <Typography>#{e.rank} <Link href={`https://osu.ppy.sh/users/${e.user_id}`}>{e.username}</Link> {Number(e.top50s).toLocaleString()}</Typography>
                                </Paper>
                            )
                        })}
                    </Stack>
                    <Stack direction="row" spacing={2} justifyContent="center" alignItems="center" sx={{ pt: 2 }}>
                        <Button disabled={(page <= 1)} variant="contained" onClick={() => { setPage(page - 1) }}>PREV</Button>
                        <Button variant="contained" onClick={() => { setPage(page + 1) }}>NEXT</Button>
                    </Stack>
                </Paper>
            </Grid>
        </Grid>
    )
}

# osustats
API endpoints for osu! leaderboard position counts. https://osustats.respektive.pw/

__Still very WIP__

### Running your own

You will need some beatmap table to use the beatmap filters.
For example: https://github.com/respektive/osu-beatmap-database/

### Usage

#### Rankings endpoints with optional parameters:
```
https://osustats.respektive.pw/rankings/top50s?page=5
https://osustats.respektive.pw/rankings/top25s?limit=100&offset=500
https://osustats.respektive.pw/rankings/top8s?page=3&limit=100
https://osustats.respektive.pw/rankings/top1s
```
#### Counts endoint:
```
https://osustats.respektive.pw/counts/9217626
```

#### Beatmap parameters:
```
from=2010-01-01, to=2020-01-01, length_min=60, length_max=300, spinners_min=1, spinners_max=10,
star_rating=1-5, tags=andrea // tags one is kinda broken idk.

Example:
https://osustats.respektive.pw/counts/39828?length_min=60&length_max=300&star_rating=1-5&from=2010-01-01&to=2013-01-01
https://osustats.respektive.pw/rankings/top8s?spinners_max=1&tags=andrea
```

#### Last Update endpoint:
```
https://osustats.respektive.pw/last_update
```

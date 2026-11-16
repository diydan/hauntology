# Spike game-songs 1: the Song Service (Mureka)

Date: 2026-11-16. Script: three template lyrics (a Moment Song, the Ballad, a Clue Song) sent to `POST https://api.mureka.ai/v1/song/generate` with `model: "auto"` (it answered `mureka-9.5`), then polled at `GET /v1/song/query/{id}` every 5 s.

| Song | Time to ready | Versions | Length | Size |
|---|---|---|---|---|
| Moment (joined the haunting) | 44 s | 2 | 118 s, 150 s | 3.8, 4.8 MB |
| Ballad (the ending) | 51 s | 2 | 157 s, 182 s | 5.0, 5.8 MB |
| Clue (ambient) | 51 s | 2 | 164 s, 172 s | 5.2, 5.5 MB |

Findings:

1. A song takes about 45 to 50 s. A Moment Song cannot play at its moment; it plays at the next Song Slot, as Requirement 1.1 says. The Ballad, asked for at the last Round, is ready long before the ending.
2. Each request gives two versions; the Room needs one. Pick the first, or the shorter.
3. Songs come out 2 to 3 minutes long even for short lyrics. A Moment Song needs to be cut (a fade after the first chorus, about 30 s), or the API's length option, if it has one, must be found.
4. Three requests ran at once; the account allows 5 at once (`concurrent_request_limit`).
5. Price: the account's billing reads `total_spending` 6042 and `balance` 96957 (units not stated by the API; check the Mureka dashboard for the price of one song).
6. The owner listened to all six on 2026-11-16: all are good, names included.
7. Still open: the price of one song (Mureka dashboard) and the licence for use in a sold game (Mureka's terms).

The files are not committed (about 30 MB); they were copied to the owner's Downloads folder for listening.

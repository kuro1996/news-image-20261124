[![make.fun](https://make.fun/badge/news-image-20261124.svg)](https://make.fun/bounty/news-image-20261124)
[![rank](https://make.fun/badge/news-image-20261124/kuro1996/news-image-20261124/rank.svg)](https://make.fun/bounty/news-image-20261124)
[![reward](https://make.fun/badge/news-image-20261124/kuro1996/news-image-20261124/reward.svg)](https://make.fun/bounty/news-image-20261124)

# news-image-20261124 — The World in One Day

Sums up Tuesday 24 November 2026 in one 1024x1024 newspaper front page:
35 stories, 9 regions, every one dated. Huawei guilty on 10 of 12 counts,
four tankers hit by mines in the Strait of Hormuz, and Ukraine's drone
strikes on Russian ships lead the day, with a UTC timeline, six big-number
stats, a region bar, ten sourced stories, 22 more, and a world map with
numbered pins.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` runs on Node 22 with the standard library only and no network.
It draws the image procedurally (hand-built vector stroke font, flat vector
scenes, a simplified world map, and a from-scratch PNG encoder) and writes
`/output/entry.png` (or `$MAKEFUN_OUTPUT_DIR/entry.png`). Two runs write
byte-identical files.

## Entry

- Competition: https://make.fun/bounty/news-image-20261124
- Program: `main.ts` (Node 22, stdlib only, no network)
- Output: `entry.png`, 1024x1024 PNG, under 1 MiB, deterministic

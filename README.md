# Squares in a square

A local viewer for the best known packings of n unit squares into the smallest square.

    npm install
    npm run dev          # first run downloads the data, then opens on n = 17

## Data

All packings come from David Ellsworth's catalog,
https://kingbird.myphotos.cc/packing/squares_in_squares.html (which took over Erich Friedman's page).

`npm run fetch-data` downloads the catalog and its SVGs once into `data-cache/`. Add `-- --refresh` to download them again.
It then turns each SVG into a list of unit squares (centre + angle) in `src/data/packings.json`.
Both folders are gitignored: the catalog states no licence, so ask its author before publishing the data.

`npm run validate` checks every packing: right number of squares, no overlaps, all inside the box.
`npm run build` runs it first.

## Keys

← / →  previous / next n
/  type an n
c  overlay the ⌈√n⌉ grid
0  reset zoom
g  switch between plate and gallery

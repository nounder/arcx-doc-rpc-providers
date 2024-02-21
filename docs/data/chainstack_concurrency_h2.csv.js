import fs from "node:fs"
import * as d3 from "d3"

const files = [
  ["chainstack,concurrency,limits,b=98,c=98.csv", 98],
  ["chainstack,concurrency,limits,b=99,c=99.csv", 99],
  ["chainstack,concurrency,limits,b=100,c=100.csv", 100],
  ["chainstack,concurrency,limits,b=101,c=101.csv", 101],
  ["chainstack,concurrency,limits,b=102,c=102.csv", 102],
]

const allRows = files
  .map(([file, n]) => {
    const rows = d3.csvParse(
      fs.readFileSync(import.meta.dirname + "/" + file, "utf-8"),
    )

    const epoch = d3.min(rows, (d) => new Date(d.start))

    return rows.map((v) => ({
      concurrency: n,

      ...v,
      i: +v[""],
      start: new Date(v.start) - epoch,
      end: new Date(v.end) - epoch,
      duration: new Date(v.end) - new Date(v.start),
    }))
  })
  .reduce((a, v) => a.concat(v), [])

process.stdout.write(d3.csvFormat(allRows))

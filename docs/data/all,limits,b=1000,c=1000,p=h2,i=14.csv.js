import fs from "node:fs"
import * as d3 from "d3"

function readProviderCsv(provider) {
  const rows = d3.csvParse(
    fs.readFileSync(
      import.meta.dirname + `/${provider},limits,b=1000,c=1000,p=h2,i=14.csv`,
      "utf-8",
    ),
  )

  const epoch = d3.min(rows, (d) => new Date(d.start))

  return rows.map((v) => ({
    provider,

    ...v,
    i: +v[""],
    start: new Date(v.start) - epoch,
    end: new Date(v.end) - epoch,
    duration: new Date(v.end) - new Date(v.start),
  }))
}

const allRows = [
  readProviderCsv("alchemy"),
  readProviderCsv("chainstack"),
  readProviderCsv("quicknode"),
].reduce((a, v) => a.concat(v), [])

process.stdout.write(d3.csvFormat(allRows))

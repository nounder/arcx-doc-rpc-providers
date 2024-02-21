import fs from "node:fs"
import * as d3 from "d3"

function readProviderCsv(provider, proto, cn) {
  const rows = d3.csvParse(
    fs.readFileSync(
      import.meta.dirname + `/${provider},b=1000,c=100,p=${proto},i=${cn}.csv`,
      "utf-8",
    ),
  )

  const epoch = d3.min(rows, (d) => new Date(d.start))

  return rows.map((v) => ({
    provider,
    proto,
    cn,

    ...v,
    i: +v[""],
    start: new Date(v.start) - epoch,
    end: new Date(v.end) - epoch,
    duration: new Date(v.end) - new Date(v.start),
  }))
}

const allRows = [
  readProviderCsv("alchemy", "h2", 3),
  readProviderCsv("chainstack", "h2", 3),
  readProviderCsv("quicknode", "h2", 3),
].reduce((a, v) => a.concat(v), [])

process.stdout.write(d3.csvFormat(allRows))

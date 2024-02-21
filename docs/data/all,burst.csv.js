import fs from "node:fs"
import fg from "fast-glob"
import * as d3 from "d3"

const files = fg.globSync(import.meta.dirname + "/*,burst,*.csv")

const extractFilenameProps = (path) =>
  path
    .split("/")
    .pop()
    .split(".")[0]
    .split(",")
    .reduce(
      (acc, e, i) => (
        (acc[/=/.test(e) ? e.split("=")[0] : i] = /=/.test(e)
          ? e.split("=")[1]
          : e),
        acc
      ),
      {},
    )

const allRows = files
  .map((f) => [f, fs.readFileSync(f, "utf-8")])
  .map(([f, c]) => [f, d3.csvParse(c)])
  .map(([f, rows]) => {
    const { 0: provider, i: cn, c, p } = extractFilenameProps(f)

    const epoch = d3.min(rows, (d) => new Date(d.start))

    return rows.map((v) => ({
      provider,
      proto: p,
      concurrency: c,
      cn,

      ...v,
      i: +v[""],

      start: new Date(v.start) - epoch,
      end: new Date(v.end) - epoch,
      duration: new Date(v.end) - new Date(v.start),
    }))
  })
  .reduce((a, v) => a.concat(v), [])

process.stdout.write(d3.csvFormat(allRows))

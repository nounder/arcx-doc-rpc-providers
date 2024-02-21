import * as d3 from "npm:d3"
import * as Plot from "npm:@observablehq/plot"
import { FileAttachment } from "npm:@observablehq/stdlib"

export function plotProviderData(data) {
  const providerTimes = d3.rollup(
    data,
    (g) => [d3.min(g, (d) => d.start), d3.min(g, (d) => d.end)],
    (d) => d.provider,
  )

  return Plot.plot({
    height: 600,
    x: { axis: false },
    //y: { nice: true },
    marks: [
      Plot.frame(),
      Plot.axisY({ label: "# Request", interval: 50 }),
      Plot.axisX({ label: "Time", ticks: 0 }),
      Plot.rectX(data, {
        x1: (d, i) => d.start - providerTimes.get(d.provider)[0],
        x2: (d, i) => d.start - providerTimes.get(d.provider)[0] + d.duration,
        y: (d) => d.i,
        fx: "provider",
        fill: (d) => (d.error ? "red" : "currentColor"),
      }),
      // Plot.line(requestsTidy, {
      //   x: (d, i) => d.start - providerTimes.get(d.provider)[0],
      //   y: (d, i) => i,
      //   stroke: "red"
      // })
    ],
  })
}

export async function plotDurationPerConcurrency(data, limit = NaN) {
  return Plot.plot({
    y: { label: "Response time (ms)" },
    grid: true,
    marks: [
      ...(!isNaN(limit)
        ? [
            Plot.ruleX([limit], {
              stroke: "red",
            }),

            Plot.text(["limit"], {
              x: limit,
              dx: 10,
              fill: "red",
              lineWidth: 20,
              frameAnchor: "top",
              textAnchor: "start",
            }),
          ]
        : []),

      Plot.dot(data, {
        x: "concurrency",
        y: "duration",
        r: 1,
        stroke: "duration",
      }),

      Plot.crosshairY(data, { y: "duration" }),

      Plot.dot(data, {
        filter: (d) => d.error,
        x: "concurrency",
        y: "duration",
        stroke: "red",
        symbol: "times",
      }),

      Plot.lineX(
        data,
        Plot.groupX(
          { y: "median" },
          {
            x: "concurrency",
            y: "duration",
            curve: "catmull-rom",
          },
        ),
      ),
    ],
  })
}

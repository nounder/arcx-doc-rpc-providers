import * as d3 from "npm:d3"
import * as Plot from "npm:@observablehq/plot";

export function plotProviderData(data) {
  const providerTimes = d3.rollup(
    data,
    (g) => [d3.min(g, (d) => d.start), d3.min(g, (d) => d.end)],
    (d) => d.provider
  );

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
        fill: (d) => (d.error ? "red" : "currentColor")
      })
      // Plot.line(requestsTidy, {
      //   x: (d, i) => d.start - providerTimes.get(d.provider)[0],
      //   y: (d, i) => i,
      //   stroke: "red"
      // })
    ]
  });
}

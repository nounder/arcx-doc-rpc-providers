# Ethereum RPC Providers Analysis

This document outlines performance and network characteristics of three Ethereum
RPC providers: Alchemy, QuickNode, Chainstack.

First, we compare performance of HTTP/1.1 and HTTP/2 in terms of latency,
response time, and concurrency. We try to address any unexpected behavior for
each provider.

Then we compare advertised rate limits with our tests.

## Methodology

All benchmarks were run on Google Cloud in Jakarta datacenter. terts

## Protocol performance

To test performance between protocols, we benchmarked Alchemy API with 100
concurrent requests per protocol (HTTP/1, HTTP/2) per number of active clients
(1, 3).

Each active client maintains separate pool of TCP connection to each origin.

```js
const data = await FileAttachment(
  "data/alchemy_by_proto_cn,b=1000,c=100.csv",
).csv({
  typed: true,
})

const fx = "proto"
const fy = "cn"
const fk = (d) => `${d[fy]}x${d[fx]}`

display(
  Plot.plot({
    caption:
      "Request waterfall graphs for 1000 eth_getBlockByNumber calls limited to 100 concurrent requests made to Alchemy RPC.",
    height: 600,
    x: { axis: false },
    fx: { label: "Protocol" },
    fy: { label: "Clients" },
    //y: { nice: true },
    marks: [
      Plot.frame(),
      Plot.axisY({ label: "# Request", interval: 100 }),
      Plot.axisX({ label: "Time", ticks: 0 }),
      Plot.rectX(data, {
        filter: (d) => d.provider === "alchemy",

        fx,
        fy,

        x1: (d, i) => d.start,
        x2: (d, i) => d.start + d.duration,
        y: (d) => d.i,

        fill: (d) => (d.error ? "red" : "currentColor"),
      }),
    ],
  }),
)
```

Following can be observed:

- Single HTTP/1.1 client is slower than three HTTP/1.1 clients and 2.5x slower
  than single HTTP/2 client.
- Three HTTP/2 clients are slower than single HTTP/2 connection due to
  connection handshaking.
- Response times in HTTP/2 have less variance than multi-client HTTP/1.1.
- Straight line slope in HTTP/2 signifies stable performance made across
  requests.

Performance is similar across all providers, except for single-client HTTP/2
Chainstack (see below.)

### Chainstack H/2 concurrency

For Chainstack test with `cn=1 cr=100` (client number and concurrent requests,
respectively), all requests failed with `ConnectionTerminated` just after
establishing a connection. After adjusting `cn` parameter, all requests
succeeded. As it turns out, Chainstack H/2 servers have very small limit on
concurrent requests.

```js
const data = await FileAttachment(
  "data/alchemy_by_proto_cn,b=1000,c=100.csv",
).csv({
  typed: true,
})

display(
  Plot.plot({
    caption:
      "Chainstack: 100 concurrent HTTP/2 requests: single vs three clients. Red means request error.",
    height: 200,
    x: { axis: false },
    marks: [
      Plot.frame(),

      Plot.axisY({ label: "# Request", interval: 100 }),
      Plot.axisX({ label: "Time", ticks: 0 }),

      Plot.rectX(data, {
        filter: (d) => d.provider == "chainstack" && d.proto == "h2",

        x1: (d, i) => d.start,
        x2: (d, i) => d.start + d.duration,
        y: (d) => d.i,

        fx: "cn",
        fill: (d) => (d.error ? "red" : "currentColor"),
      }),
    ],
  }),
)
```

HTTP/2 server have limits on how many concurrent requests (or 'multiplexed
streams' in H/2 terminology) can be made over a single TCP connection, called
[SETTINGS_MAX_CONCURRENT_STREAMS](https://datatracker.ietf.org/doc/html/rfc9113#section-5.1.2)
which can be announced by H/2 server when connection is established.

Unlocky for us Chainstack server doesn't share this limit and we had to figure
it out by hand. We sent `n` concurrent requests for `range=30-150 step=10`. On
`n=100` all requests started to fail. After zooming into `range=98-102` range
with `step=1` and we identified a limit.

```js
const data = await FileAttachment("data/chainstack_concurrency_h2.csv").csv({
  typed: true,
})

const dataGrouped = d3.rollups(
  data,
  (D) => D.filter((d) => d.error).length / D.length,
  (d) => d.concurrency,
)
const dataSorted = d3.sort(dataGrouped, (d) => d[0])

display(
  Plot.plot({
    x: {
      interval: 1,
      tickFormat: d3.format(".0f"),
    },
    y: {
      label: "% failed %",
      percent: true,
    },
    height: 100,
    marks: [
      Plot.lineY(dataSorted, {
        x: (d) => d[0],
        y: (d) => d[1],
      }),
    ],
  }),
)
```

Chainstack supports up to 99 concurrent requests per single H/2 connection. This
is rather small as default for many HTTP/2 server is 1000.

In order to support more concurrent requests, new connection has to be
established. When using httpx, that means creating pool of clients on top of
build-in connection pooling.

## Rate limiting

Provider advertises following limits:

| Provider                                  | per second   | per month         |
| ----------------------------------------- | ------------ | ----------------- |
| [Chainstack][chainstack-pricing] (Growth) | unlimited    | 20M compute units |
| [QuickNode][quicknode-pricing] (Build)    | 2500 credits | 500M credits      |
| [Alchemy][alchemy-pricing] (Growth)       | 660 credits  | 40M compute units |

[chainstack-pricing]: https://chainstack.com/pricing/
[quicknode-pricing]: https://www.quicknode.com/pricing
[alchemy-pricing]: https://docs.alchemy.com/reference/pricing-plans

Which translates to following limits if we only make `eth_getBlockByNumber`
calls:

| Provider   | call cost      | per second | per month |
| ---------- | -------------- | ---------- | --------- |
| Chainstack | 2 compute unit | unlimited  | 10M       |
| QuickNode  | 20 credits     | 12         | 25M       |
| Alchemy    | 16 credits     | 41         | 2.5M      |

(call cost taken from
[Github issue](https://github.com/arcxmoney/data-ingestor-evm/issues/116))

We have observed that each provider handles limits differently.

### Alchemy

In our testing Alchemy doesn't return any HTTP errors or break connections. We
have observed transport-level queuing. With more concurrent requests, response
time increases.

We weren't able to reach any limits most probably due to Auto-Scale Compute
feature.

```js
import { plotDurationPerConcurrency } from "./components/plots.js"

const allData = await FileAttachment("data/all,burst.csv").csv({
  typed: true,
})

const provider = "alchemy"

const data = allData.filter((d) => d.provider === provider)

display(await plotDurationPerConcurrency(data))

display(data.filter((d) => d.error).map((d) => d.error))
```

### QuickNode

QuickNode handles all requests up to 30 concurrent requests. Beyond 30 requests,
it starts responding with HTTP `429 (Too Many Requests)`.

```js
import { plotDurationPerConcurrency } from "./components/plots.js"

const allData = await FileAttachment("data/all,burst.csv").csv({
  typed: true,
})

const provider = "quicknode"

const data = allData.filter((d) => d.provider === provider)

display(await plotDurationPerConcurrency(data))
```

### Chainstack

Chainstack starts terminating connections with 70 concurrent requests. With more
concurrent requests, response time increases and becomes more variable.

```js
import { plotDurationPerConcurrency } from "./components/plots.js"

const allData = await FileAttachment("data/all,burst.csv").csv({
  typed: true,
})

const provider = "chainstack"

const data = allData.filter((d) => d.provider === provider)

// display(data.filter((d) => d.error).map((d) => d.error))

display(await plotDurationPerConcurrency(data))
```

## Considerations

These tests are made without consideration for latency caused by physical
distance between the servers.

All tests were conducted on Google Cloud in Jakarta, ID region.

All providers are behind distributed cloud network, like Cloudflare which routes
traffic to private network of the provider.

Making calls to distant server can add up to 400ms of latency when routing
through corp cloud like Google Cloud or AWS.

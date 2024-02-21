---
toc: false
---

# Ethereum RPC Providers Analysis

This document outlines performance and network characteristics of three Ethereum
RPC providers: Alchemy, QuickNode, Chainstack.

First, we compare performance of HTTP/1.1 and HTTP/2 in terms of latency,
response time, and concurrency. We try to address any unexpected behavior for
each provider.

Then we try to break limits imposed by the providers.

## Protocol performance

To test performance between protocols, we benchmarked Alchemy API with 100
concurrent requests per protocol (HTTP/1, HTTP/2) per number of active clients
(1, 3).

We use `eth_getBlockByNumber(N, true)` (with transaction details ) RPC call to
include as much data as possible and detect any potential limitations of H/2
multiplexing.

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

Unlucky for us Chainstack server doesn't share this limit and we had to figure
it out by hand:

We sent `n` concurrent requests for `range=30-150 step=10`. On `n=100` all
requests started to fail. After zooming into `range=98-102` range with `step=1`
and we identified a tipping point. Yay!

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
        curve: "step-after",
        x: (d) => d[0],
        y: (d) => d[1],
      }),
    ],
  }),
)
```

Chainstack supports up to 99 concurrent requests per single H/2 connection. This
is rather small as default value for HTTP/2 servers like nginx is 1000.

In order to support more concurrent requests, new connection has to be
established. When using httpx, that means creating pool of clients on top of
build-in connection pooling.

## Rate limiting

Now we're going to test rate limiting. We do this by making `3 * cn` calls with
up to `cn` concurrent H/2 requests across 5 separate TCP connections. We measure
response times to detect transport-level throttling. We also track errors
happening on TCP and HTTP layer.

We run the test with multiple connections to simulate multiple programs
connecting to the same endpoint as well as to avoid reaching Chainstack's H/2
connection limit.

Before each run, we establish connection for each client to avoid any slowdowns
caused by initial connection to the server.

We use `eth_getBlockByNumber(N, false)` (without transaction details ) RPC call;
a simple read op which contains moderate amount of data.

Providers advertise following rate limits:

| Provider                                  | per second   | per month         |
| ----------------------------------------- | ------------ | ----------------- |
| [Chainstack][chainstack-pricing] (Growth) | unlimited    | 20M compute units |
| [QuickNode][quicknode-pricing] (Build)    | 2500 credits | 500M credits      |
| [Alchemy][alchemy-pricing] (Growth)       | 660 credits  | 40M compute units |

[chainstack-pricing]: https://chainstack.com/pricing/
[quicknode-pricing]: https://www.quicknode.com/pricing
[alchemy-pricing]: https://docs.alchemy.com/reference/pricing-plans

When we translate it to `eth_getBlockByNumber` calls:

| Provider   | call cost      | per second | per month |
| ---------- | -------------- | ---------- | --------- |
| Chainstack | 2 compute unit | unlimited  | 10M       |
| QuickNode  | 20 credits     | 12         | 25M       |
| Alchemy    | 16 credits     | 41         | 2.5M      |

(call cost taken from
[Github issue](https://github.com/arcxmoney/data-ingestor-evm/issues/116))

Each provider handles rate limits and workload in very different way.

### Alchemy

```js
import { plotDurationPerConcurrency } from "./components/plots.js"

const allData = await FileAttachment("data/all,burst.csv").csv({
  typed: true,
})

const provider = "alchemy"

const data = allData.filter((d) => d.provider === provider)

display(await plotDurationPerConcurrency(data))
```

In our testing Alchemy didn't return any HTTP errors or terminate connections.
Irregular occurrences of >1s responses suggest we can continue to increase load
even further.

We weren't able to reach any limits probably due to enabled Auto-Scale Compute
feature.

### QuickNode

```js
import { plotDurationPerConcurrency } from "./components/plots.js"

const allData = await FileAttachment("data/all,burst.csv").csv({
  typed: true,
})

const provider = "quicknode"

const data = allData.filter((d) => d.provider === provider)

display(await plotDurationPerConcurrency(data))
```

QuickNode returns HTTP `429 (Too Many Requests)` errors after around 40
concurrent requests. No connection terminations. Also 'quick' in QuickNode is
not a joke: its response times are faster than other providers'.

### Chainstack

```js
import { plotDurationPerConcurrency } from "./components/plots.js"

const allData = await FileAttachment("data/all,burst.csv").csv({
  typed: true,
})

const provider = "chainstack"

const data = allData.filter((d) => d.provider === provider)

display(await plotDurationPerConcurrency(data))
```

Chainstack doesn't interrupt connections or return HTTP errors. However,
increased response time with more concurrent connection imply transport-level
throttling. Its famous no-rate-limiting line seems to be written by a lawyer.
There aren't any limits but they are.

## Takeaways

- Use HTTP/2.
- Creating a pool of httpx clients is necessary when making more than 99
  concurrent requests to Chainstack. It is probably a good idea to do that for
  all providers anyways.
- Implement client pooling via `httpx.Transport`
- Properly handle exceptions from `json`, `httpx`, and `h2`, as shown in
  attached python script.
- QuickNode returns 429 HTTP response which makes it easy to detect reaching a
  limit and slowing down requests.
- Alchemy's rate-limiting behaviour is unspecified and requires further
  investigation and more credits.
- Chainstack has idiosyncratic limiting behaviour. For real world use, setting a
  hard cap of concurrent requests is advised. A custom rate limiter that
  considers variance in response times can be implemented.

## Considerations

These tests are made without consideration for latency caused by physical
distance between the servers.

All tests were conducted on Google Cloud in Jakarta (Asia) region.

All providers are behind distributed cloud network, like Cloudflare which routes
traffic to private network of the provider.

Making calls to distant server can add up to 400ms of latency when routing
through corp cloud like Google Cloud or AWS.

## Potential Improvements

- Conduct benchmarks closer to provider servers.
- Measure more request timing: DNS Lookup, TCP Connection, TLS Handshake, Server
  Processing, and Content Transfer.
- Make continuous connection across wider timespan to reduce network-related
  randomness in data.

## Addendum

## `benchmark.py`

```python
import os
import h2.exceptions
import asyncio
import random
import pandas as pd
import json as jsonlib
from datetime import datetime, timedelta
from typing import TypedDict
from aiolimiter import AsyncLimiter


import httpx
from pandas.core.generic import gc

ALCHEMY_RPC_URL = os.environ["ALCHEMY_RPC_URL"]
CHAINSTACK_RPC_URL = os.environ["CHAINSTACK_RPC_URL"]
QUICKNODE_RPC_URL = os.environ["QUICKNODE_RPC_URL"]

START_BLOCK = 19180000

NUM_BLOCKS = 1000


def create_h1_client():
    return httpx.AsyncClient(
        timeout=httpx.Timeout(15),
        limits=httpx.Limits(
            max_keepalive_connections=None,
            max_connections=None,
        ),
    )


def create_h2_client():
    return httpx.AsyncClient(
        http2=True,
        timeout=httpx.Timeout(15),
        limits=httpx.Limits(
            max_keepalive_connections=None,
            max_connections=None,
        ),
    )


def create_h1_clients(n):
    return [create_h1_client() for _ in range(0, n)]


def create_h2_clients(n):
    return [create_h2_client() for _ in range(0, n)]


async def rpc_call(method, params, *, url, client: httpx.AsyncClient):
    if isinstance(client, list):
        client = random.choice(client)

    error = None

    start = datetime.now()

    try:
        res = await client.post(
            url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": params,
            },
        )

        print(res.text[:100])
        res.raise_for_status()
    except (httpx.RequestError, httpx.HTTPError, h2.exceptions.ProtocolError) as e:
        res = None
        error = repr(e)

    end = datetime.now()

    print(f"{method}({params}) done in {end - start}")

    if res:
        error = res.json().get("error", None)

        if isinstance(error, dict):
            error = error.get("message")

    if error:
        print(f"An error occured for {method}({params})", error)

    return res, {
        "start": start,
        "end": end,
        "error": error,
    }


async def test_limit(label, blocks: range, limit, client, url, use_hex=False):
    print(f"Testing limit {label} blocks={blocks}")

    gc.collect()

    sem = AsyncLimiter(limit)

    async def throttled_fn(*args, **kwargs):
        async with sem:
            res = await rpc_call(*args, **kwargs)

            return res

    tasks = [
        throttled_fn(
            "eth_getBlockByNumber",
            [hex(i) if use_hex else i, False],
            url=url,
            client=client,
        )
        for i in blocks
    ]

    calls = await asyncio.gather(*tasks)

    stats = [c[1] for c in calls]

    stats_df = pd.DataFrame(stats)

    stats_df.to_csv(f"output/{label}.csv")


async def test_flood(label, blocks: range, concurrency, client, url, use_hex=False):
    print(f"Testing {label} blocks={blocks} concurrency={concurrency}")

    gc.collect()

    sem = asyncio.Semaphore(concurrency)

    async def throttled_fn(*args, **kwargs):
        async with sem:
            res = await rpc_call(*args, **kwargs)

            return res

    tasks = [
        throttled_fn(
            "eth_getBlockByNumber",
            [hex(i) if use_hex else i, False],
            url=url,
            client=client,
        )
        for i in blocks
    ]

    calls = await asyncio.gather(*tasks)

    stats = [c[1] for c in calls]

    stats_df = pd.DataFrame(stats)

    stats_df.to_csv(f"output/{label}.csv")


async def test_flood_protocols(url, prefix, *, concurrency=1000, use_hex=False):
    await test_flood(
        f"{prefix},b={NUM_BLOCKS},c={concurrency},p=h1,i=1",
        range(START_BLOCK, START_BLOCK + NUM_BLOCKS),
        concurrency,
        create_h1_client(),
        url,
        use_hex,
    )

    await asyncio.sleep(60)

    await test_flood(
        f"{prefix},b={NUM_BLOCKS},c={concurrency},p=h1,i=3",
        range(START_BLOCK, START_BLOCK + NUM_BLOCKS),
        concurrency,
        create_h1_clients(3),
        url,
        use_hex,
    )

    await asyncio.sleep(60)

    await test_flood(
        f"{prefix},b={NUM_BLOCKS},c={concurrency},p=h2,i=1",
        range(START_BLOCK, START_BLOCK + NUM_BLOCKS),
        concurrency,
        create_h2_client(),
        url,
        use_hex,
    )

    await asyncio.sleep(60)

    await test_flood(
        f"{prefix},b={NUM_BLOCKS},c={concurrency},p=h2,i=3",
        range(START_BLOCK, START_BLOCK + NUM_BLOCKS),
        concurrency,
        create_h2_clients(3),
        url,
        use_hex,
    )


async def test_flood_protocols_all_providers(concurrency=100):
    await test_flood_protocols(
        ALCHEMY_RPC_URL,
        "alchemy",
        use_hex=True,
        concurrency=concurrency,
    )

    await asyncio.sleep(15)

    await test_flood_protocols(
        CHAINSTACK_RPC_URL,
        "chainstack",
        concurrency=concurrency,
    )

    await asyncio.sleep(15)

    await test_flood_protocols(
        QUICKNODE_RPC_URL,
        "quicknode",
        use_hex=True,
        concurrency=concurrency,
    )


async def test_chainstack_concurrency():
    for n in range(98, 103):
        prefix = "chainstack,concurrency"

        await test_flood(
            f"{prefix},limits,b={n},c={n}",
            range(START_BLOCK, START_BLOCK + n),
            n,
            create_h2_clients(1),
            CHAINSTACK_RPC_URL,
        )

        await asyncio.sleep(5)


async def test_limits_all():
    cn = 5

    for provider, url in [
        ("quicknode", QUICKNODE_RPC_URL),
        ("alchemy", ALCHEMY_RPC_URL),
        ("chainstack", CHAINSTACK_RPC_URL),
    ]:
        clients = create_h2_clients(cn)

        async def _call(i, bf=3, clients=clients):
            blocks = bf * i

            await test_flood(
                f"{provider},burst,b={blocks},c={i},p=h2,i={cn}",
                range(START_BLOCK, START_BLOCK + (blocks)),
                i,
                clients,
                url,
                use_hex=(provider != "chainstack"),
            )

            await asyncio.sleep(5)

        # Warm up
        for client in clients:
            await _call(cn, 1, client)

        for i in range(5, 125, 5):
            await _call(i)


async def main():
    # await test_flood_protocols_all_providers(100)
    # await test_flood_protocols_all_providers(1000)
    # await test_limits_all()
    # await test_chainstack_concurrency()

    pass


asyncio.run(main())
```

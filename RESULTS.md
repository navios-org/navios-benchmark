# Results

Measured 2026-11-26 on Apple M4 Max (16 cores, 48 GiB), Darwin 27.2.0 arm64, Node.js v24.22.1, Bun 1.4.5, on AC Power. 5 rounds of 3 s per measurement, 64 connections, each round in a new process and a new random order. Every figure is the median of the rounds; ± is half of the range between the lowest and the highest.

Methodology, and how to run this yourself: [README.md](README.md). Every row of the run: [results/published-2026-11-27.json](results/published-2026-11-27.json). The same in charts: open `results/report.html` in a browser.

## Throughput

Requests per second with 64 connections, with requests and responses validated (`full` mode). The floor of each runtime is a server with hand-written routing and the same validation.

### Node.js

|  | ping | param | query | post | order | list | large | auth | chain | scoped | invalid | missing | io | mix |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| node:http | 132k | 118k | 97.6k | 92.5k | 51.7k | 69.2k | 18.7k | 125k | 114k | 129k | 73.5k | 131k | 41.6k | 89.9k |
| Fastify + JSON Schema | 124k | 116k | 103k | 89.3k | 62.9k | 72.0k | 16.4k | 117k | 116k | 121k | 63.3k | 118k | 41.8k | 91.6k |
| Fastify + Zod | 119k | 113k | 96.4k | 82.3k | 48.8k | 69.7k | 18.3k | 116k | 114k | 118k | 50.5k | 118k | 41.7k | 85.2k |
| Hono | 119k | 111k | 76.2k | 72.4k | 40.5k | 58.5k | 18.5k | 105k | 55.9k | 118k | 54.2k | 116k | 39.9k | 75.9k |
| Navios 2 / Fastify | 115k | 110k | 88.2k | 80.9k | 47.3k | 63.9k | 18.3k | 112k | 104k | 101k | 63.3k | 96.2k | 40.3k | 82.0k |
| Navios 1 / Fastify | 81.9k | 78.0k | 68.0k | 62.5k | 41.5k | 52.7k | 17.1k | 35.1k | n/a | 33.9k | 49.2k | 74.0k | 41.0k | 59.1k |
| Nest / Node | 84.8k | 77.5k | 65.7k | 59.5k | 34.3k | 52.1k | 17.4k | 77.8k | 73.5k | 42.1k | 46.7k | 66.5k | 39.3k | 60.6k |
| Nest / Fastify | 81.6k | 74.2k | 63.7k | 57.4k | 33.5k | 48.4k | 16.2k | 74.4k | 74.2k | 41.8k | 45.7k | 63.8k | 39.3k | 58.4k |
| Express | 72.0k | 65.8k | 59.5k | 54.4k | 38.3k | 47.6k | 14.6k | 68.3k | 65.7k | 68.6k | 46.8k | 69.1k | 38.4k | 55.3k |
| Nest / Express | 54.4k | 50.2k | 44.9k | 42.0k | 27.4k | 38.4k | 13.6k | 50.9k | 50.1k | 32.7k | 35.5k | 45.9k | 37.5k | 42.5k |

### Bun

|  | ping | param | query | post | order | list | large | auth | chain | scoped | invalid | missing | io | mix |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Bun.serve | 277k | 259k | 172k | 172k | 90.1k | 117k | 28.8k | 244k | 244k | 275k | 135k | 273k | 44.9k | 166k |
| Hono | 237k | 217k | 128k | 127k | 67.5k | 98.4k | 27.8k | 186k | 160k | 237k | 95.4k | 233k | 44.6k | 129k |
| Elysia | 232k | 211k | 160k | 145k | 84.7k | 112k | 29.5k | 224k | 210k | 229k | 103k | 223k | 45.0k | 144k |
| Navios 2 / Bun | 224k | 208k | 134k | 135k | 78.5k | 104k | 28.7k | 210k | 182k | 173k | 114k | 185k | 45.2k | 136k |
| Navios 1 / Bun | 209k | 188k | 130k | 141k | 84.2k | 99.6k | 28.4k | 58.7k | n/a | 56.1k | 99.1k | 164k | 44.7k | 110k |
| Nest / Node | 107k | 98.3k | 88.2k | 81.7k | 50.5k | 71.0k | 26.6k | 97.7k | 94.8k | 59.8k | 68.0k | 94.9k | 44.3k | 78.6k |
| Nest / Fastify | 102k | 93.9k | 81.8k | 76.1k | 47.5k | 68.1k | 26.3k | 90.3k | 89.4k | 56.4k | 66.0k | 90.4k | 44.7k | 75.0k |

What the scenarios are:

|  | request | what it costs |
| --- | --- | --- |
| ping | `GET /ping` | The framework itself: 15 bytes of JSON, no input |
| param | `GET /users/:id` | A path parameter and a service |
| query | `GET /search?…` | Four query parameters, coerced and validated |
| post | `POST /users` | A small JSON body, validated |
| order | `POST /orders` | A nested JSON body of 1 KB, validated |
| list | `GET /posts` | Two services and a page of 20 records |
| large | `GET /catalog` | 31 KB of JSON: 100 nested records |
| auth | `GET /me` | A guard that reads a header and hands a user to the handler |
| chain | `GET /chain` | Three interceptors (or hooks, or middlewares) that each set a header |
| scoped | `GET /scoped` | Two request-scoped services: built by the container, or with `new` where there is none |
| invalid | `POST /users (400)` | A body that fails validation in two places |
| missing | `GET /users/:id (404)` | A 404: thrown by a service and mapped where there are services, returned by the handler elsewhere |
| io | `GET /io` | A handler that awaits 5 ms, as for a database |
| mix | all of the above but `ping`, `large`, `chain`, `scoped` and `io` | weighted like an API: 40 % `param`, 15 % each `query` and `list`, … |

### In one number

Geometric means over every scenario but `io`: requests per second relative to Navios 2 / Fastify, and the share of the floor of its own runtime (`node:http` or `Bun.serve` with the same validation) that each contender keeps. Scenarios a contender does not support are left out of its means.

|  | runtime | relative throughput | share of its floor | µs of CPU per request, `param` |
| --- | --- | ---: | ---: | ---: |
| Bun.serve | Bun | 2.17× | 100 % | 4.0 |
| Elysia | Bun | 1.90× | 88 % | 4.9 |
| Navios 2 / Bun | Bun | 1.74× | 80 % | 4.9 |
| Hono | Bun | 1.72× | 79 % | 4.8 |
| Navios 1 / Bun | Bun | 1.35× (11 scenarios) | 62 % | 5.5 |
| node:http | Node.js | 1.14× | 100 % | 8.5 |
| Fastify + JSON Schema | Node.js | 1.11× | 97 % | 8.6 |
| Fastify + Zod | Node.js | 1.05× | 92 % | 8.9 |
| Navios 2 / Fastify | Node.js | 1.00× | 88 % | 9.1 |
| Nest / Node | Bun | 0.97× | 45 % | 10.5 |
| Hono | Node.js | 0.92× | 81 % | 9.0 |
| Nest / Fastify | Bun | 0.92× | 43 % | 11.0 |
| Nest / Node | Node.js | 0.71× | 63 % | 12.9 |
| Express | Node.js | 0.69× | 61 % | 15.3 |
| Nest / Fastify | Node.js | 0.69× | 60 % | 13.5 |
| Navios 1 / Fastify | Node.js | 0.67× (11 scenarios) | 59 % | 12.9 |
| Nest / Express | Node.js | 0.51× | 44 % | 20.1 |

### Head to head

The difference in requests per second. A difference is marked ≈ when the ranges of the two overlap, so that the rounds do not tell them apart.

|  | ping | param | query | post | order | list | large | auth | chain | scoped | invalid | missing | io |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Navios 2 against plain Fastify with the same Zod schemas | −3 % | −3 % | −8 % | −2 % | ≈ −3 % | −8 % | ≈ +0 % | −3 % | −9 % | −15 % | +25 % | −19 % | ≈ −3 % |
| Navios 2 on Fastify against Nest on its new Node adapter | +36 % | +42 % | +34 % | +36 % | +38 % | +23 % | +5 % | +44 % | +42 % | +139 % | +35 % | +45 % | +3 % |
| Navios 2 against Nest, both on Fastify | +41 % | +48 % | +38 % | +41 % | +41 % | +32 % | +13 % | +50 % | +40 % | +141 % | +39 % | +51 % | ≈ +2 % |
| Navios 2 on Bun against Navios 2 on Fastify | +95 % | +90 % | +52 % | +66 % | +66 % | +62 % | +57 % | +88 % | +75 % | +72 % | +81 % | +92 % | +12 % |
| Navios 2 against 1.x, on Fastify | +40 % | +41 % | +30 % | +30 % | +14 % | +21 % | +7 % | +218 % | n/a | +198 % | +29 % | +30 % | ≈ −2 % |
| Navios 2 against 1.x, on Bun | +8 % | +10 % | ≈ +3 % | ≈ −4 % | ≈ −7 % | ≈ +4 % | ≈ +1 % | +258 % | n/a | +209 % | +15 % | +13 % | ≈ +1 % |
| Navios 2 against Elysia, on Bun | −3 % | −2 % | −16 % | −7 % | −7 % | −7 % | −3 % | −6 % | −13 % | −24 % | +11 % | −17 % | ≈ +0 % |
| Navios 2 against Hono, on Bun | −5 % | −4 % | +5 % | +6 % | +16 % | ≈ +5 % | +3 % | +13 % | +14 % | −27 % | +20 % | −21 % | ≈ +1 % |
| Nest: the Node adapter against Express | +56 % | +54 % | +46 % | +42 % | +25 % | +36 % | +28 % | +53 % | +47 % | +29 % | +32 % | +45 % | +5 % |
| Nest: the Node adapter against Fastify | ≈ +4 % | ≈ +4 % | +3 % | ≈ +4 % | +3 % | +8 % | ≈ +7 % | +5 % | ≈ −1 % | ≈ +1 % | +2 % | ≈ +4 % | ≈ −0 % |
| Nest on its Node adapter: Bun against Node.js | +27 % | +27 % | +34 % | +37 % | +47 % | +36 % | +53 % | +26 % | +29 % | +42 % | +46 % | +43 % | +13 % |

### What validating responses costs

Requests per second with responses sent as they are (`request` mode), against validating them too (`full` mode).

|  | ping | param | query | post | order | list | large | auth | chain | scoped | invalid | missing | io |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Bun.serve (Bun) | +1 % | +5 % | +8 % | +4 % | +7 % | +28 % | +76 % | +4 % | +0 % | +1 % | +1 % | −0 % | +1 % |
| Hono (Bun) | +2 % | +5 % | +8 % | +3 % | +4 % | +17 % | +71 % | +4 % | +2 % | +1 % | +0 % | −1 % | +1 % |
| Elysia (Bun) | +3 % | +7 % | +9 % | +4 % | +7 % | +24 % | +68 % | +6 % | +3 % | +2 % | +1 % | +0 % | +0 % |
| Navios 2 / Bun (Bun) | +4 % | +6 % | +7 % | +2 % | +8 % | +15 % | +69 % | +4 % | +2 % | +1 % | −0 % | +0 % | +0 % |
| Navios 1 / Bun (Bun) | +3 % | +7 % | +8 % | +3 % | +5 % | +17 % | +66 % | +2 % |  | +1 % | −0 % | −1 % | +1 % |
| Nest / Node (Bun) | +25 % | +25 % | +21 % | +20 % | +13 % | +34 % | +64 % | +21 % | +12 % | +11 % | +15 % | +20 % | −1 % |
| Nest / Fastify (Bun) | +21 % | +23 % | +24 % | +20 % | +17 % | +29 % | +61 % | +22 % | +10 % | +12 % | +13 % | +19 % | −3 % |
| node:http | +1 % | +6 % | +2 % | +2 % | +3 % | +8 % | +21 % | +1 % | −0 % | −1 % | +1 % | −2 % | −1 % |
| Fastify + Zod | +2 % | +2 % | +3 % | +5 % | +3 % | +7 % | +19 % | +0 % | +1 % | +2 % | +1 % | +1 % | −0 % |
| Hono | +1 % | +0 % | +3 % | +1 % | +1 % | +6 % | +20 % | +1 % | −2 % | −1 % | +0 % | −2 % | −0 % |
| Navios 2 / Fastify | +2 % | +2 % | +3 % | +3 % | +4 % | +10 % | +20 % | +1 % | +1 % | +2 % | −1 % | −0 % | +1 % |
| Navios 1 / Fastify | +3 % | +4 % | +3 % | +1 % | +1 % | +6 % | +18 % | +2 % |  | +1 % | +0 % | +2 % | +0 % |
| Nest / Node | +25 % | +23 % | +21 % | +19 % | +7 % | +18 % | +26 % | +21 % | +7 % | +7 % | +11 % | +15 % | −0 % |
| Nest / Fastify | +24 % | +24 % | +21 % | +16 % | +9 % | +16 % | +19 % | +21 % | +6 % | +10 % | +10 % | +18 % | −1 % |
| Express | −1 % | +0 % | +0 % | +1 % | +1 % | +4 % | +14 % | −2 % | −0 % | −1 % | +2 % | −1 % | −0 % |
| Nest / Express | +14 % | +12 % | +10 % | +10 % | +7 % | +11 % | +15 % | +10 % | +5 % | +8 % | +8 % | +9 % | +2 % |

Variants that exist in one mode only:

|  | mode | ping | param | query | post | order | list | large | auth | chain | scoped | invalid | missing | io |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fastify + JSON Schema: Ajv and fast-json-stringify in place of Zod: responses are shaped, not validated | full | 124k | 116k | 103k | 89.3k | 62.9k | 72.0k | 16.4k | 117k | 116k | 121k | 63.3k | 118k | 41.8k |
| Nest / Node + class-validator: DTO classes and ValidationPipe in place of Zod | request | 106k | 95.9k | 59.4k | 51.5k | 14.3k | 52.4k | 21.9k | 94.2k | 78.9k | 45.6k | 40.5k | 76.8k | 39.3k |

### How much is noise

Two contenders ran twice per round under different names, as if they were different servers. The difference between a contender and itself is what a difference between two contenders has to exceed.

|  | median difference | largest difference |
| --- | ---: | ---: |
| Navios 2 / Fastify | 0.8 % | 2.1 % |
| Navios 2 / Bun | 0.6 % | 2.1 % |

Across all throughput figures, the median spread between rounds is ±1.2 %. No measurement carries a warning: the server was always saturated, the driver never was, and every answer had the expected status.

## Latency at a fixed rate

The mixed workload sent at a fixed rate (an open loop, as real clients do), with latency measured from when each request was due, so that a stall delays the requests behind it too. Each cell is p50 / p99 in milliseconds; — is a rate the contender could not sustain.

|  | 5.0k/s | 10.0k/s | 20.0k/s | 40.0k/s | 80.0k/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bun.serve (Bun) | 0.02 / 0.06 | 0.02 / 0.03 | 0.02 / 0.04 | 0.02 / 0.08 | 0.02 / 0.21 |
| Elysia (Bun) | 0.02 / 0.06 | 0.02 / 0.04 | 0.02 / 0.04 | 0.02 / 0.09 | 0.03 / 0.23 |
| Navios 2 / Bun (Bun) | 0.03 / 0.06 | 0.02 / 0.04 | 0.03 / 0.04 | 0.03 / 0.13 | 0.03 / 0.29 |
| Hono (Bun) | 0.03 / 0.06 | 0.02 / 0.04 | 0.02 / 0.04 | 0.03 / 0.13 | 0.03 / 0.25 |
| Navios 1 / Bun (Bun) | 0.03 / 0.06 | 0.03 / 0.04 | 0.03 / 0.07 | 0.03 / 0.22 | 0.03 / 0.44 |
| Fastify + JSON Schema | 0.03 / 0.05 | 0.03 / 0.04 | 0.03 / 0.04 | 0.03 / 0.04 | 0.04 / 0.16 |
| node:http | 0.03 / 0.06 | 0.03 / 0.04 | 0.03 / 0.04 | 0.03 / 0.04 | 0.04 / 0.21 |
| Fastify + Zod | 0.03 / 0.06 | 0.03 / 0.05 | 0.03 / 0.05 | 0.03 / 0.05 | 0.09 / 1.27 |
| Navios 2 / Fastify | 0.03 / 0.06 | 0.03 / 0.04 | 0.03 / 0.04 | 0.03 / 0.05 | 0.19 / 1.72 |
| Nest / Node (Bun) | 0.03 / 0.06 | 0.03 / 0.05 | 0.03 / 0.13 | 0.03 / 0.27 | 11.24 / 589.30 |
| Hono | 0.03 / 0.06 | 0.03 / 0.05 | 0.03 / 0.05 | 0.03 / 0.05 | — |
| Nest / Fastify (Bun) | 0.03 / 0.06 | 0.03 / 0.05 | 0.03 / 0.18 | 0.03 / 0.32 | — |
| Nest / Node | 0.03 / 0.06 | 0.03 / 0.06 | 0.03 / 0.05 | 0.03 / 0.07 | — |
| Navios 1 / Fastify | 0.03 / 0.06 | 0.03 / 0.05 | 0.03 / 0.06 | 0.03 / 0.39 | — |
| Nest / Fastify | 0.03 / 0.06 | 0.03 / 0.06 | 0.03 / 0.06 | 0.03 / 0.07 | — |
| Express | 0.03 / 0.05 | 0.03 / 0.05 | 0.03 / 0.05 | 0.03 / 0.18 | — |
| Nest / Express | 0.04 / 0.07 | 0.04 / 0.06 | 0.04 / 0.06 | 0.09 / 0.84 | — |

## Connections

`GET /users/:id` with 1 to 256 connections: requests per second, and the 99th percentile of latency in milliseconds. One connection is a client that waits for each answer; it shows the time of one request more than the capacity of the server.

|  | 1 | 16 | 64 | 256 |
| --- | ---: | ---: | ---: | ---: |
| Bun.serve (Bun) | 58.4k · 0.02 | 251k · 0.12 | 256k · 0.49 | 256k · 1.64 |
| Hono (Bun) | 54.2k · 0.03 | 213k · 0.14 | 215k · 0.58 | 214k · 1.73 |
| Elysia (Bun) | 53.3k · 0.03 | 212k · 0.14 | 214k · 0.58 | 212k · 1.52 |
| Navios 2 / Bun (Bun) | 52.3k · 0.03 | 208k · 0.15 | 211k · 0.59 | 209k · 1.77 |
| Navios 1 / Bun (Bun) | 51.0k · 0.03 | 191k · 0.16 | 193k · 0.65 | 191k · 1.71 |
| node:http | 47.9k · 0.03 | 119k · 0.26 | 118k · 1.04 | 118k · 2.37 |
| Fastify + JSON Schema | 44.4k · 0.03 | 118k · 0.26 | 118k · 1.04 | 116k · 2.38 |
| Fastify + Zod | 42.9k · 0.03 | 112k · 0.28 | 113k · 1.10 | 112k · 2.45 |
| Hono | 46.9k · 0.03 | 109k · 0.29 | 110k · 1.13 | 109k · 2.61 |
| Navios 2 / Fastify | 45.5k · 0.03 | 111k · 0.28 | 110k · 1.13 | 109k · 2.61 |
| Nest / Node (Bun) | 39.7k · 0.03 | 99.4k · 0.39 | 100k · 1.21 | 98.4k · 3.14 |
| Nest / Fastify (Bun) | 38.7k · 0.03 | 93.1k · 0.43 | 92.6k · 1.29 | 93.2k · 3.30 |
| Navios 1 / Fastify | 37.3k · 0.03 | 77.6k · 0.42 | 77.6k · 1.57 | 78.1k · 3.86 |
| Nest / Node | 37.1k · 0.03 | 78.0k · 0.40 | 78.2k · 1.59 | 77.9k · 3.61 |
| Nest / Fastify | 36.7k · 0.03 | 74.9k · 0.42 | 74.9k · 1.64 | 74.3k · 3.79 |
| Express | 34.4k · 0.04 | 64.9k · 0.48 | 64.4k · 1.91 | 64.3k · 4.41 |
| Nest / Express | 29.7k · 0.04 | 50.0k · 0.62 | 49.8k · 2.48 | 50.1k · 5.62 |

## Startup

Milliseconds from spawning the process to the first answer of `GET /ping`, median of 20 starts in random order. `modules` runs the compiled files with `node_modules`; `bundle` is one file, built with rolldown for Node.js and `bun build` for Bun; `executable` is `bun build --compile`.

|  | runtime | modules | bundle | executable |
| --- | --- | ---: | ---: | ---: |
| Bun.serve | Bun | 21 ±2.0 % | 16 ±3.4 % | 15 ±8.6 % |
| Hono | Bun | 24 ±3.1 % | 17 ±2.7 % | 16 ±4.9 % |
| Navios 2 / Bun | Bun | 35 ±2.5 % | 29 ±2.4 % | 28 ±2.1 % |
| Navios 1 / Bun | Bun | 36 ±1.9 % | 30 ±1.8 % | 29 ±1.1 % |
| Elysia | Bun | 41 ±1.9 % | 27 ±3.6 % | 25 ±2.4 % |
| node:http | Node.js | 75 ±2.6 % | 62 ±2.3 % |  |
| Express | Node.js | 81 ±2.3 % | 60 ±2.7 % |  |
| Hono | Node.js | 81 ±1.7 % | 64 ±2.3 % |  |
| Nest / Node | Bun | 97 ±1.7 % | 74 ±0.9 % | 71 ±1.2 % |
| Fastify + Zod | Node.js | 101 ±1.8 % | 72 ±3.0 % |  |
| Nest / Fastify | Bun | 113 ±3.4 % | 85 ±1.3 % | 85 ±0.9 % |
| Fastify + JSON Schema | Node.js | 125 ±2.1 % | 97 ±1.6 % |  |
| Navios 1 / Fastify | Node.js | 129 ±1.5 % | 94 ±2.7 % |  |
| Navios 2 / Fastify | Node.js | 135 ±1.4 % | 101 ±1.4 % |  |
| Nest / Express | Node.js | 176 ±1.4 % | 118 ±1.5 % |  |
| Nest / Node | Node.js | 180 ±0.8 % | 122 ±1.9 % |  |
| Nest / Fastify | Node.js | 191 ±2.3 % | 133 ±1.4 % |  |

## Memory

Resident memory in MiB: after start-up and a collection (idle), the most during 8 s of the mixed workload at 10.0k requests per second, the same number of requests for everyone (peak), and after a collection again (settled).

|  | runtime | idle | peak | settled |
| --- | --- | ---: | ---: | ---: |
| Bun.serve | Bun | 42 | 67 | 67 |
| Hono | Bun | 44 | 74 | 74 |
| Navios 2 / Bun | Bun | 51 | 82 | 82 |
| Navios 1 / Bun | Bun | 53 | 98 | 98 |
| Elysia | Bun | 54 | 86 | 86 |
| node:http | Node.js | 77 | 95 | 95 |
| Express | Node.js | 78 | 100 | 100 |
| Nest / Node | Bun | 79 | 143 | 143 |
| Nest / Fastify | Bun | 81 | 139 | 139 |
| Hono | Node.js | 81 | 111 | 111 |
| Fastify + Zod | Node.js | 84 | 111 | 111 |
| Fastify + JSON Schema | Node.js | 94 | 113 | 113 |
| Navios 2 / Fastify | Node.js | 99 | 127 | 127 |
| Navios 1 / Fastify | Node.js | 102 | 225 | 224 |
| Nest / Node | Node.js | 110 | 136 | 136 |
| Nest / Express | Node.js | 110 | 144 | 144 |
| Nest / Fastify | Node.js | 112 | 148 | 148 |

## The load driver

Requests per second of `GET /ping` with 64 connections, by tool, and in brackets how busy the server's main thread was. A server that is not fully busy was held back by the tool. One that is fully busy can still be slowed by it: on loopback the server's writes pay for waking the client's threads, so a client that sleeps costs the server time. The driver of this benchmark keeps its threads polling instead.

|  | bun-serve | navios-bun | node-http | navios-fastify |
| --- | ---: | ---: | ---: | ---: |
| loadgen, 1 thread | 268k (99 %) | 222k (99 %) | 125k (100 %) | 116k (100 %) |
| loadgen, 2 threads (used here) | 259k (100 %) | 223k (100 %) | 125k (100 %) | 115k (100 %) |
| loadgen, 3 threads | 239k (99 %) | 208k (100 %) | 119k (100 %) | 112k (100 %) |
| loadgen, 2 sleeping threads | 246k (100 %) | 209k (100 %) | 116k (100 %) | 106k (100 %) |
| bombardier (used for 1.x) | 166k (99 %) | 160k (99 %) | 124k (100 %) | 119k (100 %) |
| autocannon (used for 1.x) | 159k (85 %) | 161k (91 %) | 123k (100 %) | 118k (100 %) |
| autocannon, 4 workers | 211k (99 %) | 196k (99 %) | 116k (100 %) | 112k (100 %) |

Against a single thread that answers without parsing anything, the driver reached 343k with 1 thread, 367k with 2 threads, 321k with 3 threads, 299k with 4 threads. That is what the kernel allows one thread to serve; every server above is below it.

## Versions

|  | version |
| --- | --- |
| Fastify + Zod | 5.12.8 |
| Fastify + JSON Schema | 5.12.8 |
| Express | 5.3.0 |
| Hono | 4.13.21 |
| Navios 2 / Fastify | 2.0.0-alpha.1 |
| Navios 1 / Fastify | 1.1.0 |
| Nest / Node | 12.6.0 |
| Nest / Fastify | 12.6.0 |
| Nest / Express | 12.6.0 |
| Nest / Node + class-validator | 12.6.0 |
| Elysia (Bun) | 1.4.32 |
| Hono (Bun) | 4.13.21 |
| Navios 2 / Bun (Bun) | 2.0.0-alpha.1 |
| Navios 1 / Bun (Bun) | 1.1.0 |
| Nest / Node (Bun) | 12.6.0 |
| Nest / Fastify (Bun) | 12.6.0 |
| Zod | 4.6.7 |

## Failures

- throughput 5/5 nest-express full: Error: loadgen exited with 1: loadgen: connection reset by peer

- The session was measured again 50 minutes after the run (results/published-2026-11-26-rerun.json). Every scenario came out 2-5 % below rounds 1-4 of this run, which is drift between runs rather than noise, so it was not merged: Nest / Express in full mode has 4 rounds.

- throughput: navios-bun, navios-bun#2, navios-fastify, navios-fastify#2 (40 sessions) measured again at 2026-11-27T13:39:00.785Z (560 rows replaced by 560), from published-2026-11-27-rerun.json

- connections: navios-fastify|full|1, navios-bun|full|1, navios-bun|full|2, navios-fastify|full|2, navios-bun|full|3, navios-fastify|full|3 measured again at 2026-11-27T13:39:00.785Z (24 rows replaced by 24), from published-2026-11-27-rerun.json

- latency: navios-fastify|full|1, navios-bun|full|1, navios-fastify|full|2, navios-bun|full|2, navios-fastify|full|3, navios-bun|full|3 measured again at 2026-11-27T13:39:00.785Z (30 rows replaced by 30), from published-2026-11-27-rerun.json

- startup: navios-bun, navios-fastify (100 sessions) measured again at 2026-11-27T13:39:00.785Z (100 rows replaced by 100), from published-2026-11-27-rerun.json

- memory: navios-fastify|full|1, navios-bun|full|1, navios-bun|full|2, navios-fastify|full|2, navios-bun|full|3, navios-fastify|full|3 measured again at 2026-11-27T13:39:00.785Z (6 rows replaced by 6), from published-2026-11-27-rerun.json

- navios-bun: 2.0.0-alpha.0 replaced by 2.0.0-alpha.1, from published-2026-11-27-rerun.json

- navios-fastify: 2.0.0-alpha.0 replaced by 2.0.0-alpha.1, from published-2026-11-27-rerun.json


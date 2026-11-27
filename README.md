# Navios benchmark

How Navios 2 compares with Navios 1, NestJS on each of its three adapters, and the libraries and runtimes underneath, on Node.js and on Bun. The latest results are in [RESULTS.md](RESULTS.md), and as charts in `results/report.html`.

## What the latest run shows

Measured on 2026-11-26 on an Apple M4 Max, Node.js 24.22, Bun 1.4.5: `@navios/server` 2.0.0-alpha.1, `@navios/core` 1.1.0, NestJS 12.6.0. Navios 2 was measured again on 2026-11-27, when 2.0.0-alpha.1 was published; plain Fastify and `Bun.serve`, measured beside it, came out within 2 % of the day before. 5 rounds, every server validating requests and responses with the same Zod schemas unless a line says otherwise.

- **Navios 2 against Nest 12.** On Node.js, Navios 2 on Fastify serves 34 to 45 % more requests per second than Nest on its new Node adapter in most scenarios, 23 % more on a page of records and 139 % more with request-scoped services, which make a Nest controller request-scoped. On the 31 KB catalog, where serialising dominates, it is 5 % ahead. Against Nest on Fastify the gap is 38 to 51 % on most routes, 32 % on the page of records and 13 % on the 31 KB catalog.
- **What the framework costs.** Plain Fastify with the same Zod schemas keeps 92 % of the throughput of `node:http` with hand-written routing; Navios 2 on Fastify keeps 88 %, Nest on its Node adapter 63 %. For `GET /users/:id` that is 8.9, 9.1 and 12.9 µs of CPU per request.
- **Bun.** Navios 2 on Bun serves 1.5 to 2 times what it serves on Node.js, and keeps 80 % of `Bun.serve`, as Hono does (79 %); Elysia keeps 88 %. At a moderate fixed rate the tail is longer on Bun, for `Bun.serve` as for every framework on it: at 40k requests per second, p99 is 0.13 ms for Navios on Bun and 0.05 ms on Node.js.
- **2.0 against 1.x.** On Fastify 2.0 is 14 to 41 % faster on most routes; on Bun 8 to 15 % on routes without a body. Where 1.x builds a request-scoped controller (a guard that hands over the user, request-scoped services), 2.0 is 3 to 3.6 times as fast. One thing is slower: on Bun, the median of 2.0 for requests with a JSON body is 4 to 7 % below that of 1.x, though the ranges of the rounds overlap. It reads them as bytes, decodes them and checks them for `__proto__` keys, which 1.x did not do; reading them with `request.text()` instead would recover about half of that (0.25 µs of the 0.5 µs per request, measured separately).
- **Validating responses.** On Node.js it costs Navios 1 to 4 % on most routes, 10 % on a page of 20 records and 20 % on the 31 KB catalog; on Bun, where everything else is cheaper, 15 % and 69 % on those two. Nest's `StandardSchemaSerializerInterceptor` costs 7 to 26 % on every route, about 20 % on most.
- **Nest's adapters.** Nest's own numbers hold here: its Node adapter is 25 to 56 % faster than its Express adapter and 3 to 8 % faster than its Fastify adapter. The same Nest application is 26 to 53 % faster when Bun runs it.
- **class-validator.** With DTO classes instead of Zod, Nest validates a nested 1 KB body 2.6 times as slowly (14.3k against 36.9k requests per second, responses not validated in either), and serves 27 % fewer requests with a small one.
- **Latency.** Below capacity every server answers in well under a millisecond; at 40k requests per second the 99th percentile is 0.05 ms for Navios 2 on Fastify, 0.07 ms for Nest on Node and 0.84 ms for Nest on Express. Differences show only near a server's capacity.
- **Startup and memory.** Navios 2 starts in 35 ms on Bun and 135 ms on Node.js (101 ms bundled), Nest in 176 to 191 ms. Idle, Navios 2 takes 51 MiB on Bun and 99 MiB on Node.js, Nest 110 to 112 MiB. Under the same load, 1.x on Fastify grew to 225 MiB, 2.0 to 127 MiB.
- **2.0.0-alpha.1 against alpha.0.** Request-scoped services (`scoped`) are 8 to 10 % faster on both adapters. Every other scenario is where it was, within the 2 % by which the unchanged servers differ between the two days.
- **The old measurements.** The tools of the 1.x runner reported servers on Bun 28 to 38 % slower than they are. On Node.js they were right within a few percent. See [The load driver](#the-load-driver).

## What is compared

Every server implements the same API from one set of Zod schemas ([shared/src/schemas.mts](shared/src/schemas.mts)) and one set of services ([shared/src/data.mts](shared/src/data.mts)).

| Contender | Runtime | What it is |
| --- | --- | --- |
| `node-http`, `bun-serve` | Node.js, Bun | No framework: hand-written routing on `node:http` and `Bun.serve`, the floor of each runtime |
| `fastify`, `express`, `hono-node` | Node.js | The libraries, validating with the same Zod schemas |
| `fastify-json` | Node.js | Fastify with its own JSON Schema validation and serialisation, generated from the Zod schemas |
| `elysia`, `hono-bun` | Bun | The libraries of Bun |
| `navios-fastify`, `navios-bun` | Node.js, Bun | Navios 2 (`@navios/server@2.0.0-alpha.1`), one application, two adapters |
| `navios1-fastify`, `navios1-bun` | Node.js, Bun | Navios 1.1, the same application in the 1.x API |
| `nest-node`, `nest-fastify`, `nest-express` | Node.js | NestJS 12 on its Node adapter (`@nestjs/platform-node`, new in 12.3), on Fastify, and on Express |
| `nest-node-class` | Node.js | NestJS on the Node adapter with class-validator DTOs instead of Zod |
| `nest-node-bun`, `nest-fastify-bun` | Bun | The same NestJS application run by Bun; Nest has no adapter for `Bun.serve` |

`yarn list` prints them with their scenarios and suites.

### Scenarios

| | Request | What it costs a server |
| --- | --- | --- |
| `ping` | `GET /ping` | The framework itself |
| `param` | `GET /users/:id` | A path parameter and a service |
| `query` | `GET /search?q=…&page=2&limit=20&sort=desc` | Four query parameters, coerced and validated |
| `post` | `POST /users` | A small JSON body, validated |
| `order` | `POST /orders` | A nested JSON body of 1 KB, validated |
| `list` | `GET /posts?page=2&pageSize=20` | Two services and a page of 20 records |
| `large` | `GET /catalog` | 31 KB of JSON, 100 nested records |
| `auth` | `GET /me` | A guard that reads a header and hands a user to the handler |
| `chain` | `GET /chain` | Three interceptors (or hooks, or middlewares) that each set a header |
| `scoped` | `GET /scoped` | Two request-scoped services, built by the container (`Scope.REQUEST` in Nest, `ctx.use()` in Navios 2); the libraries and floors build them with `new` |
| `invalid` | `POST /users`, 400 | A body that fails validation |
| `missing` | `GET /users/0`, 404 | Navios and Nest throw `NotFoundException` in a service and map it; the libraries and floors return the 404 from the handler |
| `io` | `GET /io` | A handler that awaits 5 ms, as for a database |
| `mix` | `param`, `query`, `list`, `post`, `auth`, `order`, `missing`, `invalid` | A weighted workload: 40 % `param`, 15 % each `query` and `list`, 10 % each `post` and `auth`, 5 % `order`, 3 % `missing`, 2 % `invalid` |

### Two validation modes

- **full**: requests and responses are validated against their schemas. This is the default of Navios, and what Nest does with `StandardSchemaValidationPipe` and `StandardSchemaSerializerInterceptor`.
- **request**: only requests are validated; a handler's result is serialised as it is (`validateResponses: 'never'` in Navios).

## Fairness

A benchmark between servers that do different work measures the difference in work. So before anything is measured, `yarn conformance` starts every contender in every mode and every packaging and checks that:

- every scenario answers with the same status and, field for field, the same JSON,
- the same 17 invalid requests are refused with 400 (a number for a name, a negative age, a limit over 100, an order without items, …),
- defaults of the query schema are applied,
- a field the response schema does not declare is removed in full mode and sent in request mode,
- the request-scoped services are built once per request.

While this benchmark was written, the check caught Fastify's JSON Schema variant doing less than the others: Fastify's own Ajv coerces the types of bodies by default, so `{"name": 1}` passed. It now coerces query strings only, as the others do. `yarn conformance --packages` checks the bundles and executables of the startup suite the same way.

Beyond that:

- Each server is built with `tsc` and run as compiled JavaScript with `NODE_ENV=production` and logging off. Nothing is transpiled at run time (1.x ran under `tsx`, and Nest's constructor injection needs the decorator metadata that `tsx` does not emit).
- Frameworks keep their defaults. Express sends an ETag, Fastify does not; that is part of what each costs.
- Every response is built per request. Nothing is serialised ahead of time.
- Nest uses its own idioms: constructor injection, `@SerializeOptions`, a param decorator for the current user, `Scope.REQUEST` providers. Navios 1 uses its own: request-scoped controllers and `inject(Request)`.
- Where frameworks with a container work differently from a library by design, each does what its documentation shows. In `scoped` the libraries build two objects with `new`, and in `missing` they return the 404 instead of throwing it. Against a library, those two scenarios show what a container and exceptions cost, not a difference in the same work.

## How it is measured

### The load driver

The driver is written for this benchmark, in Go with no dependencies ([loadgen/](loadgen/)). Each of its threads runs its own event loop over a share of the connections, and polls instead of sleeping.

The 1.x runner used autocannon and bombardier. On Node.js they measure what this driver measures, within a few percent. On Bun they do not:

- autocannon is a single Node.js thread. Against `Bun.serve` it runs out of CPU first: Bun's main thread is 85 % busy at 159k requests per second.
- bombardier keeps Bun busy, but reports 166k where the same server serves 259k, and 160k for Navios on Bun where it serves 223k. On loopback a server's `write` pays for waking the client thread that waits for the answer, so a client whose threads sleep makes a server slower, and a fast server more so. A Node.js server spends long enough on each request that this hardly shows.

`yarn calibrate` repeats this comparison with every tool that is installed (`wrk` and `oha` too, when they are on the `PATH`), and drives a single thread that answers without doing any work to show the ceiling of the kernel. Its last output is part of [RESULTS.md](RESULTS.md).

### What is recorded

- **Throughput**: a closed loop of 64 connections; requests per second, and from the server's own CPU counters, the CPU time per request and how busy its main thread was.
- **Latency at a fixed rate**: the mixed workload in an open loop at 5k to 80k requests per second. Latency is counted from when a request was due, not from when it was sent, so that a stall also delays the requests that queue behind it ([coordinated omission](https://www.scylladb.com/2021/04/22/on-coordinated-omission/)).
- **Connections**: `param` with 1, 16, 64 and 256 connections.
- **Startup**: from spawning the process to the first answer, for the compiled modules, a single-file bundle and, on Bun, a compiled executable.
- **Memory**: resident memory idle, at its highest under 10k requests per second of the mixed workload for 8 s (the same work for every server), and after that.

The runner talks to a server over its stdin ([shared/src/host.mts](shared/src/host.mts)): for its CPU counters and memory, and to make it collect garbage. No route is added to any server for that.

### Against noise

- Each round starts every server afresh, in a new random order (seeded with `--seed`), and also orders the scenarios at random.
- Before measuring, every route is warmed for 3 s, then the heap is collected. On Node.js that also removes a bias that would favour small servers: a major collection during start-up makes `process.nextTick` slower for the life of the process, and only larger applications have one.
- Before each server starts, the runner waits until no more than two cores are busy, and records how many were.
- Results are medians with the range of the rounds next to them. A difference counts when the ranges do not overlap.
- Two contenders run twice per round under a second name. How far a contender is from itself is the noise floor of the run.
- A measurement is marked when the server was less than 90 % busy (a closed loop that did not saturate it), when the driver was more than 85 % busy, or when an answer had an unexpected status.
- On macOS the runner keeps the machine awake with `caffeinate`.

## Running it

Node.js 24, Bun 1.4.5 and Go 1.24 or newer.

```bash
yarn install
```

```bash
yarn build
```

```bash
yarn conformance
```

```bash
yarn bench
```

`yarn bench` runs the `standard` preset (3 rounds, full validation, every suite, about 1 h 35 min). `yarn bench:quick` takes about 10 minutes, `yarn bench:full` (5 rounds, both modes) about 3 h 35 min. Each writes `results/<time>.json`; `yarn report` turns the latest into [RESULTS.md](RESULTS.md) and `results/report.html`.

Some of the options:

```bash
yarn bench --contenders navios-fastify,nest-node --scenarios param,post --rounds 5
```

```bash
yarn bench --runtime bun --suites throughput --modes full,request
```

```bash
yarn bench --headers browser --connections 256
```

`--headers browser` sends the dozen headers and the cookie of a browser instead of two headers, `--pipeline` pipelines requests, `--rates` sets the rates of the latency suite. `node bench/cli.mts --help` lists all of them. For the startup suite, build the bundles and executables first with `yarn build:packages`.

Close what you can while it runs: the runner waits for a quiet machine, but cannot make one.

### Adding a contender

1. Add an app under `apps/` that implements the scenarios with the shared schemas and services, imports `@navios-benchmark/shared/host` for its port and the control channel, and listens on `127.0.0.1`.
2. Add it to the references of [tsconfig.json](tsconfig.json) and to [bench/contenders.mts](bench/contenders.mts).
3. Run `yarn build` and `yarn conformance --contenders <id>` until it passes.

## Layout

| Path | |
| --- | --- |
| [apps/](apps/) | One server per framework; Navios and Nest have one entry point per adapter |
| [shared/](shared/) | Schemas, services and the control channel every server uses |
| [loadgen/](loadgen/) | The load driver |
| [bench/](bench/) | Runner, conformance check, calibration, packaging and report |
| [results/](results/) | Runs; the one RESULTS.md is made from is kept, with the runs that were merged into it |

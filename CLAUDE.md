# Desk Hub backend

Node + TypeScript backend for Desk Hub: a 5" ESP32-S3 touch display, a React web app and a voice assistant ("Jarvis"). It aggregates GSE and T-bills, F1, football, NBA, tasks, Azure DevOps and Spotify into one cached payload, pushes it to the display over a WebSocket, serves the web app's API, and exposes MCP tools.

Full plan and decisions: the `desk-hub/plan.md` doc in the "Personal Projects" Claude project. Designs: the "Desk Hub UI" design canvas.

## How we work: teaching mode

This is a learning project. **Lawrence writes the code.** Claude's job is to guide and review:

- Explain concepts first, simply, and relate them to web development where possible.
- Give one small step at a time, then wait. Don't run ahead to the next step.
- Prefer hints, questions and short focused snippets over complete files. Only write full implementations when Lawrence explicitly asks ("write it", "show me the code").
- Review code he writes: point out bugs, edge cases and naming, and explain why.
- Don't create, rename or delete files unless asked. Suggest the change instead.
- End each step with a one-line "what you learned".

## Stack and conventions

- TypeScript (strict), Node, Express 5, Mongoose, MongoDB, zod for validation. Same style as `treasury-bills`.
- ESM. Import from `src` with the `@/` alias and a `.js` extension: `import { x } from '@/types/f1.js'`. Relative imports (`./x.js`) only for files in the same folder.
- Layering: `routes/` → `controllers/` → `services/`. Services contain no Express or MCP code, so REST and MCP share them.
- Success envelope `{ success, data, meta }`; errors through one helper and error middleware; stack traces only in development.
- Dates in UTC ISO strings. Missing numbers are `null`, never `0`.
- No secrets in code or logs. Third-party tokens (Azure DevOps PAT, Spotify) are stored encrypted and never returned by the API.
- Type check with `tsc --noEmit` before calling a step done (`tsx` does not type-check).
- Comments: Lawrence doesn't like them. Only comment code that is genuinely complex or non-obvious (a why, not a what). No doc comments on simple functions or types, no section banners, no commented-out code.
- MCP server: never write to stdout in stdio mode (log to stderr).
- Commits: conventional commits. **Never add Claude attribution to commits or PRs.**

## Architecture (target)

```
External APIs ─► Aggregator (providers + scheduler + cache) ─► MongoDB
                        │
        ┌───────────────┼────────────────┐
   Device API      Web API (REST)     Jarvis agent
   (WebSocket)     for the React app  (Claude + MCP tools)
```

Rule: only the backend talks to third parties and holds secrets. The display and web app never call external APIs.

- **Providers:** one `SectionProvider` per source with `fetch(config)` (returns clean, display-ready data) and `nextRunAt()` (when to refresh).
- **Cache:** per section `{ data, fetchedAt, asOf, stale, hash }`. Never overwrite good data with an error; mark `stale` and retry with backoff. Push to the device only when the hash changes.
- **Payload:** `{ v, seq, generatedAt, config, sections: { mkt, f1, fc, nba, todo, dev, play } }`. Send timestamps, not countdowns. Precompute things the device shouldn't (track points, positions, biggest gain).
- **Device API:** device connects to `/device` with its device key; server sends a snapshot, then `section`, `config.changed`, `jarvis.confirm`, `alert.*`, `screen.wake`. Device sends `task.done`, `jarvis.answer`, `ack`. Heartbeat ~30s, reconnect with backoff, resume by `seq`.
- **Jarvis tool tiers:** read-only runs immediately; anything that creates something needs a confirmation on the display; anything that acts as the user or costs money needs an exact confirmation plus an audit log.

## Data sources

- **Jolpica F1** (`https://api.jolpi.ca/ergast/f1/`): send a custom User-Agent (`DeskHub/0.1.0`). Limits about 4 req/s burst and 500/hour, so cache everything and handle 429. URLs end in `/` or `.json`. Use `current`, `next`, `last` shortcuts. Every number is a string; nesting is deep (`MRData...`); sessions are optional and differ on sprint weekends; dates and times are split; expect `nextRace: null` in the off-season.
- **GSE and T-bills:** Lawrence's own API (see the `treasury-bills` repo). It rate-limits (429), so always read from the cache.
- **Track outlines:** `bacinger/f1-circuits` GeoJSON (MIT, credit in README). Map to Jolpica circuits by nearest lat/long, simplify to 60–100 points, precompute at build time.
- **Football and NBA:** provider not chosen yet.

## Build steps

1. ✅ Explore Jolpica responses by hand
2. ✅ Types and Jolpica client (User-Agent, 429 handling, zod env)
3. ✅ F1 service: next race, last result, past rounds, results by circuit, standings
4. ✅ Track outlines (`npm run build:tracks`, `getTrackOutline`)
5. ✅ Refresh schedule logic, with unit tests (`src/providers/f1.schedule.ts`, `npm test`)
6. Aggregator payload and device WebSocket ← **start here**
7. F1 MCP tools (same structure as the `lyb-cedi-market` MCP server)
8. Test in Claude Desktop

Then: web API v1 (auth, display config and snapshot, watchlist, tasks) → Jarvis text chat → Siri Shortcut endpoint.

## Project layout

```
src/
  index.ts       entry point
  config/        env loading and validation (zod)
  types/         shared types (F1, payload, sections)
  clients/       thin HTTP clients for third parties (Jolpica first)
  providers/     one SectionProvider per section
  models/        Mongoose schemas (one per collection)
  services/      business logic, no Express or MCP code
  data/          generated data (track outlines); never edit by hand
  scripts/       build-time scripts (build-tracks.ts)
  controllers/   Express handlers
  routes/        Express routers
  mcp/tools/     MCP tool definitions
  utils/         small helpers
```

Scripts: `npm run dev` (tsx watch, loads `.env`), `npm run typecheck`, `npm test` (node:test via tsx, `*.test.ts` next to the code), `npm run build:tracks` (regenerates track outlines), `npm run build` (tsc to `build/`, then tsc-alias rewrites `@/` to relative paths), `npm start`.
Local MongoDB runs in Docker: `docker compose up -d` (`compose.yaml`, `mongo:7`, bound to 127.0.0.1, `mongo-data` volume). `MONGODB_URI` is required; tests use `.env.test` (committed, no secrets) and the `desk-hub-test` database; DB tests skip when Mongo is down.
Node 22+, TypeScript 6, ESM (`"type": "module"`, NodeNext). Express, Mongoose and the MCP SDK get added in the steps that need them.

## Status

Steps 1–5 done. Next: step 6, aggregator payload and device WebSocket.

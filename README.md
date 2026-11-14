# Desk Hub backend

Node + TypeScript backend for Desk Hub: an ESP32-S3 touch display, a React web app and the Jarvis voice assistant.

## Setup

1. `cp .env.example .env`
2. `docker compose up -d` to start MongoDB
3. `npm install` then `npm run dev`

## Scripts

- `npm run dev` – run with watch mode
- `npm run typecheck` – type check
- `npm run build` / `npm start` – compile and run
- `npm run build:tracks` – regenerate `src/data/track-outlines.generated.ts`
- `npm run device:create -- "Desk display"` – register a display and print its key (shown once)
- `npm run device:list` – list displays, when they were last seen, and which are revoked
- `npm run device:revoke -- <id or name>` – revoke a display's key (disconnects it within 30s)

## Credits

- F1 data: [Jolpica F1 API](https://github.com/jolpica/jolpica-f1).
- Track outlines: [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) by Tomislav Bacinger, MIT licence. Outlines are simplified and normalised by `src/scripts/build-tracks.ts`.

# StoryGenerator (Story Engine)

## Cursor Cloud specific instructions

Story Engine is a **local-first, client-only** React + Vite SPA (TypeScript). There is **no backend server and no database to provision** — all data persists in the browser (IndexedDB `story-engine-db` + localStorage). This means there is only one service to run.

### Services

| Task | Command | Notes |
|---|---|---|
| Run app (dev) | `npm run dev` | Vite dev server on port **5173**, bound to `0.0.0.0` (see `package.json`). There is no `vite.config.*`, so the port is the Vite default and is not configurable via config file. |
| Tests | `npm test` | Vitest (`vitest run`); pure logic/unit tests, no external services required. |
| Typecheck + build | `npm run build` | Runs `tsc --noEmit` then `vite build`. There is no separate lint script — `tsc --noEmit` is the type/static check. The Vite "chunks larger than 500 kB" warning is expected and not an error. |
| Preview prod build | `npm run preview` | Serves `dist/` on port **4173**. |

### Non-obvious notes

- **AI features are optional and need a user-supplied API key**, entered in the in-app Settings → AI page (stored in IndexedDB). There are **no `.env` files or environment variables** — do not look for them. Creating Universes, Player Characters, and Stories works fully offline without any key; only generation/regeneration and story gameplay call out to external LLM APIs (OpenAI / Gemini / OpenRouter / Anthropic).
- **Data model hierarchy is enforced**: you must create a **Universe** before a **Player Character**, and both before a **Story**. A minimal end-to-end smoke test is: New Universe → New Player Character (pick the universe) → New Story (pick universe + character).
- The `android/` directory is a **Capacitor** wrapper for mobile packaging; it is not needed for web development. Building it additionally requires the Android SDK/Gradle.
- `TECHNICAL_ARCHITECTURE.md` references a `StoryEngineDesktop/` Electron wrapper and Vercel repro snapshots that are **not present** in this checkout — only the web/mobile app exists here.

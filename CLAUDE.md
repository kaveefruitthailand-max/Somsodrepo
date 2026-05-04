# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**แอปส้มสด** ("Somsod App") — a Thai-language, mobile-first PWA for managing an orange-juice small business. It handles sales rooms, inventory, finance/P&L, factory production logs, staff registration, and a team chat. The UI is entirely in Thai.

## No Build Step

This is a zero-toolchain project. There are no build scripts, no bundler, no transpilation, and no test runner. The three static files (`index.html`, `app.js`, `style.css`) are served directly as-is.

- `package.json` only lists dependencies used by the Netlify serverless functions, not the frontend.
- Install function deps: `npm install`
- Local development: open `index.html` in a browser, or use `netlify dev` to run functions locally alongside the static files.
- Deploy: push to the connected Git branch — Netlify auto-deploys.

## Architecture

### Frontend
One large single-page application with no framework:
- `index.html` — all HTML markup (662KB legacy backup exists as `index .html`)
- `app.js` — ~480KB of vanilla JS, all globals, no modules
- `style.css` — ~80KB, CSS custom properties, dark-themed

`app.js` is organized into labeled sections (search for `// SECTION NAME` comments). Major sections in order:
- **CONSTANTS / DEFAULT_CATEGORIES** — orange-juice product catalog seed data
- **SHARED STATE** — global `let` variables for every subsystem
- **Registration/Auth** (line ~3650) — multi-step user registration, 4-digit ID login
- **Factory** (line ~788) — production lots, bottling, empty-bottle tracking
- **Product List** (line ~927) — central product catalog with multi-unit support
- **Finance** (line ~1991) — P&L entries (รายรับ/รายจ่าย)
- **Firebase** (line ~2305) — optional Firebase Realtime DB integration
- **Sales Rooms** (lines ~2445, ~4365) — hierarchical 4-level room/queue structure
- **Chat Archive** (line ~3201) — admin-gated persistent chat
- **Inventory** (line ~6227) — stock with movements
- **Google Sheets Sync** (line ~7417) — debounced queue to GAS webhook
- **Admin Auth / Admin Page** (line ~7866) — 5-min unlock window, full admin panel
- **Chat Drawers** (line ~8292) — up to 3 side-popup chat rooms

### Netlify Functions (backend)
All functions live at two levels:
- Root `.mjs` files contain the actual implementation.
- `netlify/functions/*.mjs` are thin re-exports: `export { default, config } from '../../file.mjs'`

| File | Route | Purpose |
|---|---|---|
| `ai-chat.mjs` | `POST /api/ai-chat` | Claude Haiku chat with structured action extraction |
| `app-state.mjs` | `GET/POST /api/app-state` | Central state in Netlify DB (PostgreSQL) |
| `chat-messages.mjs` | `GET/POST/DELETE /api/chat-messages` | Persistent chat in Netlify DB |
| `login-event.mjs` | `POST /api/login-event` | Login + geolocation log in Netlify DB |
| `sheets-proxy.mjs` | `GET/POST /api/sheets` | Proxy to Google Apps Script; config in Netlify Blobs |

### Data Flow / State Layers

State is stored in three layers (priority order):

1. **`localStorage`** — primary in-browser store. All writes go here first via `saveLS(key, val)` / `getLS(key, default)`. Keys are prefixed `org_*`.
2. **Netlify DB (PostgreSQL)** — cloud sync via `/api/app-state`. A `scheduleAppStatePush(reason)` call debounces pushes. `pullAppState()` polls every 5 s once logged in. Server-side merge in `app-state.mjs` uses CRDT-style merge functions (last-write-wins by timestamp, union of deletions). Revision counter prevents redundant re-applies.
3. **Firebase Realtime Database** — optional secondary realtime channel. URL hard-coded to `DEFAULT_FB_URL`. Accessed via the raw Firebase REST + EventSource (SSE) API — no SDK.

Important: `appStateApplying=true` while applying a remote pull. Any `scheduleAppStatePush` call while this flag is set is dropped to prevent echo loops.

### Key `localStorage` Keys
`org_profile`, `org_reg_users`, `org_reg_deleted`, `org_fin`, `org_rooms`, `org_products`, `org_movements`, `org_product_list`, `org_cats`, `org_cats_rooms`, `org_chat`, `org_roles`, `org_user_roles`, `org_audit`, `org_unit_rules`, `org_syncq`, `org_app_state_client`, `org_state_key`

### Auth & Permission Model
- **No passwords.** Users log in with a 4-digit ID assigned at registration. Session expires after 24 h.
- **5 levels** — L1 เด็กฝึกงาน → L5 Admin. Stored on the user object as `level`.
- `MASTER_ADMIN_EMAIL = 'kaveefruit.thailand@gmail.com'` — always L5, bypasses approval.
- `MANAGER_CODE = 'SS000'` — unlocks product/ID edit pages for 5 minutes (`adminUnlockedUntil()`).
- Room visibility: L3+ see all rooms; L1/L2 only see rooms listed in their `extraRooms[]`.
- Granular permissions (`ALL_PERMS`) can be assigned via roles (admin UI).

### AI Integration (`ai-chat.mjs`)
- Model: `claude-haiku-4-5`, `max_tokens: 1200`
- Dual-path: tries Netlify AI Gateway first (`NETLIFY_AI_GATEWAY_BASE_URL` + `NETLIFY_AI_GATEWAY_KEY`), falls back to `ANTHROPIC_API_KEY` via SDK.
- The system prompt (Thai) instructs the AI to return structured JSON action blocks inside ` ```json ``` ` fences alongside conversational text. The frontend parses these with `extractActions()` and applies them to app state.
- Supported actions: `add_expense`, `add_income`, `add_product`, `edit_product`, `delete_product`, `add_sale`, `inventory_count`, `queue_sheet`, `query`
- Context (products, categories, recent sales/finance, rooms, factory state) is injected per-request, capped at 12 000 chars.

### Google Apps Script (`Apps-Script.gs`)
Deployed as a Google Apps Script web app. The Netlify `/api/sheets` function stores its URL in Netlify Blobs (`appsomsod-sync` store, key `gs_config`) and proxies sync payloads to it. The GAS script manages a Google Spreadsheet with ~10 sheets (daily log, inventory, movements, finance P&L, production, bottling, etc.).

## Conventions

- **All UI strings are Thai.** Keep them Thai when editing frontend code.
- **Global state only.** There is no component system, no props, no reactivity. Mutate the global `let` variables, then call the relevant `render*()` function.
- **Render on demand.** Most render functions re-build innerHTML from scratch. They read directly from the global arrays.
- **`scheduleAppStatePush(reason)` after every state mutation** that should sync to the cloud. Pass a descriptive reason string.
- **Never add `import`/`export` to `app.js` or `style.css`** — they are plain scripts/stylesheets, not ES modules.
- **Netlify function files** are ES modules (`"type": "module"` in `package.json`). The root `.mjs` holds logic; the `netlify/functions/` file re-exports it.
- **`cleanText(value, max)`** is used throughout the functions to sanitize/truncate inputs before DB writes.

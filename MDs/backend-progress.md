# FactoryLens — progress notes

Backend built first (see earlier note below), frontend added after. User
pushed the backend to github.com/Pannnnnnn/InvMgr themselves (this
sandbox's git proxy blocks pushes to repos outside its pre-authorized set,
so all git operations for this project have to happen on the user's own
machine — I can prep commits here but can't push).

## Manager auth + Thai/English UI + AI stock-scan (2026-09-24, v2)

User asked to require login for the backend/inventory screens only (floor
checkout stays login-free per PRD 7), add "keep me signed in," turn
`/checkout` into a browsable item-picker frontend, add an AI stock-photo
intake flow to inventory management, and support Thai (primary) + English.

Clarifying decisions (via AskUserQuestion):
- Manager role = a tag on the Supabase user: `app_metadata.role = "manager"`,
  set manually via the Supabase dashboard (not `user_metadata`, which users
  can edit themselves).
- Only managers need to log in at all — floor workers use `/checkout` with
  no account, unchanged from the original fault-tolerant design.
- AI stock-scan suggestions are always manager-reviewed before saving —
  nothing auto-writes to the catalog.

### What changed
- `src/lib/auth.ts` — added `requireManager()` (401 if unauthenticated, 403
  if authenticated but `app_metadata.role !== 'manager'`). `POST/PATCH
  /api/items*` and the new `/api/inventory/scan` are gated by it.
- `src/lib/gemini.ts` — added `extractStockFromPhoto()`: Gemini detects
  distinct items + estimated quantities from a shelf/box photo (structured
  JSON via `responseSchema`, same pattern as checkout extraction).
- `src/lib/resolver.ts` — added `suggestCatalogMatches()`, reuses the
  existing `search_items` trigram RPC to fuzzy-match each AI detection
  against the real catalog.
- `POST /api/inventory/scan` (new route) — manager-only; runs the above two
  and returns suggestions with candidates. Writes nothing itself.
- `src/components/StockScanModal.tsx` (new) — the manager review UI: every
  detected row is editable (name/qty/category/SKU/aliases), toggles between
  "create new item" and "add to existing item," and only checked rows get
  submitted via the existing `POST /api/items` / `PATCH /api/items/[id]`
  (`{adjust:{type:"RESTOCK",...}}`) endpoints — no new write endpoint
  needed.
- `src/lib/supabase-browser.ts` — dynamic storage adapter for "remember me":
  a preference flag picks `localStorage` (persists) vs `sessionStorage`
  (cleared on close) for the Supabase Auth client's session storage.
- `src/components/RequireManager.tsx` (new) — client-side page gate: signed
  out → redirect to `/login`; signed in but not a manager → "manager account
  required" message. Real enforcement is server-side (`requireManager`).
- `/inventory` and `/transactions` now wrap their content in
  `RequireManager`. `/checkout` and the API's checkout routes are still
  fully anonymous.
- `/checkout` rebuilt as two tabs: **Pick items** (new `ItemPicker.tsx` —
  tap-to-cart searchable catalog grid, replaces the old
  `ManualCheckoutDrawer.tsx`, which was deleted) and **Describe to AI**
  (existing free-text flow). Both share the worker-photo capture step and
  submit through the same atomic commit path as before.
- `/login` — added a "keep me signed in on this device" checkbox, redirects
  to `/inventory` on success instead of `/checkout`.
- `src/lib/i18n/` (new) — lightweight dictionary-based i18n, no external
  library. Thai is the default language (`dictionary.ts` has `th`/`en`
  blocks); `I18nProvider`/`useI18n()` gives `t(key, vars?)` with `{var}`
  interpolation; language choice persists to `localStorage` and is switched
  via a ไทย/EN toggle in the nav. All UI strings (nav, checkout, item
  picker, confirmation, login, inventory, add-item, stock-adjust,
  transactions, stock-scan) now go through `t()` — no hardcoded English
  left in any page/component.

### Delivery
Delivered as `factorylens-manager-i18n-update.zip` — a merge update (no
`.git`, `node_modules`, or `.next`), same rsync-merge pattern as before:
unzip, `rsync -a --exclude='.env.local' --exclude='.git'
--exclude='node_modules' --exclude='.next' <unzipped>/factorylens/
factorylens/`, then `npm install` (no new dependency this time, but safe to
re-run), `npm run dev`.

README.md rewritten with a new section 6 (manager login & role setup,
step-by-step App Metadata instructions) and section 7 (Thai/English i18n),
plus updated route/API tables.

### Verification done in this sandbox
Same constraints as before — npm registry blocked (403), so no real
`npm install`/`build`/`typecheck`. Used: (1) a brace/paren/bracket balance
script across all 39 `.ts`/`.tsx` files — clean; (2) a scratch-directory
`tsc --noEmit` pass with a synthetic tsconfig (no real `@types/react`/
`@types/node`, so `React`/`JSX` namespace errors, `process`/`Buffer` not
found, and implicit-`any` event-handler params are expected noise, not real
bugs — consistent with the false-positive pattern from the first pass).
One real issue this pass caught and fixed: `extractStockFromPhoto()`'s
`confidence` field widened to `string` instead of the `'HIGH'|'MEDIUM'|
'LOW'` union under `--strict`; fixed with an explicit `as` cast in
`src/lib/gemini.ts`. User should still run the real toolchain (`npm install
&& npm run typecheck && npm run build`) before deploying.

## Known gaps (carried over + new)
- No Supabase Realtime — inventory/transactions pages fetch on
  load/filter-change, not live-pushed across devices.
- No manager signup/invite flow; users created + tagged manually in the
  Supabase dashboard (documented in README section 6).
- Not yet deployed to Vercel.
- AI stock-scan quality depends on photo clarity/lighting — not yet tuned
  against a real catalog; `AUTO_MATCH_THRESHOLD`/similarity cutoffs in
  `StockScanModal.tsx`'s `toRow()` (currently >0.5 similarity to
  pre-select "existing item") may need adjusting once used in the tool
  room.

---

## Frontend v1 (2026-09-24, superseded by the above)
Tailwind CSS UI on top of the existing API, all in the same Next.js app
(`/home/claude/factorylens` in this session's workspace): `/checkout` (AI
chat assistant + manual drawer), `/inventory` (catalog, no auth yet),
`/transactions` (audit log, no auth yet), `/login` (optional operator
sign-in, checkout still worked signed out). Delivered as
`factorylens-frontend-update.zip`. Superseded by the manager-auth/i18n/
stock-scan pass above — `/inventory` and `/transactions` are now
manager-gated, and `ManualCheckoutDrawer.tsx` was deleted in favor of the
unified `/checkout` tabs.

## Original backend note (2026-09-23)
Built the backend for the AI Inventory Checkout Agent PRD as a Next.js 14
(App Router) API-only service.

### Decisions made with the user
- LLM provider: **Gemini** — `@google/generative-ai`, structured JSON
  output, multimodal image+text input.
- Data layer: **Supabase cloud** (real project), per the PRD.
- Repo: github.com/Pannnnnnn/InvMgr (private/public unspecified by user).

### What's implemented (backend)
- `supabase/migrations/0001`–`0005`: `items` + `transactions` tables, RLS,
  private `worker-photos` storage bucket, RPCs: `checkout_item`,
  `checkout_batch` (atomic multi-item), `return_item`, `search_items`
  (pg_trgm fuzzy match).
- `src/lib/gemini.ts` + `src/lib/resolver.ts`: Gemini extracts raw item
  mentions only; server-side trigram search resolves them against the real
  catalog — the LLM is never trusted with SKUs.
- `/api/checkout`: all-or-nothing AI checkout.
- `/api/transactions/manual`: 1-tap fallback, same atomic commit path.
- `/api/items/*`, `/api/transactions/*`: catalog CRUD + overrides, audit
  log with search/filter, return endpoint.
- Signed URLs only for worker photos, never public.

### Known limitation
npm registry blocked in this sandbox (403, org egress policy) — install/
build/typecheck can't be run here for either the backend or the frontend.
Manual review + syntax-focused `tsc` passes used instead; caught and fixed
a zod-union bug and some Map-typing bugs in the backend. User should run
the real toolchain themselves before deploying.

## Natural next steps
- Deploy to Vercel.
- Supabase Realtime for live-updating inventory/transactions views.
- Tune `AUTO_MATCH_THRESHOLD`/`AMBIGUOUS_GAP` in `src/lib/resolver.ts`
  against the real catalog once populated, to hit the PRD's >95%
  item-extraction-accuracy target.

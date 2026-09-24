# FactoryLens

AI Inventory Checkout Agent (see PRD). Next.js 14 App Router — API routes
+ Supabase (Postgres/Storage/Auth) + Gemini multimodal for photo+text
checkout parsing and photo-based stock intake, plus a Tailwind CSS frontend
(camera checkout, item picker, manager-only inventory management with AI
stock scanning, transaction log). Thai/English UI, Thai as the default
language for floor workers. See section 5 for the frontend routes and
section 6 for the manager login/role setup.

## 1. Set up Supabase (cloud)

1. Create a project at https://supabase.com/dashboard.
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     (Project Settings → API)
   - `GEMINI_API_KEY` (https://aistudio.google.com/apikey)
   - `GEMINI_MODEL` / `GEMINI_LITE_MODEL` — already defaulted in code (see `src/lib/env.ts`)
     if you don't set them; only override if Google renames/deprecates a model again
     (watch your `npm run dev` terminal for a 404 "model no longer available" error —
     it names the current replacement directly).
3. Run the migrations against your project's Postgres. Either:
   - **Supabase CLI** (recommended): `supabase link` then
     `supabase db push` using the SQL files in `supabase/migrations/` (copy
     them into a CLI-managed migrations folder, or run each file's SQL in
     the Dashboard's SQL Editor in order 0001 → 0005), **or**
   - **This repo's runner**: `DATABASE_URL=<connection string from Project
     Settings → Database → Connection string → URI> npm run db:migrate`
4. Optionally load `supabase/seed.sql` (SQL Editor) for a few sample
   catalog items to test checkout against.
5. Create at least one **manager** user in Supabase Auth and tag them as a
   manager — see section 6, this is required before `/inventory` or
   `/transactions` will work for anyone.

## 2. Install & run

```bash
npm install
npm run dev
```

> This sandbox's environment could not reach the npm registry
> (`registry.npmjs.org` returned 403 under this org's egress policy), so
> `npm install` was not run here and no build/typecheck was executed against
> real dependencies. Run `npm install && npm run typecheck && npm run build`
> yourself before deploying — the code was written and manually reviewed
> against the `@supabase/supabase-js`, `@google/generative-ai`, `zod`, and
> `next` APIs, but hasn't compiled in this session. If the type-checker
> flags anything (SDK APIs occasionally shift between versions), it's most
> likely a version-pinning tweak in `package.json`, not a logic error.

## 3. API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/checkout` | POST | AI checkout agent: photo + text → resolved items → atomic stock decrement + audit log |
| `/api/items` | GET | Inventory catalog (search, category filter, pagination) |
| `/api/items` | POST | Add a catalog item |
| `/api/items/[id]` | GET | Single item |
| `/api/items/[id]` | PATCH | Edit metadata, or `{ "adjust": {...} }` for restock/breakage/loss/correction |
| `/api/transactions` | GET | Audit log (filter by worker, item, status, date range) |
| `/api/transactions/[id]/return` | POST | Mark a BORROWED transaction RETURNED, restock the item |
| `/api/transactions/manual` | POST | Tap-to-pick checkout (no Gemini call) — same atomic commit path as `/api/checkout` |
| `/api/inventory/scan` | POST | **Manager-only.** Photo of shelf/stock → Gemini-detected items + fuzzy-matched catalog candidates. Nothing is written — see section 6. |
| `/api/checkout/translate-name` | POST | Given a typed worker name, tells the frontend whether it looks Burmese and offers a readable Thai transliteration (suggestion only — see section 5). |
| `/api/checkout/verify-photo` | POST | Given a photo, a quick advisory check for whether a human face is visible (capture-quality check, not identity verification — see section 5). |

### `/api/checkout` request

`multipart/form-data`:
- `image` (required) — worker/badge photo (jpeg/png/webp, ≤2MB — compress client-side per PRD 7)
- `text` (optional) — e.g. `"Took 2 torque wrenches and a multimeter"`
- `worker_name` (optional) — explicit override, skips AI name extraction

Responses (all `200`, except a successful commit which is `201`):
- `{"status": "CONFIRMED", "transactions": [...]}` — committed, stock decremented
- `{"status": "CLARIFICATION_NEEDED", "message": "...", ...}` — nothing written; ambiguous/unmatched items or vague input
- `{"status": "ACTION_NOT_SUPPORTED_HERE", ...}` — looks like a return; use the `/return` endpoint instead

### `/api/transactions/manual` request

`multipart/form-data`:
- `image` (required)
- `items` (required) — JSON string: `[{"item_id": "...", "quantity": 1}]`
- `worker_name`, `notes` (optional)

### `/api/checkout/translate-name` request
`application/json`: `{ "name": "..." }` → `{ "is_burmese": boolean, "thai_transliteration": string | null }`.

### `/api/checkout/verify-photo` request
`multipart/form-data`: `image` (required) → `{ "has_face": boolean, "confidence": "HIGH"|"MEDIUM"|"LOW" }`.

## 4. Design notes

- **Item resolution is server-side, not LLM-trusted.** Gemini only extracts
  raw entity mentions (item text, quantity, worker name) from the
  photo+text; matching those mentions to real catalog rows/SKUs happens via
  Postgres trigram similarity (`pg_trgm`, `search_items()` RPC) against
  `items.name` and `items.aliases`. This keeps the catalog authoritative and
  avoids the LLM hallucinating a SKU. Ambiguous or unmatched mentions return
  `CLARIFICATION_NEEDED` rather than guessing.
- **Multi-item checkouts are atomic.** A single photo+text checkout can
  cover several items ("2 torque wrenches and a multimeter"). The
  `checkout_batch()` Postgres function decrements every item's stock and
  inserts every transaction row inside one function call, so a mid-batch
  `INSUFFICIENT_STOCK` rolls back everything already applied in that call —
  never a partial checkout.
- **Fault tolerance (PRD 7).** `/api/transactions/manual` shares the same
  atomic commit path (`commitCheckout` in `src/lib/checkout.ts`) as the AI
  route, so the manual drawer and the AI agent produce identical audit
  records. Auth is optional on both checkout routes (`operator_id` is
  nullable) — a missing/expired operator session never blocks a checkout.
- **Photos are private.** The `worker-photos` Storage bucket has no public
  read policy; every API response resolves `photo_url` to a short-lived
  signed URL (`SIGNED_URL_TTL_SECONDS`, default 5 min) rather than exposing
  the raw object path.
- **Stock invariants are enforced in the database**, not just the API:
  `items` has `available_quantity >= 0` and `available_quantity <=
  total_quantity` check constraints, and `checkout_item`/`checkout_batch`
  only decrement when enough stock exists — safe even under concurrent
  requests.

## 5. Frontend

A Next.js App Router frontend sits on top of the API:

| Route | Purpose | Auth |
|---|---|---|
| `/checkout` | Floor checkout: worker photo + either tap-to-pick from the catalog or describe-to-AI (text). Home page redirects here. | None — floor workers never log in (PRD 7 fault tolerance). |
| `/inventory` | Catalog view — search, add items, manual stock overrides (restock/breakage/loss/correction), AI stock-photo scan. | **Manager only.** |
| `/transactions` | Audit log — filter by worker/item/status/date, photo thumbnails via signed URLs, mark-returned action. | **Manager only.** |
| `/login` | Sign-in (Supabase Auth email/password), with a "keep me signed in on this device" option. | — |
| `/register` | Self-registration (email/password/name). New accounts land as **pending** — unusable until an owner approves them. | — |
| `/admin` | Approval panel: list pending signups, approve at clearance 1 or 2, reject, or revoke an existing account. | **Owner (clearance 1) only.** |

Any signed-out visit to `/inventory`, `/transactions`, or `/admin` redirects to `/login`; a signed-in account that's still pending approval sees an "awaiting approval" message, and a signed-in but under-privileged account (e.g. a clearance-2 manager visiting `/admin`) sees a plain "you don't have access" message instead of the page (see `src/components/RequireClearance.tsx`, which takes a `min={1|2}` prop). Checkout itself never requires a login.

**New dependency:** Tailwind CSS (`tailwindcss`, `postcss`, `autoprefixer` — already added to `package.json`'s devDependencies). Re-run `npm install` after pulling these files to pick it up, then `npm run dev` as before — the frontend is served from the same Next.js app as the API, no separate process.

Client-side image compression is implemented (`src/lib/image.ts`) — photos are resized/re-encoded toward ~1.5MB before upload, addressing PRD 7's Wi-Fi/cellular latency requirement; the server's 2MB cap (`src/lib/storage.ts`) is the backstop, not the primary control.

## 6. Registration, approval & clearance levels (2026-09-24)

Only approved managers/owners can sign in and reach `/inventory`, `/transactions`, or `/admin`; floor workers use `/checkout` with no account at all.

**Clearance levels:**
- **1 — dev/owner.** Full manager-level access, plus `/admin` (approve/reject signups, promote/demote, revoke access).
- **2 — manager.** Catalog + stock-adjustment + transactions access, same as before. No `/admin` access.

**How it works:**
1. Anyone can self-register at `/register` (name, email, password). This creates a real Supabase Auth user immediately, but tagged `app_metadata: { "status": "pending" }` — they can technically sign in, but every gated page/route treats a non-`approved` account as unauthorized, so they'll just see an "awaiting approval" message.
2. An owner opens `/admin`, sees the pending signup, and clicks **Approve as level 1** or **Approve as level 2**. This sets `app_metadata: { "status": "approved", "clearance": 1 | 2 }` via the Supabase service-role key (never client-editable `user_metadata`, which the signed-in user could tamper with).
3. The approved account can now sign in at `/login` and immediately has the access their clearance level grants. Checking "keep me signed in on this device" stores the session in `localStorage` (survives closing the browser); leaving it unchecked uses `sessionStorage` (cleared when the tab/browser closes).
4. From `/admin`, an owner can also change an already-approved account's clearance level, or **Revoke access** (deletes the Supabase Auth user outright — used for both rejecting a pending signup and removing someone's access later). An owner can't revoke their own account from the UI.

Server-side enforcement lives in `requireManager()` (clearance 1 or 2) and `requireOwner()` (clearance 1 only) in `src/lib/auth.ts`, applied to every catalog-write, stock-scan, and admin route — the frontend's `RequireClearance` gate is UX only, not the real security boundary.

**Bootstrapping the very first owner:** `/admin` itself requires an existing owner to approve anyone, including the first one — a chicken-and-egg problem the in-app flow can't solve on its own. Register your own account at `/register` once, then run:
```bash
node scripts/bootstrap-owner.mjs you@example.com
```
This reads `SUPABASE_SERVICE_ROLE_KEY` straight from `.env.local` and approves that one account as clearance 1 — no dashboard hunting required (the Studio dashboard doesn't currently expose a straightforward `app_metadata` editor on the Users page). After that, every future approval (including additional owners) can happen entirely from `/admin`.

### AI stock intake (manager-only, photo → catalog)

From `/inventory`, "📷 Scan stock photo" uploads a photo of a shelf/box to `POST /api/inventory/scan`. Gemini identifies each distinct item and an estimated quantity; each detection is then fuzzy-matched against the existing catalog (same `search_items` trigram RPC used by checkout) so the review screen can suggest "this looks like an existing item" vs. "this looks new."

**Nothing is written by the scan itself.** The manager reviews every row — editable name/quantity/category/SKU/aliases, and a toggle between "add to existing item" (submits a `RESTOCK` adjustment) and "create new item" (submits a new catalog entry) — and only rows they keep checked are saved, via the same `POST /api/items` / `PATCH /api/items/[id]` endpoints the manual "Add item" and "Adjust stock" forms use. This matches the PRD's requirement that AI suggestions are always manager-reviewed before anything changes the live catalog.

## 7. Checkout aids: Burmese name transliteration & face check

Two small AI-assisted aids on `/checkout`, both advisory only — neither ever blocks a checkout (PRD 7 — fault tolerance). Both run on `GEMINI_LITE_MODEL` (default `gemini-3.5-flash-lite`), not the full `GEMINI_MODEL` used for checkout item-extraction and stock-scan — those need the accuracy the PRD targets, these two are simple classification/yes-a-face-or-no calls that don't, so they're cheaper and faster on the lite tier instead:

- **Burmese → Thai name transliteration.** Many floor workers are Burmese migrant workers; the tool-room operator often can't read a name typed in Burmese script, or pronounce a romanized one ("Aung Zaw"). Tapping "ถอดเป็นไทย" / "To Thai" next to the worker-name field calls Gemini (`transliterateWorkerName()` in `src/lib/gemini.ts`, via `/api/checkout/translate-name`), which decides whether the text looks like a Burmese name and — if so — offers a readable Thai-script phonetic rendering (pronunciation, not meaning) as a tappable suggestion. Nothing changes automatically; the operator accepts or ignores it, and the accepted text just becomes the normal `worker_name` — no new schema.
- **Worker-photo face check.** Right after the operator captures the worker photo, `PhotoCapture` (with `checkFace` — only used on `/checkout`, not the shelf-photo scan in `/inventory`) runs a quick background check (`checkPhotoHasFace()`, via `/api/checkout/verify-photo`) for whether a human face is visible, and shows a small badge ("✓ Face detected" / "⚠ No face detected — you can still check out"). This is a **capture-quality sanity check only** — catching an accidental photo of the floor or a thumb over the lens — explicitly **not** identity verification or facial recognition against anyone (PRD 8 puts biometric/facial ID out of scope; this never compares against a database). If the check itself fails (AI error, timeout), the badge just doesn't appear — never surfaced as an error.

## 8. Thai/English UI

The UI ships with a small built-in i18n layer (`src/lib/i18n/`), no external library. **Thai is the default language**, since most floor workers aren't fluent in English; a ไทย/EN toggle in the top nav switches languages instantly and remembers the choice per-browser (`localStorage`). All checkout, login, inventory, stock-scan, and transactions copy is translated — add new UI text by adding a key to both the `th` and `en` blocks in `src/lib/i18n/dictionary.ts` and calling `t('your.key')` from `useI18n()`.

### Not yet built
- Badge OCR is delegated entirely to Gemini's vision input during `/api/checkout`, not a separate OCR pipeline — revisit if accuracy on badges specifically needs tuning.
- Real-time updates (e.g. Supabase Realtime subscriptions so the inventory/transactions views update live across multiple manager devices) — current pages fetch on load/filter-change, not push-updated.

# FactoryLens — backend

AI Inventory Checkout Agent backend (see PRD). Next.js 14 App Router API
routes + Supabase (Postgres/Storage/Auth) + Gemini multimodal for
photo+text checkout parsing. No frontend UI yet — this is the API layer.

## 1. Set up Supabase (cloud)

1. Create a project at https://supabase.com/dashboard.
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     (Project Settings → API)
   - `GEMINI_API_KEY` (https://aistudio.google.com/apikey)
3. Run the migrations against your project's Postgres. Either:
   - **Supabase CLI** (recommended): `supabase link` then
     `supabase db push` using the SQL files in `supabase/migrations/` (copy
     them into a CLI-managed migrations folder, or run each file's SQL in
     the Dashboard's SQL Editor in order 0001 → 0005), **or**
   - **This repo's runner**: `DATABASE_URL=<connection string from Project
     Settings → Database → Connection string → URI> npm run db:migrate`
4. Optionally load `supabase/seed.sql` (SQL Editor) for a few sample
   catalog items to test checkout against.
5. Create at least one operator user in Supabase Auth (Dashboard →
   Authentication → Users) — API calls that require auth expect a Supabase
   Auth access token in `Authorization: Bearer <token>`.

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
| `/api/transactions/manual` | POST | 1-tap manual checkout drawer — bypasses Gemini entirely (PRD 7 fault tolerance) |

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

## 5. Not yet built

- Frontend (camera capture UI, chat interface, dashboard, manual drawer UI) — this session was backend-only per request.
- Client-side image compression (PRD 7 names this as a frontend responsibility; the backend enforces a 2MB upload ceiling as a backstop).
- Badge OCR is delegated to Gemini's vision input, not a separate OCR pipeline — revisit if accuracy on badges specifically needs tuning.

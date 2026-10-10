# ApparelFlow ERP — Cutting Operations & Gatekeeper Verification Terminal

A full-stack Next.js + Supabase (PostgreSQL) application implementing the
Cutting Gatekeeper checkpoint of ApparelFlow ERP: cut batches must be
verified component-by-component before they can reach the Sewing Queue,
and that rule is enforced on the server, not just in the UI.

- **Live app:** _add your Vercel URL here_
- **Repository:** https://github.com/Keerththan/apparelflow-erp
- **AI usage report:** [`AI_OPTIMIZATION_REPORT.md`](./AI_OPTIMIZATION_REPORT.md)

## Demo credentials

Use the **Demo credential panel** on `/login` (one click per persona) or the
**Persona** switcher in the header once signed in.

| Role | Email | Password | Workspace |
|---|---|---|---|
| Cutting Supervisor (`cutting_supervisor`) | `supervisor@apparelflow.demo` | `Supervisor#2026` | `/supervisor` |
| Cutting Verifier (`cutting_verifier`) | `verifier@apparelflow.demo` | `Verifier#2026` | `/verifier` |
| Sewing Supervisor (`sewing_supervisor`) | `sewing@apparelflow.demo` | `Sewing#2026` | `/sewing` |

## Evaluator walkthrough (≈5 minutes)

1. **Supervisor** → *+ New cutting order* → pick *REC-BL01 Casual Blouse*,
   target `50`, roll `FAB-ROLL-882`, fabric `93`. Expected counts update live
   (50 × 2 cuffs = 100). Try `-5`, `2.5`, `abc` to see inline errors.
   Create, then *Submit to QC*.
2. **Verifier** (order creation is not available here) → open the batch →
   enter one count below expected. The row turns **RED** and
   *Approve Batch* is disabled with the reason shown.
3. *Reject Batch…* → try an empty reason (blocked) → enter a reason → reject.
4. **Supervisor** sees the reason → *Re-cut* → *Submit to QC* again.
5. **Verifier** enters exact counts → *Approve Batch*.
6. **Sewing** sees only that verified batch with piece counts, verifier
   attribution, wastage % and audit notes → *Start Sewing Assembly*.
   Refresh at any point — everything is persisted in PostgreSQL.

### Testing the API directly (Postman / cURL)

Every route accepts the browser session cookie **or** a Supabase access
token as `Authorization: Bearer <token>`:

```bash
# 1. Get a token for a persona
curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"supervisor@apparelflow.demo","password":"Supervisor#2026"}'

# 2. A supervisor trying to approve → 403 Forbidden
curl -i -X POST "$APP_URL/api/orders/<order-id>/approve" \
  -H "Authorization: Bearer <supervisor-token>" -H "Content-Type: application/json" -d '{}'
```

| Method & path | Role | Notes |
|---|---|---|
| `POST /api/orders` | cutting_supervisor | `{ recipeId, targetQty, fabricRollId, actualFabricYds }` → 201 / 422 with `fieldErrors` |
| `POST /api/orders/:id/submit` | cutting_supervisor | `CUTTING_IN_PROGRESS → PENDING_VERIFICATION` |
| `POST /api/orders/:id/recut` | cutting_supervisor | `REJECTED → CUTTING_IN_PROGRESS`, optional `{ actualFabricYds }` |
| `PUT /api/orders/:id/counts` | cutting_verifier | `{ counts: [{ itemId, actualQty }] }` — saves progress |
| `POST /api/orders/:id/approve` | cutting_verifier | **422** if any component is RED or uncounted |
| `POST /api/orders/:id/reject` | cutting_verifier | `{ note, counts? }` — **422** without a note |
| `GET /api/sewing/queue` | sewing_supervisor | Only `VERIFIED` batches; query params are ignored |
| `POST /api/orders/:id/start-sewing` | sewing_supervisor | `VERIFIED → SEWING_IN_PROGRESS` |

Status codes: `401` no session · `403` wrong role · `404` not found ·
`409` illegal state transition · `422` validation / hard stop.

## Architecture

```
Browser (React 19 client components)
   │  fetch /api/*  (cookie session)          Postman / cURL (Bearer token)
   ▼                                            ▼
Next.js 16 Route Handlers  ── app/api/**/route.ts
   │  getAuthContext(): verifies JWT, loads role from public.profiles
   │  handlers (lib/server/handlers/*): 401/403, input validation → 422
   ▼  ctx.rpc(...)  — the ONLY write path
PostgreSQL (Supabase)
   ├─ SECURITY DEFINER functions: role from auth.uid(), business rules
   ├─ Triggers: legal state transitions, hard stop, immutable audit trail
   └─ Row Level Security: read isolation per role, no direct writes
```

**Defence in depth.** Each rule is enforced in more than one layer, and the
innermost layer (the database) holds even if the outer ones are bypassed:

| Rule | UI | API handler | DB function | Trigger / RLS |
|---|---|---|---|---|
| Only verifiers approve | button not shown | 403 | `AF403` | — |
| No approval with RED / uncounted | button disabled | → 422 | `AF422` | `AF422` on `→ VERIFIED` |
| Rejection needs a note | inline error | 422 | `AF422` | `CHECK` constraint |
| Sewing sees only verified | — | role check | `WHERE status = 'VERIFIED'` | RLS policy |
| Identity / timestamps from session | — | ignored if sent | `auth.uid()`, `now()` | — |
| Audit trail immutable | — | — | — | append-only + write-once triggers |

The Supabase publishable key is public, so anyone can call PostgREST
directly. That is why writes are revoked from API roles entirely and only
role-checked functions can change data.

### State machine

```
CUTTING_IN_PROGRESS ──submit──▶ PENDING_VERIFICATION ──approve──▶ VERIFIED ──start──▶ SEWING_IN_PROGRESS
        ▲                              │
        └────────── re-cut ◀── REJECTED ◀──reject (mandatory note)
```

Any other transition is rejected by the `cutting_orders_guard_update`
trigger, for every database user.

## Database schema

Migrations live in [`supabase/migrations`](./supabase/migrations) and are
applied in filename order.

| Table | Key columns | Relationships / notes |
|---|---|---|
| `auth.users` + `profiles` (= spec *users*) | `id, email, full_name, role, created_at` | Supabase Auth stores the bcrypt `password_hash`; `profiles` holds the app user. Role comes from admin-only `app_metadata`. |
| `recipes` | `id, recipe_code, name, category, std_fabric_yards, wastage_cap` | has many components & orders |
| `recipe_components` | `id, recipe_id, component_name, pieces_per_garment, image_url, sort_order` | belongs to recipe |
| `cutting_orders` | `id, order_no, recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, expected_fabric_yds, status, created_by, created_at, updated_at, submitted_at, verified_by, verified_at, wastage_pct, sewing_started_by, sewing_started_at` | belongs to recipe & user; has many items & logs |
| `verification_items` | `id, order_id, component_id, expected_qty, actual_qty, status, counted_at` | `status` is a **generated column** (GREEN/YELLOW/RED) — clients cannot write it |
| `verification_logs` | `id, order_id, verifier_id, decision, rejection_note, wastage_pct, variances (jsonb), created_at` | **append-only**; `variances` snapshots every component count |

Seeded recipes: **REC-BL01 Casual Blouse** (1.8 yds/pc, cap 5 %) and
**REC-CT02 Crop Top** (1.1 yds/pc, cap 8 %), with the components from the spec.

`Fabric Wastage % = (actual − expected) ÷ expected × 100`, where
`expected = target_qty × std_fabric_yards` (snapshotted at order creation).

## Project structure

```
app/
  login/                    sign-in + demo credential panel
  (workspace)/supervisor    orders list, create-order modal, submit, re-cut
  (workspace)/verifier      QC queue and count sheet (/verifier/[id])
  (workspace)/sewing        sewing queue and assembly line
  api/                      route handlers (thin wrappers)
lib/
  domain/                   pure rules: multiplier, traffic light, validators
  server/                   auth context, handlers, queries, HTTP mapping
supabase/migrations/        schema, triggers, RLS, functions, seed data
scripts/seed-demo-users.mjs creates the three personas
tests/                      Vitest suites (run against real Postgres)
```

## Running locally

```bash
npm install
cp .env.example .env.local      # fill in Supabase URL, publishable and secret keys
```

1. In the Supabase SQL Editor, run every file in `supabase/migrations` in
   filename order.
2. `npm run seed:users` — creates the three demo personas
   (needs `SUPABASE_SECRET_KEY`; that key is never exposed to the browser).
3. In Supabase → Authentication, disable public sign-ups.
4. `npm run dev` → http://localhost:3000

## Automated tests

```bash
npm test
```

The suite applies **all real migrations** to an in-process PostgreSQL
([PGlite](https://pglite.dev)) with a minimal Supabase `auth` stub, then
calls the API handlers as each role — so RLS, triggers and SQL functions
are exercised, not mocked. No network or Supabase project is needed.

| Spec test | Where |
|---|---|
| 1 — all-GREEN order approved by a verifier | `tests/verification-api.test.ts` |
| 2 — RED component blocks approval (422) | `tests/verification-api.test.ts` |
| 3 — rejection without a note fails validation | `tests/verification-api.test.ts` |
| 4 — non-verifiers get 403 on approval | `tests/verification-api.test.ts` |
| 5 — unapproved orders never in the Sewing Queue | `tests/sewing-api.test.ts` |

Also covered: input guards, forged verifier ids, audit-log immutability,
re-cut cycle, 401/404/409 paths, and an automated WCAG contrast audit of
the UI palette (`tests/contrast.test.ts`).

## Design decisions

- **Fabric yards allow up to 2 decimals.** The spec asks inputs to reject
  decimals; that applies to piece counts and batch quantities, which are
  whole numbers. Fabric is physically measured (e.g. 93.5 yds), so it
  accepts at most two decimal places and rejects everything else.
- **Wastage over the recipe cap is flagged, not blocked.** The spec only
  defines a hard stop for shortages; over-cap wastage is highlighted to the
  supervisor and sewing floor.
- **Re-cut flow.** A rejected batch returns to `CUTTING_IN_PROGRESS`, counts
  are cleared, and the rejection stays in the audit log.
- **Light theme only.** The UI pins `color-scheme: light` and sets explicit
  text and background colours on every input, so OS dark mode cannot
  produce light-on-light fields.

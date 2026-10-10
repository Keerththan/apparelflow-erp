# AI Optimization Report

This report documents, candidly, how AI was used to build the ApparelFlow
Cutting Gatekeeper, where the AI output was wrong, and how the system was
hardened so that a mistake in any one layer cannot let an unverified batch
reach the sewing floor.

## 1. Tools & Prompting

| Tool | Used for |
|---|---|
| **Claude Code** (Anthropic's terminal coding agent, Claude Opus 5.5) | Reading the challenge PDF and auditing my Day 1 setup against it; schema and migration design; SQL functions, triggers and RLS; API route handlers; React UI; Vitest suites; README and this report's first draft |
| _Add any other tools you used (e.g. for the Day 1 Next.js/Supabase setup)_ | |

**How I prompted.** I gave the agent the full specification and set working
rules up front rather than asking for "an app":

- Build in small, atomic features and commit after each one, so the history
  shows iterative development.
- Follow the Next.js 16 docs bundled in `node_modules/next/dist/docs`
  instead of assuming older APIs (Next 16 renamed `middleware` to `proxy`
  and enables Cache Components here, which changes how session reads work).
- Treat the database as the security boundary: the publishable Supabase key
  is public, so anything enforced only in Next.js can be bypassed with a
  direct PostgREST call.
- Validate every SQL migration locally before I apply it to Supabase. Since
  Docker/psql were not available, the agent ran migrations in PGlite
  (in-process Postgres) — this later became the automated test harness.

My own role was to make the product decisions, apply the migrations in the
Supabase SQL editor, run the app and click through every persona, report
defects, and review the code before pushing.

## 2. Flawed / Broken AI Code

These are real defects from this project, in the order they were found.

### 2.1 Profile trigger rejected every user (wrong assumption about a third-party API)

The AI's first `handle_new_auth_user` trigger ran `AFTER INSERT` on
`auth.users` and raised an error if `app_metadata.role` was missing. It
passed the AI's local test — but that test inserted the role in the same
`INSERT`. When I ran `npm run seed:users` against real Supabase, all three
users failed with *"Database error creating new user"*.

**Root cause:** Supabase Auth's admin `createUser` inserts the user row
first and writes `app_metadata` in a separate `UPDATE`
(`internal/api/admin.go`: `tx.Create(user)` → `UpdateAppMetaData`). The
trigger never saw the role, raised, and rolled back the whole creation. The
AI had assumed a single-statement write without checking, and its test stub
encoded the same wrong assumption.

**Fix:** migration `000600` fires on `INSERT OR UPDATE OF raw_app_meta_data`
and upserts the profile; a user without a role simply gets no profile.
While fixing it we also found that a signed-in user *without* a role could
still read recipes and profiles (policies only checked `authenticated`), so
those policies now require `current_app_role() IS NOT NULL`.

### 2.2 Persona switcher stayed disabled (React state sync bug)

The AI's `SessionControls` set `busy = true` while switching persona and
only reset it on error. After a successful switch I noticed the **Sign out**
button showed a "not-allowed" cursor and could not be clicked.

**Root cause:** the AI assumed navigation would remount the component. The
`(workspace)` layout persists across the switch, so the client component
kept its stale `busy` state. A failed `signOut()` had the same problem.

**First fix (incomplete):** `key={user.email}` on the controls so React
resets state when the signed-in user changes, and an error path that
re-enables the button.

**The real root cause surfaced later.** After signing out, the login page
came back stuck on *"Signing in…"* with every button disabled until a full
reload. With `cacheComponents` enabled, Next.js 16 does not unmount pages on
navigation — it hides them with React `<Activity>` and restores them with
their state. The AI-written login form never reset its `pending` state after
a successful sign-in because it assumed the page would be destroyed; the
same assumption was behind the persona-switcher bug, and the `key` fix only
covered switching to a *different* user.

**Final fix:** following the Next.js "Preserving UI state" guide, transient
state (`pending`/`busy`/errors) is reset in a `useLayoutEffect` cleanup,
which runs when Activity hides the page. The login form also clears the
typed password at that point so it does not linger in the hidden DOM. All
other action buttons already reset their state in `finally` blocks.
**Lesson:** the AI's mental model of the framework was out of date; reading
the bundled docs for the framework version actually installed found the
cause.

### 2.3 Component declared inside render

The first version of the create-order modal declared a `FieldError`
component *inside* the parent component's body. React treats it as a new
component type on every render, unmounting and remounting it on each
keystroke — a classic source of lost focus and wasted renders. Caught in
review before commit and replaced with a plain render helper.

### 2.4 Test that asserted the wrong thing

A sewing-queue test sorted rows with `ORDER BY status` and expected
alphabetical order. Postgres sorts enums by declaration order, so the test
failed even though the data was correct. Fixed by sorting in the test; it
is a reminder that a red test can be a bug in the test, not the code.

### 2.5 Smaller issues caught by the toolchain

- Vitest 5 was installed without its `vite` peer dependency — the suite
  would not start until it was added.
- A type-narrowing helper (`"response" in g`) compiled to
  `Response | undefined`; `tsc` caught it and it was rewritten as an
  explicit discriminated union.

## 3. Human Refactoring

- **Every AI claim about external behaviour is now verified.** The trigger
  fix (2.1) was checked against the Supabase Auth source, and I re-ran the
  seed against the real project rather than trusting the local test.
- **Gates before every commit:** `tsc --noEmit`, `eslint`, `next build`, and
  `npm test`; nothing was committed with a failing gate.
- **Migrations are append-only.** Once a migration was applied to Supabase,
  fixes went into a new migration (e.g. `000600`) instead of editing history.
- **Tests run against real Postgres, not mocks.** The API handlers receive an
  `RpcClient`; in production it wraps `supabase.rpc`, in tests it runs the
  same SQL functions in PGlite with every real migration applied. This means
  RLS, triggers and the hard stop are what is being tested.
- **Day 1 gaps fixed:** the Supabase session helper existed but was never
  wired up (Next 16 needs `proxy.ts`) and did not call `getClaims()`, so
  sessions were never refreshed; the starter page queried a non-existent
  `todos` table.
- **Accessibility and contrast:** a single shared input style sets explicit
  text *and* background colours for every state, the app pins
  `color-scheme: light`, traffic lights pair colour with a symbol and a
  word, and `tests/contrast.test.ts` computes WCAG ratios from Tailwind's
  real OKLCH palette so a low-contrast change fails CI (lowest pair today:
  placeholders at 4.77:1).
- **No effect-driven state:** forms derive validation and traffic-light
  status from input state on each render instead of syncing with
  `useEffect`, avoiding re-render loops.

## 4. Defensive Architecture

The guiding rule: **the UI is a convenience, the database is the boundary.**

1. **No direct writes.** `INSERT/UPDATE/DELETE` are revoked from the
   `anon` and `authenticated` roles on every table. The only write path is a
   set of `SECURITY DEFINER` functions (`create_cutting_order`,
   `submit_cutting_order`, `approve_cutting_order`, `reject_cutting_order`,
   `recut_cutting_order`, `start_sewing_assembly`), each with
   `search_path = ''`.
2. **Identity from the session only.** Functions resolve the caller with
   `auth.uid()` and their role from `profiles`; the verifier id and
   timestamps are never parameters. A test sends a forged `verifierId` and
   `verifiedAt` in the body and asserts they are ignored.
3. **Roles are admin-assigned.** The role lives in `app_metadata` (only the
   service role can set it), never in user-editable `user_metadata`.
4. **State machine in a trigger.** `cutting_orders_guard_update` allows only
   `CUTTING_IN_PROGRESS → PENDING_VERIFICATION → VERIFIED|REJECTED`,
   `REJECTED → CUTTING_IN_PROGRESS` and `VERIFIED → SEWING_IN_PROGRESS`. On
   the transition to `VERIFIED` it re-checks that no component is RED or
   uncounted and that an `APPROVED` audit entry was written in the same
   transaction. This holds even for the service role or the SQL editor.
5. **Traffic light cannot be forged.** `verification_items.status` is a
   generated column computed from `expected_qty` and `actual_qty`.
6. **Immutable audit trail.** `verification_logs` rejects `UPDATE`,
   `DELETE` and `TRUNCATE`; verification fields on the order are write-once;
   counts freeze once the order leaves `PENDING_VERIFICATION`.
7. **Query isolation for the sewing floor.** RLS only exposes `VERIFIED` and
   `SEWING_IN_PROGRESS` orders (and their items/logs) to the sewing
   supervisor. `get_sewing_queue()` takes no parameters and hard-codes
   `WHERE status = 'VERIFIED'`, so URL manipulation has nothing to change.
   Starting sewing on an unverified order returns 404, not revealing it.
8. **Explicit HTTP semantics.** Functions raise custom SQLSTATEs (`AF403`,
   `AF404`, `AF409`, `AF422`) that the API maps to 403/404/409/422; route
   handlers additionally return 401/403/422 early with field-level errors.
   A test forges a context that *claims* supervisor while the session is the
   verifier, and the database still returns 403.

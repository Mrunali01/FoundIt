# FoundIt

Campus lost-and-found with searchable reports, explainable matching, private ownership claims and safe handovers. Evergreen Campus in Bengaluru and all seeded people and belongings are fictional.

## Run locally

Requires Node **22.18 or later** and npm. Node 22 LTS is recommended. This workspace includes an ignored portable Node copy in `.tools` because Node was absent from the machine; it is not part of the application source.

```powershell
cd D:\FoundIt
# Only needed on this machine if Node is not on PATH:
$env:Path = (Get-ChildItem .tools -Directory -Filter 'node-v22*' | Select-Object -First 1 -ExpandProperty FullName) + ';' + $env:Path
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open the URL printed by Next, normally http://127.0.0.1:3000. If that port is occupied, use `npm run dev -- --port 3100`. On macOS/Linux use `npm`, `cp .env.example .env.local`, and your installed Node runtime.

Demo mode needs no external credentials. Use **Sign in**, then select Aarav, Meera or the campus moderator. Use separate browser profiles/incognito windows to test both sides of a return. These intentionally open demo identities must only be used with fictional data.

The server automatically seeds 10 lost and 10 found reports on first access. The repository also has an explicit seed command:

```sh
npm run seed
# Stop the development server first. This deliberately replaces LOCAL demo records:
npm run seed -- --reset
```

`seed` refuses to replace an existing database unless `--reset` is supplied. Seeded examples include pending, approved, rejected and completed claims. Notifications from matching are generated from scored report pairs. Browser tests use a separate, fresh `.data/e2e-*` directory each run and never reset the development data.

## Architecture

- Next.js App Router, strict TypeScript, React, Tailwind CSS, Lucide and React Hook Form. Zod validates report and claim mutations on the server. Native labelled controls and browser confirmation dialogs provide the interface primitives; shadcn/ui is not a dependency.
- Server-rendered route wrapper with a client application shell. Each view loads its authorized snapshot from Route Handlers; unauthenticated users may browse public reports. Sensitive operations do not depend on client-side route guards.
- `lib/matching.ts`: deterministic scoring and supported explanations. Exact category compatibility, token-set overlap, color/brand, a 14-day date window and approximate location. Missing optional attributes are excluded from the denominator; titles with almost no overlap cap scores below the notification threshold. A score is **similarity, not ownership probability**.
- `lib/services/workflows.ts`: claim authorization and transitions. One approved claimant; completion resolves the found report and rejects competing pending claims. Only a finder or moderator who is not the claimant can approve or complete a handover.
- `lib/services/store.ts`: explicit local demo persistence using JSON, atomic replacement and a filesystem lock across Next route bundles. Files are under `.data`, including normalized WebP uploads. This survives local restarts; it is not remote storage or a serverless database. If a process is forcibly killed during a write and leaves an empty `.data/write.lock`, stop all FoundIt processes, then remove that empty directory before restarting.
- `app/api/reports`: debounced, server-side filters and pagination. Supabase uses indexed PostgreSQL full-text search; demo uses normalized token matching. The snapshot contains relevant report/match context rather than the entire noticeboard.
- `supabase/migrations`: real PostgreSQL schema, RLS, private bucket policies, transactional mutation RPCs and full-text search. Browser roles have read-only table access through RLS; writes use authorized RPCs. A service-role key is not used in the running app.

## Implemented routes

`/`, `/dashboard`, `/explore`, `/items/[id]`, `/report/lost`, `/report/found`, `/my-reports`, `/claims`, `/notifications`, `/settings`, `/admin`, `/login`, `/help`, `/privacy`.

Reporting supports one optional photo, previews, progress, removal, server validation, retry after failure, editing and duplicate-request protection. Claims use private written evidence, status history and a review note for handover instructions. Settings save display name and match-notification preference. Flags go to the moderator review list. Account deletion is a documented, in-person campus-office request; there is no automated deletion queue.

## Configure Supabase

Use a new Supabase project. No Supabase credentials were supplied during implementation; live hosted Auth email delivery and Storage integration still need verification against your project. PostgreSQL schema, RLS and RPC behavior are exercised locally with PGlite PostgreSQL and controlled Auth/Storage schema fixtures.

1. Create the project and obtain its project URL and publishable/anon key. Do not place a service-role key in a `NEXT_PUBLIC_*` variable.
2. In the SQL Editor apply **001_foundit.sql**, then **002_search.sql**, from `supabase/migrations/`, in order. These are fresh-project migrations, not idempotent repair scripts. They create the campus, profile signup trigger, reports, images metadata, matches, claims, notifications, flags, mutation keys, indexes and all RLS policies.
3. Alternatively, with the Supabase CLI installed, run:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

4. Edit `.env.local`:

   ```dotenv
   FOUNDIT_MODE=supabase
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
   ```

5. Enable Email authentication. Set the Auth Site URL to the application's origin, and allow the exact `/auth/confirm` URL for localhost and your deployment. Sign-up uses email/password and confirmation. Login, sign-out, reset emails, confirmation-code exchange and password changes are implemented. For token-hash email templates, use `/auth/confirm?token_hash={{ .TokenHash }}&type=email`, and `type=recovery` for resets. The callback supports both token-hash and PKCE code flows. The data/auth Route Handlers refresh cookie sessions; the page wrapper never reads private sessions directly.
6. Restart Next after changing environment variables. The top bar must show **CAMPUS MODE**, not **LOCAL DEMO**. Supabase failures return an error; the app never falls back to demo records.

College email-domain restrictions are intentionally **not enabled**: no actual campus domain was supplied. Configure a Supabase Before User Created Auth hook with your institution's approved domain if required. Do not use fictional `.example` seed addresses for real students.

## Storage

Migration 001 creates the **private** `item-images` bucket, with a 5 MB limit and WebP-only output. Incoming JPEG, PNG and WebP files are decoded and checked with Sharp, limited by size and pixel count, resized and encoded to WebP without EXIF metadata. Paths contain the authenticated owner UUID and a random UUID. Download policies require a report visible through RLS; the server returns five-minute signed URLs. They may remain usable until expiry after a report closes.

Claim evidence is text only; there is no publicly accessible evidence-file bucket. Do not upload student ID numbers or sensitive identity documents as report photos. A replaced report photo is cleaned up after the report saves. Removing a newly uploaded photo deletes the unattached file. Abandoning a form may leave an orphaned upload; schedule an operator cleanup of unreferenced objects before a broad campus rollout. The `item_images` table reserves metadata support for a future multi-image gallery; the MVP stores one image path on the report.

Vercel's request-body limit can be lower than 5 MB after multipart overhead. Use photos below 4 MB there; a failed upload displays a retryable message. Direct signed uploads with a trusted validation job would be the next scaling step.

## First moderator and campus configuration

Sign up normally, verify the user's identity with your campus office, then run this in the SQL Editor as an administrator:

```sql
update public.profiles
set role = 'moderator'
where id = (select id from auth.users where email = 'APPROVED_MODERATOR_EMAIL');
```

Users cannot assign their own role or campus. The first campus is deliberately fixed to a demo UUID in the signup trigger and anonymous browsing policy. To onboard a real institution, rename the campus row, change the UI campus label and replace the location list consistently in `lib/types.ts` and the database constraint. Supporting several campuses requires an enrollment/domain policy and an explicit public campus selector; merely adding rows does not implement enrollment security.

Tune the Supabase notification threshold as an administrator:

```sql
update public.campuses set match_threshold = 70 where slug = 'evergreen-demo';
```

Demo threshold is `MATCH_THRESHOLD` (default 65). Matching weights currently live in `lib/matching.ts` and the SQL `refresh_matches` function; change and test both together. Exact category matching intentionally favors precision. Refreshing a report updates existing pairs and suppresses duplicate notifications.

## Seed a disposable Supabase project

The seed script can create three fictional Auth users, 20 reports and four example claims. It intentionally requires an explicit guard and a password supplied by the operator. Use a clean test project; existing accounts cause it to stop. It grants no moderator privileges automatically.

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = 'https://YOUR_TEST_PROJECT.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = 'YOUR_TEST_PROJECT_SERVICE_KEY'
$env:ALLOW_DEMO_SEED = 'true'
$env:DEMO_SEED_PASSWORD = 'A-unique-test-password-at-least-12-characters'
npm.cmd run seed -- --supabase
```

Keys are read from the environment, never written by the script or printed. Remove them from your shell afterward. Test logins are `aarav.demo@foundit.example`, `meera.demo@foundit.example`, and `moderator.demo@foundit.example`, with your seed password. Grant the moderator role using the reviewed SQL above if desired. Sign in and refresh matches from an item page to generate stored match results and their notifications. The script uses the Supabase Auth admin API rather than manually fabricating Auth records.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm audit
```

Vitest covers normalization, similarity, missing fields, candidate filtering, explanations, thresholds, search, claim transitions, unauthorized access, real PostgreSQL RLS/RPC behavior, idempotency, match persistence, deduplicated notifications and consistent recovery completion. PGlite fixtures emulate Supabase's `auth.uid()` and storage catalog; they do not test the live GoTrue or Storage services.

Playwright starts its own demo server on **3107**, with an isolated data directory. It exercises report creation by two users, expected explained matches, private claims, approval, completion, unauthorized mutation rejection, moderator denial, anonymous claim isolation, mobile filtering and overflow, and desktop/mobile rendering. Screenshots are written to ignored `.tools/desktop.png` and `.tools/mobile.png`. No test runs against production Supabase data.

## Deploy to Vercel

1. Push this folder to your Git repository and import it into Vercel as a Next.js project.
2. Use Node 22, the lockfile, `npm ci`, and `npm run build`.
3. Set `FOUNDIT_MODE=supabase` and the two public Supabase variables in the target Vercel environment. Apply migrations before serving traffic.
4. Add the deployed origin and `/auth/confirm` URL in Supabase Auth URL configuration. Configure production SMTP and test sign-up, confirmation, reset, image upload, private claims and signed image reads using two test students.
5. Provision your reviewed moderator and replace fictional campus branding/locations.

Do **not** deploy file-backed demo mode to Vercel: its filesystem is ephemeral and cannot provide durable shared records. No deployment has been made by this repository build.

## Current limits and follow-up

- This is a working single-campus MVP. The initial data snapshot is capped at 500 eligible rows in Supabase; search is independently paginated, but dashboard and moderator statistics require dedicated aggregate queries before scaling beyond that context window.
- Claims support private text, not evidence attachments or a private chat. Review notes carry safe handover instructions. Completion is a finder/moderator attestation after physical return, not a two-party digital signature. Separate lost reports are closed by their owners after recovery; a matching suggestion does not prove which lost report should be resolved automatically.
- Public listings go live immediately; flags provide reactive review. There is no prepublication moderation queue, automatic suspicious-content detector, rate limiter, CAPTCHA, email/push notifications, Realtime subscription or GPS proximity calculation.
- Local demo storage is for development, not an internet-facing production service. Browser tests create isolated files under `.data/e2e-*`; old test directories may be removed after the test processes stop.
- Password email delivery, private Supabase Storage reads and the actual hosted session lifecycle require project credentials and a live smoke test. PGlite policy tests do not replace that final check.
- Optional semantic retrieval can implement a candidate-provider interface before `scorePair`. Keep campus/status filtering and private claims unchanged; never treat embeddings or heuristic similarity as ownership verification. No paid AI dependency is required.

Official references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Supabase server-side authentication](https://supabase.com/docs/guides/auth/server-side).

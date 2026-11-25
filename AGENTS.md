# Food app: short guide for AI agents

Phone and tablet app that runs the food business (jellies, cookies, baked goods) on top of Odoo 19. Expo / React Native, in `app/`. The plan is `plans/app-plan.md`; build one step of it per pull request. Expo-specific rules (fetch current docs, `npx expo install`, EAS) are in `app/AGENTS.md`.

## Commands (run from `app/`)
- Install: `npm ci`
- Typecheck: `npm run typecheck` (the gate; no lint script, don't add one without asking)
- Tests (quiet): `npm test -- --ci --silent 2>&1 | tail -n 30`
- One file: `npx jest src/__tests__/<name>.test.ts --silent 2>&1 | tail -n 30`
- APK: CI only (`.github/workflows/android-apk.yml`). Never build locally.

## Directory map
- `app/src/app/`: Expo Router routes, thin. `app/src/screens/`: what each screen draws. `app/src/components/ui.tsx`: buttons, rows, cards.
- `app/src/lib/odoo.ts`: the Odoo client (JSON-RPC). `useOdoo.tsx`: sign-in, offline sign-in from saved details.
- `roles.ts` / `useRoles.tsx`: roles are Employee tags in Odoo; Odoo admins are always Owner.
- `brand.ts` / `palette.ts` / `useBrand.tsx`: name, logo and colors from the Odoo company, made readable.
- `queue.ts` / `useQueue.tsx`: the offline queue. Every save goes through `useQueue().save`.
- `dbSwitch.ts`: live and test databases kept apart. `devFlags.ts`: Developer testing switches.
- `updateChannel.ts`, `otaUpdate.ts`: beta channel and over-the-air updates. `releaseNotes.ts`: What to test list.
- Tests: `app/src/__tests__/`, fake Odoo in `app/src/testing/fakeOdoo.ts`.

## Rules that must hold
1. **Odoo is the source of truth.** Every save goes to Odoo (through the queue). The phone keeps copies only so work goes on without signal. Products, recipes, prices, taxes, pickup and delivery options come from Odoo; the app never works out prices or taxes itself.
2. **Never bulk-write old phone data to Odoo in an update.** Only things a person did go in the queue. Queue entries are tagged with their database and never sent to another.
3. **The app never switches Odoo settings on** (inventory tracking, lots, expiry, apps). The connection check only reads.
4. **No automatic texting.** Payments are cash, Cash App and Venmo, set up in Odoo's Point of Sale. No card payments.
5. **Name, logo and colors come from the Odoo company.** No hard-coded brand.
6. **Owner-only setup lives in the management area**, hidden from other roles.
7. **Release number:** every change that ships to phones raises `extra.release` in `app/app.json` (0.1.x); leave `version` alone unless a new APK is needed. CI fails the PR otherwise.
8. Use `npx expo install` for packages, never plain `npm install <pkg>`.
9. Words on screen are plain and short. No jargon.

## Code review rules
Flag only P0/P1 problems: data loss, Odoo save or offline-queue conflicts (wrong database, double sends, lost entries), prices or taxes worked out in the app, brand hard-coded, owner-only screens shown to other roles, a missing release bump, broken tests. Skip style and formatting nitpicks.

## Keeping context small
Don't open `app/package-lock.json`, `node_modules/`, `coverage/`, `dist/` or `build/`. Read the directory map above before grepping. Run tests quietly (see Commands).

## PRs
Branch from main. **One bigger PR per feature**, tests in the same PR. The "Tests" check is the gate. `auto-merge.yml` merges a non-draft PR to main once Tests pass; merges reach the **beta** channel only. Production updates are a manual run by Justin. Use a draft PR for work that isn't ready.

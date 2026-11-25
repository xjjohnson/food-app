# Food app

The phone and tablet app for the food business, on top of Odoo 19. Odoo is
the single source of truth: everything saved in the app goes into Odoo, and
the phone keeps a copy only so work can carry on without signal.

The plan is `plans/app-plan.md` at the top of the repo.

## Screens and routes

| Route | Screen | Who |
| --- | --- | --- |
| `/` | Sign in, or Home (your work areas) | Everyone |
| `/area/[id]` | A work area (Production, Website orders, Stock, Ingredients, Market). Placeholders until each step is built. | By role |
| `/settings` | You, your roles, version, sign out. Seven taps on the version open Developer. | Everyone |
| `/waiting` | Changes waiting to send to Odoo | Everyone |
| `/management` | People and roles, company brand, setup | Owner |
| `/developer` | Test database, connection check, testing switches, offline queue, updates, What to test, log | Owner (also from the sign-in screen) |

Routes in `src/app/` stay thin; what a screen draws is in `src/screens/`.

## Roles

Owner, Production, Inventory, Sales, and Shipping and packaging. A person can
hold several. They are **Tags on the person's Employee** in Odoo's Employees
app (tag names `Owner`, `Production`, `Inventory`, `Sales`,
`Shipping and packaging`; `Shipping` or `Packaging` also work). Odoo
administrators are always Owner. The owner can set them in Management, which
adds or removes the tag in Odoo. A role only decides which screens show; what
someone may change is still up to their Odoo access rights.

## Brand

The app's name, logo and colors come from the signed-in person's Odoo
company: the company name and logo, and the primary and secondary colors from
Settings > Companies > Configure Document Layout. Colors are darkened or
lightened just enough that text on them stays readable. Nothing is written
back to Odoo.

## Working without signal

Every save goes through `useQueue().save`. With signal it goes straight to
Odoo; without, it waits in the queue and is sent oldest first when signal is
back (after sign-in, when the app comes back to the screen, and every minute).
If Odoo refuses a change, it is held for a look on the Waiting screen and
nothing after it is sent, so Odoo gets things in order. Each change is tagged
with its database and is never sent to another one. An app update never adds
anything to the queue.

Opening the app without signal keeps you signed in from the saved details.

## Test database

Developer > Database: type the test database's address, name, email and API
key, leave "This is a test copy" on, and Switch. The key is kept in the
phone's keystore only. The phone keeps each database's data apart and an
orange TEST DATABASE band shows on every screen while a test copy is attached.
Switch back from the same card.

## Release numbers

Every change that ships to phones raises `expo.extra.release` in `app.json`:
over-the-air only, add one to the last part (0.1.0 to 0.1.1) and leave
`version` alone. A change that needs new native code (a new APK) raises
`version` to the next `0.x.0` and sets `extra.release` to match. CI fails a
pull request that skips it (`scripts/check-release.mjs`).

## Beta and production updates

A merge to main runs the Android APK workflow: tests, the APK (on the
"Latest APK" release), and an over-the-air update to the **beta** channel.
Phones with Developer > Beta updates on get it. To give an update to
everyone, run the Android APK workflow by hand on main with "production".

## One-time setup in GitHub

1. Make `main` the default branch (Settings > General). The auto-merge
   workflow only runs from the default branch.
2. Allow GitHub Actions to read and write (Settings > Actions > General >
   Workflow permissions).
3. Signing key, so the APK is signed with the app's own key (repo secrets
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, optional
   `ANDROID_KEY_PASSWORD`, and the variable `ANDROID_KEY_ALIAS` if it isn't
   `foodapp`). Make one with:
   `keytool -genkeypair -storetype PKCS12 -keystore foodapp-release.p12 -alias foodapp -keyalg RSA -keysize 4096 -validity 10000`
   then `base64 -w0 foodapp-release.p12` for the secret. Keep the file safe:
   phones can only update with the same key.

## Over-the-air updates

1. Make an Expo project for the app at expo.dev (slug `food-app`) and copy its
   project id into the repo **variable** `EAS_PROJECT_ID`.
2. Make an Expo access token and save it as the repo **secret** `EXPO_TOKEN`.

Until both are set the APK builds without an update address and never updates
by itself; the workflow says so with a warning.

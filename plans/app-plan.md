# Food app plan (for approval)

Status: **approved by Justin on 2026-11-25.** Build starts with step 1, the foundation.
Written 2026-11-25 from Justin's answers in the project thread.

## What we're building

A phone and tablet app that runs the food business on top of our Odoo 19 database, so the team does everyday work in the app instead of the Odoo web screens. It works the same way as the garage door app:

- Everything saved in the app goes into Odoo. Odoo is the single source of truth.
- The phone shows live Odoo data, and keeps a local copy only so work can carry on without signal (for example at a market). Anything done offline waits in a queue and is sent to Odoo when signal comes back.
- Nothing is hard-coded. Products, recipes, prices, taxes, pickup and delivery options all come from Odoo. The app never works out taxes or prices itself.
- Owner-only setup lives in a management area that other staff can't see.

## The business

- **Products:** jellies, cookies and other baked goods.
- **Tracking:** every batch gets a batch number (Odoo calls it a "lot") and a use-by date. Lot and expiry tracking is already switched on in Odoo. The app will never change an Odoo setting by itself.
- **Where we sell:** our website shop (food.hivemindjohnson.work/shop) and in person with Point of Sale.
- **Getting orders to customers:** local delivery and pickup. No shipping carriers or printed postage labels.
- **Time clock:** not needed.

## Odoo apps we use

Installed: Sales, Invoicing, Website, eCommerce, Inventory, Purchase, Point of Sale, Manufacturing, Email Marketing, Employees, MuK Product, Events, Discuss, Contacts.

The app will use: **Manufacturing** (batches and recipes), **Inventory** (stock, batches, use-by dates, counts), **Sales and eCommerce** (website orders), **Purchase** (ingredients), **Point of Sale** (market sales), **Employees** (who is logged in and their role), **Contacts** (customers and suppliers).

Not installed, so not used: Barcode, Quality, Accounting, Attendances. The phone's camera can scan barcodes and QR codes without the Barcode app.

## Who uses it

| Role | What they do in the app |
|---|---|
| **Owner** | Everything, plus the management area: settings, who can see what, the low-stock and expiring-soon overview. |
| **Production** | See today's batches, start a batch, mark ingredients used, finish the batch, record the batch number and use-by date, print or show a batch label. |
| **Inventory** | Count stock, move stock between places, see what is running low and what is close to its use-by date. |
| **Sales** | Ring up sales at the market, look up customers and past orders. |
| **Shipping and packaging** | See website orders waiting to be packed, pack them (picking the oldest batch first), and hand them over for local delivery or pickup. |

One person can hold more than one role. Roles come from Odoo, and screens a person doesn't need are hidden.

## Top daily jobs, ranked

Justin's six jobs come first, in build order. Jobs 7 to 10 were suggestions, and Justin kept all four.

1. **Start a batch.** Pick a recipe (for example chocolate chip cookies, 4 dozen), and the app creates the Odoo manufacturing order and shows the ingredient list. It warns if an ingredient is short.
2. **Record the batch number and use-by date.** When the batch is finished, the app saves the batch number and use-by date in Odoo. It suggests a use-by date from the product's shelf life set in Odoo, and you can change it.
3. **Pack and hand over a website order.** See orders waiting, pack them (the app suggests the batch that expires first), and mark each order as delivered or picked up.
4. **Ring up a sale at the market.** See "Market sales" below, because this needs one decision from you.
5. **Count stock.** Walk the shelves, scan or pick a product, type the count. The app records which batch you counted, and Odoo updates the stock.
6. **Order ingredients.** See what is low, build a purchase order to a supplier, and check it in when it arrives (with the supplier's batch and date if you track those).
7. *(Suggestion)* **Expiring-soon list.** Batches close to their use-by date, so they can be sold first, discounted or thrown out (recording the waste in Odoo).
8. *(Suggestion)* **Today screen.** One screen per person: batches to make, orders to pack, pickups waiting, ingredients to order.
9. *(Suggestion)* **Find a batch (recall help).** Type or scan a batch number and see which ingredient batches went into it and which orders it went out on.
10. *(Suggestion)* **Product and price lookup.** Search a product to see its price, stock on hand by batch, and photo, all from Odoo.

## Market sales: one decision needed

Odoo's own Point of Sale screen already runs on a phone or tablet in the browser. It handles payments, receipts, batch numbers and working without signal. Building our own checkout inside the app is a large piece of work and would duplicate that.

**Decided (Justin, 2026-11-25):** the app has a "Market" button that opens Odoo's Point of Sale. Sales still land in Odoo and take stock off the right batch. We build our own checkout later only if Odoo's screen gets in the way.

**Payment methods:** cash, Cash App and Venmo. No card payments. These are set up in Odoo's Point of Sale, and the app just shows them.

## What we reuse from the garage door app

- The Odoo connection and the offline queue (save to Odoo, local copy only for offline, sync when back online).
- Login and roles, with owner screens hidden from staff.
- The management area, where all lists come from Odoo.
- Theme and brand setup. **Decided:** the app's name, logo and colors come from the Odoo company record.
- Beta and main update channels with over-the-air updates. Version numbers stay 0.x.y until a new install file is needed.
- Test dashboard and Developer screen (switch to the test database, testing tools).
- The camera scanner.
- The warehouse and purchasing plan from the garage app as a starting point for stock and ingredient ordering.

The garage door features themselves (springs, door jobs, field service) don't carry over.

## Safety rules

- Never bulk-send old phone data to Odoo in an update.
- No automatic texting.
- The app never changes an Odoo setting by itself. It may change one only when the owner taps a button that says exactly what it will change, in the management area, hidden from other roles. A person can still switch Track Inventory, lot tracking and expiry for one product from its screen (Justin, 2026-11-25).
- Taxes, price lists and terms come from Odoo only.
- A separate test database and API key, kept apart from the live database.

## Add and edit screens match Odoo's forms (Justin, 2026-11-25)
Every add or edit screen covers the fields of the matching Odoo form (products, ingredients, recipes, customers, suppliers, batches and lots, orders), not a minimal subset. Fields can be grouped in tabs or sections to suit a phone, and a field Odoo doesn't have is skipped. Where Odoo has a switch (Track Inventory, lot tracking, expiry), the person may flip it from the app.

## How we'll build it

- **One bigger pull request per feature.** Each one is tested and merged on its own.
- Merges go to the **beta channel only**, automatically once checks pass. Justin tests after a batch of merges and decides when anything goes to the main channel.
- Big features can be put on hold until Justin says go.

**Proposed order:**

1. **Foundation:** app shell copied from the garage door app, login and roles, the Odoo connection, offline queue, beta channel and test dashboard, all pointed at a test copy of the food database.
2. **Production:** start a batch, ingredients used, finish with batch number and use-by date (jobs 1 and 2).
3. **Website orders:** pack, oldest batch first, delivered or picked up (job 3).
4. **Stock:** counts, expiring-soon list, find a batch (jobs 5, 7 and 9).
5. **Ingredients:** low stock, purchase orders, checking deliveries in (job 6).
6. **Market:** the Point of Sale button, or our own checkout if you choose it (job 4).
7. **Today screen and product lookup** (jobs 8 and 10).

## Answers from Justin (2026-11-25)

1. Plan and build order: approved, starting with the foundation as its own pull request.
2. Market sales: open Odoo's Point of Sale from the app.
3. Payment methods: cash, Cash App, Venmo.
4. Suggestions 7 to 10: keep all four.
5. A test copy of the food database exists. Its web address and API key are entered on the app's Developer screen, never written into the code or chat.
6. Name, logo and colors: taken from the Odoo company.

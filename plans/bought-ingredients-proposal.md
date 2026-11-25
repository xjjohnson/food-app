# Proposal: one "Bought ingredients" flow (fix item 23)

Status: proposal only. Nothing is built. Justin decides, then says go.

## The problem
Receiving today is two screens under Ingredients: Purchase orders (to order) and Check in a delivery (to receive). That matches ordering ahead and getting a delivery later. It does not match how the business shops: go to the store, buy, then enter what was bought and what was paid. That is an order and a receipt in one go, so the two screens feel backwards.

## The flow (what Justin sees)
Ingredients menu, top button: **Bought ingredients** (the shopping flow). The old Purchase orders and Check in a delivery rows move under a small "Ordering ahead" row for the rare case.

1. **Who from.** Pick the store or supplier (searchable, from Odoo contacts; recent ones first; "Add a new one" opens the contact form). Date defaults to today.
2. **What you bought.** Add lines. For each line:
   - Ingredient (raw materials only, with Add a new ingredient, as in recipes)
   - How many, and the unit (starts as the ingredient's own unit)
   - Price paid: either **price each** or **total for the line**; typing one fills the other (a plain divide of what was typed; Odoo gets the price each)
   - Batch number and use-by date, only for ingredients that track batches (use-by starts from the shelf life in Odoo, as for finished batches)
3. **Check.** A summary page: each line, and the total as typed. Taxes are not worked out here; the supplier's tax comes from Odoo on the ingredient, as for any order.
4. **Save.** One button, "Save purchase". It works with no signal: it is kept on the phone and goes to Odoo when signal is back, in order.

## What happens in Odoo (the steps behind one Save)
Saved as one chain in the offline queue, tagged with the database, never sent twice:
1. Create the purchase order (supplier, lines with quantity, unit and the price paid). A token in its Source Document lets a retry find it if the answer was lost. (This part already exists as `placeOrderChange`.)
2. Confirm the order (Odoo makes the delivery, "WH/IN/..."). (Already exists: `button_confirm` after create.)
3. **Receive it (new).** Find the order's delivery by the token, put the received quantity (and batch number and use-by date for tracked ingredients) on each line, and validate. Skipped if the delivery is already done. This is today's check-in logic, pointed at the order the app just made instead of a person's tap.
4. **Bill, marked paid (new, Justin 2026-11-25).** Odoo makes the vendor bill from the received order, posts it, and registers a payment against it, so it shows as paid. The person picks how it was paid on the Check page (the payment journals Odoo has, such as Cash or Bank); it starts on the last one used. A "Not paid yet" choice leaves the bill open to pay later. Same safety as above: found again by the token, skipped if already done, and works offline in order. This needs Odoo's Accounting (Invoicing) app installed; the Developer check will say if it is missing, and the flow then stops at step 3 with a plain message.
5. Odoo then moves stock in and, with Average Cost on, updates each ingredient's cost from the price paid. The app never works out cost. (Item 14 shows Cost as read-only, and the Developer check warns if Raw Materials aren't on Average Cost.)

Taxes on the bill come from the order as Odoo works them out. Paying a bill uses Odoo's own payment step; the app does not work out amounts beyond what was typed.

Why the receive step finds the delivery by the token: the delivery has no id until the order is confirmed, which may happen later when offline. The step looks it up when it runs.

## Partial and mistakes
- Bought less than planned: not a concern here, since the lines are what was bought.
- A line entered wrong after saving: open the order from Purchase orders (confirmed orders can be changed since 0.1.14) for price or quantity, or return it in Odoo. A "Fix a purchase" button on the saved purchase is possible later.
- A supplier who delivers short, or orders ahead: use the existing Purchase orders and Check in a delivery, which stay as they are.

## Screens to build
1. Bought ingredients: supplier, date, lines, Save (one screen with an Add a line panel).
2. A saved list: recent purchases with state (Saved on the phone, Sent, Received) so Justin can see offline ones waiting.
3. Menu change: Bought ingredients first; "Ordering ahead" holds Purchase orders and Check in a delivery.

## Tests
Fake Odoo run: purchase saved offline then sent; order confirmed; delivery received with the price paid; bill made, posted and paid; Not paid yet leaves it open; no Accounting app gives a plain message; sent twice gives one order; tracked ingredient needs a batch number; price each and total stay in step.

## What I recommend
Build it as above, as one release. It reuses the order and check-in code and adds one new queue step (receive by token). About the size of release 0.1.14.

## Questions for Justin (none block the plan; defaults in brackets)
1. ~~Record payment?~~ Answered: yes, as a paid bill (step 4). Still to confirm: which payment journals should the picker offer (Cash, Bank, Cash App, Venmo)? [whatever Odoo's cash and bank journals are; the app lists them from Odoo]
2. Do you ever buy things that are not ingredients (jars, labels, boxes)? [Same flow; the picker has a switch to show all products]
3. Should the price paid default to the last price paid for that ingredient, so you only change it when it moved? [Yes]
4. Name of the button: "Bought ingredients", "Shopping trip" or "Receive purchase"? [Bought ingredients]

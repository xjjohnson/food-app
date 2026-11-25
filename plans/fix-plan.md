# Fix plan (from Justin's testing, 2026-11-25)

Running list. Each item is fixed in its own pull request, in the order Justin sends them. Newest status at the top of each item.

| # | What Justin found | Status |
|---|---|---|
| 1 | No way to see, add or edit ingredients (the Ingredients area only had Running low and Check in a delivery). | **Built in release 0.1.8**: Ingredients, Ingredient list. See, search by category, add and change name, category, cost, purchase taxes, reference, barcode, and add, change or remove vendor lines (price, minimum, days). New ingredients are made without Track Inventory (rule 3); the screen says to turn it on in Odoo. Unit of measure is picked when adding and read-only after. Mason Jar's variants show as one line. |

## Open questions for Justin
- Track Inventory: the app shows whether an ingredient has it, but never switches it on (project rule 3). Say if you want that changed for new ingredients.

# Fix plan (from Justin's testing, 2026-11-25)

Running list. Each item is fixed in its own pull request, in the order Justin sends them. Newest status at the top of each item.

| # | What Justin found | Status |
|---|---|---|
| 1 | No way to see, add or edit ingredients (the Ingredients area only had Running low and Check in a delivery). | **Built in release 0.1.8**: Ingredients, Ingredient list. See, search by category, add and change name, category, cost, purchase taxes, reference, barcode, and add, change or remove vendor lines (price, minimum, days). New ingredients are made without Track Inventory (rule 3); the screen says to turn it on in Odoo. Unit of measure is picked when adding and read-only after. Mason Jar's variants show as one line. |
| 2 | The recipe screen "doesn't have everything" compared with Odoo's recipe (BoM) form: no units, variant, reference, type, by-products or order, and a Save on every line. | Built in release 0.1.9: one Save for the whole recipe, with all of those. By-products and cost share use Odoo field names not yet checked on a live Odoo. |

## Open questions for Justin
- Track Inventory: the app shows whether an ingredient has it, but never switches it on (project rule 3). Say if you want that changed for new ingredients.

## Release 0.1.10 notes
- Done: product (all tabs), ingredients (All product details), customers and suppliers (address, terms, tags, notes), batches (all dates, notes, Add a batch), purchase orders (list, new, header fields), reorder rules (All rule settings), production batches (All batch details).
- Not done: lines on a purchase order and on a website order (quantity, unit, price) and the products on a production batch are still read-only in the app. Packagings on a product are view-only. Say if you want these next.
- Odoo 19 field names written from memory and not checked on a live Odoo: is_storable, tracking, lot_valuated, serial_prefix_format, use_expiration_date, use_time, removal_time, alert_time, hs_code, country_of_origin, website_ribbon_id, show_availability, out_of_stock_message, pos_categ_ids, pos_optional_product_ids, public_description, use_date, removal_date, alert_date. A field Odoo doesn't have is hidden, not an error.

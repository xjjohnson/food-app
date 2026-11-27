/**
 * What changed in each release, and what to try on the phone. Shown on the
 * Developer screen as a tick-list (testChecklist.ts keeps the ticks). Add a
 * new entry at the top with every release that ships to phones.
 */
export interface ReleaseNote {
  release: string;
  changes: string[];
  test: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    release: '0.1.94',
    changes: ['Copy a recipe to a new size now lists only that product’s own sizes, not every product.'],
    test: ['Recipes, open a recipe, Copy to a new size, tap New size. Only the other sizes of the same product show.'],
  },
  {
    release: '0.1.93',
    changes: ['Bought ingredients: tap an item to open its details right under it (how many, price, total, batch, unit, remove) instead of a different page. Tap it again to fold it.'],
    test: ['Buy, Bought ingredients: add an item and tap its row. The fields open under it. Change the price: the row total changes. Tap the row again: it folds. Remove takes it off the list.'],
  },
  {
    release: '0.1.92',
    changes: ['Bought ingredients is slimmer. From and Date share one card. What you bought shows as short receipt rows with a running total; tap a row to change how many, price, unit or batch, or to remove it. The item picker has slim rows, Ingredients / All products buttons, and lets you tick several items and add them together.'],
    test: ['Buy, Bought ingredients: pick a supplier, add two items at once, see two short rows and a total. Tap a row, change the price, tap Done: the row total changes. Check and save, then save: it receives into stock as before.'],
  },
  {
    release: '0.1.91',
    changes: ['On Sell, the red Late button is now Waiting for stock. It shows how many orders need product first, and opens Waiting for stock.'],
    test: ['Sell: the third button on top says Waiting for stock with the same count as the Waiting for stock row. Tap it: the orders needing product and What to make open.'],
  },
  {
    release: '0.1.90',
    changes: ['The packing step of an order that needs product says Needs product instead of Ready to pack.'],
    test: ['Open an order whose product has no stock: the tag at the top says Needs product and the Pack button is not offered.'],
  },
  {
    release: '0.1.89',
    changes: ['Orders that need product no longer say To pack. They move to Waiting for stock on the Sold board, which shows a red count. There you can add what is short to the planned batches on Make.'],
    test: ['Sell: an order with a product that has no stock should not be under To pack. Waiting for stock shows a count. Open it: the order says Needs product, and What to make has Add to planned batches. Tap it, then open Make, Plan batches: the batch is planned.'],
  },
  {
    release: '0.1.87',
    changes: ['Recipes: Copy to a new size. Pick the new jar, how much it makes and a scale for the ingredients, then check and save.'],
    test: ['Open a recipe, tap Copy to a new size, pick another size, scale 2, Next: amounts are doubled. Save recipe: a new recipe shows in the list and the old one is unchanged.'],
  },
  {
    release: '0.1.86',
    changes: ['Buy: the Shopping list row shows a red dot with how many things are on the list.'],
    test: ['Buy tab: the Shopping list dot matches the number of items on the Shopping list page.'],
  },
  {
    release: '0.1.85',
    changes: ['On Make, the OPEN heading above Batches, Recipes and Jars in stock now says YOUR KITCHEN.'],
    test: ['Make tab: the heading above Batches, Recipes and Jars in stock says Your kitchen.'],
  },
  {
    release: '0.1.84',
    changes: ['The Today tab and page are now called Home.'],
    test: ['Look at the bottom bar and the first page: they say Home, not Today.'],
  },
  {
    release: '0.1.83',
    changes: ['Red count dot on Expiring soon inside Stock, so the dot on Jars in stock leads you to it.'],
    test: ['Make, Jars in stock, Count, throw out, find a batch: Expiring soon shows the same red number as the dot on Jars in stock.'],
  },
  {
    release: '0.1.82',
    changes: ['Red count dots: on the Today, Buy, Make, Sell and More tabs, and on Running low, Batches, Jars in stock and Invoices. Zero shows nothing. New look everywhere: rounded header with a soft glow, bolder cards with shadows, colored icon tiles, and a floating bottom bar.'],
    test: ['Look at the bottom bar: tabs with work waiting show a red number. Open Buy, Make and Sell and check the rows (Running low, Batches, Invoices) show a dot. Check the header, cards and floating bottom bar look new.'],
  },
  {
    release: '0.1.81',
    changes: ['Sold board: the Next stop card on Ready and the cards on Done now list what is in the order (amount and product). The delivery charge is left out.'],
    test: ['Sell, Sold board: look at Ready and Done and check each order lists its products and amounts.'],
  },
  {
    release: '0.1.80',
    changes: ['The Sold board on the Sell page reads Odoo again each time you come back to it, so it no longer shows an order as To pack after you packed it.'],
    test: ['Sell: tap Pack it on an order and pack it, then go Back. The board should move it to Ready and match the Packed and To pack buttons at the top.'],
  },
  {
    release: '0.1.79',
    changes: ['Sell is one page: the Sold board (To pack, Ready, Done and its cards) sits right on the page under SOLD. Market, Quotes and open orders are under SELL. The Packed, To pack and Late buttons jump the board to that side.'],
    test: ['Sell: check the Sold board shows on the page with its three tabs. Tap Pack it on a card and Waiting for stock. Tap the Packed, To pack and Late buttons. Check Market is under SELL.'],
  },
  {
    release: '0.1.78',
    changes: ['The To pack list no longer shows the delivery charge (or any other service line) to tick off. Only products to pack are listed.'],
    test: ['Sell, Sold board, To pack: an order with a delivery charge should list only the products.'],
  },
  {
    release: '0.1.77',
    changes: ['Sold board, Done: each order is a slim card with the name, order number, date and Paid or Not paid. The payment buttons only open when you tap Record payment, so the card no longer flips from asking how they paid to Paid. Offline it shows no tag instead of guessing.'],
    test: ['Sell, Sold board, Done: check the slim cards and the Paid / Not paid words. Tap Record payment on an unpaid one and pick how they paid. Turn on airplane mode and check no tag is guessed.'],
  },
  {
    release: '0.1.76',
    changes: ['The How did it go? star rating is gone from the Sold board. Notes already saved on orders in Odoo are left alone.'],
    test: ['Sell, Sold board, Done: open a delivered order and check the star box is gone while Payment still shows.'],
  },
  {
    release: '0.1.75',
    changes: ['Sold board tabs are now To pack, Ready and Done. Ready holds packed orders waiting to go out, deliveries and pickups.'],
    test: ['Sell, Sold board: check the three tabs. Pack an order and see it move to Ready, then mark it delivered or picked up.'],
  },
  {
    release: '0.1.74',
    changes: ['Today header is tidier: a plain Today title, the business name as a small line under it (no more cut-off name), and a small round search button instead of the big white one.'],
    test: ['Open Today: check the title, the full business name under it, and that the round search button opens Search.'],
  },
  {
    release: '0.1.73',
    changes: ['Orders to pack on Today is the same number as To pack on Sell, and tapping it opens the Sold board on Pack.'],
    test: ['Compare Today, Orders to pack with Sell, To pack: they should match. Tap the Today tile and check it opens the Pack side of the Sold board.'],
  },
  {
    release: '0.1.72',
    changes: ['Website orders and the Sold board are one now. Orders due after today show on the Sold board under Upcoming, and the Sell buttons count them too. The Website orders row is gone from Sell; orders that wait for stock, with what to make, are a row at the bottom of the Sold board.'],
    test: ['Sell: the To pack number should match the Sold board. Open the Sold board, Pack: an order due later sits under Upcoming. Tap Waiting for stock at the bottom and check it opens.'],
  },
  {
    release: '0.1.71',
    changes: ['Start a batch is a short list of products now. Tap a product to open its sizes, then tap a size. A product with one size goes straight to how many.'],
    test: ['Make, Start a batch: open a product with several sizes, pick one and start or plan a batch. Then try a product with one size.'],
  },
  {
    release: '0.1.70',
    changes: ['Today numbers now update every time you open the Today tab, and when you pull the page down.'],
    test: ['Pack or add a website order, then open Today and check the tiles. Pull down on Today to refresh.'],
  },
  {
    release: '0.1.69',
    changes: ['Purchase history opens on All, grouped by day, and each bill lists what was bought (the first three items, then "+ more").', 'Tap a bill to see every line as before.'],
    test: ['Buy, Purchase history: check it shows All, day headings and items on each bill. Turn airplane mode on and open it again; the items should still show.'],
  },
  {
    release: '0.1.68',
    changes: ['Today has four quick buttons on top: I bought something, Start a batch, New order and Add task. The round + button no longer shows on Today.', 'Big tiles show Tasks, New website orders, Close to use-by date and Orders to pack. Only rows that are not zero are listed; the rest are named in one All clear line, with Show all.'],
    test: ['Today: tap each quick button and go Back. Tap each tile. Tap Show all and then Hide the empty ones.'],
  },
  {
    release: '0.1.67',
    changes: ['Recipes now use the same clean cards as the rest of the app: no dashed paper cards or serif titles on the recipe list or the recipe pages.'],
    test: ['Make, Recipes: check the list, then open a recipe, edit it and go Back.'],
  },
  {
    release: '0.1.66',
    changes: ['Buy is shorter: I bought something, then Plan, Your lists and Look back as labeled cards.', 'Purchase orders and Check in a delivery are no longer on the Buy page. Nothing is deleted in Odoo.'],
    test: ['Buy: open Running low, Shopping list, Ingredient list, Suppliers and Purchase history, and go Back from each. Check that I bought something still saves.'],
  },
  {
    release: '0.1.65',
    changes: ['Make is a kitchen home now: Start a batch, how many are planned, cooking and ready to finish, then Batches, Recipes and Jars in stock as their own pages.', 'Batches shows stage tabs and a card for each batch with a progress bar.', 'Recipes are one card per product with the sizes listed inside. Jars in stock shows each size as a chip, empty sizes faded.'],
    test: ['Make: check the counts, open Batches, Recipes and Jars in stock and go Back from each. Start a batch and find it under Batches.'],
  },
  {
    release: '0.1.64',
    changes: ['Market is one page now, with no Before, Selling and After buttons. A purple card on top shows the register and sales so far, then Get ready, Today and Close up.', 'Cash drawer and Price sheet are gone from Market; the Odoo Point of Sale handles both.'],
    test: ['Sell, Market: open the register from the top card, check sales show under Today, then try Check out, Check in, Day totals and Results.'],
  },
  {
    release: '0.1.63',
    changes: ['Sell is one page now: no Orders and Market buttons. Market is a row on that page.', 'Market now matches the design: Before, Selling and After bar with numbered step cards.', 'Delivery board is now called Sold board.', 'Sold board keeps Deliveries and Pickups in separate spaces, with no Pickup tag bubbles.'],
    test: ['Sell: open Market from its row and walk Before, Selling and After. Then Sold board: check Pack and Drive show Deliveries and Pickups apart.'],
  },
  {
    release: '0.1.62',
    changes: ['Delivery board now looks like the design: a flat Pack, Drive and Done bar instead of pill buttons, Pack cards with the name, a To pack or Late tag and the products to tick off, a Pickup tag on pickup stops, and no big Refresh and Back buttons at the bottom. Pack it opens the packing step for that order.'],
    test: ['Sell, Delivery board, Pack: see the products on each card, tick a few, tap Pack it and finish packing. Then check Drive and Done.'],
  },
  {
    release: '0.1.61',
    changes: ['Delivery board, Drive, now matches the design: a purple Next stop card on top with Navigate, Call and Delivered, then After that with slim numbered stops. Tap a stop to make it the next one, or use its arrows to move it.'],
    test: ['Sell, Delivery board, Drive: check the Next stop card, tap another stop to bring it up, move one with the arrows, then tap Delivered.'],
  },
  {
    release: '0.1.60',
    changes: ['New quote moved inside Quotes and open orders (a button at the top), so the Sell page has one fewer card.', 'New quote: pick the customer and tap Next: add products. It saves the quote and opens the product lines straight away, so you no longer reopen it to add products.'],
    test: ['Sell, Quotes and open orders, New quote: pick a customer, tap Next: add products, add a product line, then open the Send tab.'],
  },
  {
    release: '0.1.59',
    changes: [
      'Market redone: Before, Selling and After at the top. It opens on Selling while a register is open.',
      'Check out and Check in are real Odoo stock transfers to and from a Market place, batch by batch.',
      'Management, Odoo tab: a button that sets up market stock. It says exactly what it changes: turns on Storage Locations, adds the Market place, and makes the registers sell from Market. Nothing changes unless you tap it.',
      'Until that is set up, Check out and Check in stay the old note sheet.',
      'Delivery board, Drive: stops are tighter. One short address and phone line, Navigate and Call side by side, Delivered below, and the proof photo folds away until you tap it. Stop numbers show on every delivery.',
    ],
    test: [
      'Management, Odoo: tap Set up market stock in Odoo. In Odoo check Storage Locations is on, a Market place exists, and the register operation takes from Market.',
      'Market, Before, Check out: add a product, type an amount, Move to Market. In Odoo the transfer is done and the stock is in Market.',
      'Ring up a sale in the Point of Sale and close the register. Check the sale came off Market, not the pantry.',
      'Market, After, Check in: the count starts at what Odoo says is left. Move it back and check the pantry.',
    ],
  },
  {
    release: '0.1.58',
    changes: [
      'Delivery board redone: Pack, Drive and Done at the top. Drive shows the stops in order with small up and down arrows, and Sort by zip and Open in Maps side by side.',
      'The Packed, To pack and Late buttons on Sell open the board on that side.',
      'Invoices, Quotes and open orders and Website orders share one look: name, number and date, a colored tag and the amount. Invoices show counts on Owed, Paid and All, and overdue ones are red.',
      'New quote shows the customer first; addresses, price list, terms and dates are under More details (dates start as today and 30 days).',
      'Customers moved from Sell to More, with how many customers and who owes you.',
      'Wholesale order and Repeat orders are gone from Sell. Repeat the last order stays on a customer.',
    ],
    test: [
      'Sell, tap Packed: the board opens on Drive. Tap To pack: it opens on Pack.',
      'On Drive, move a stop with the arrows. Tap Delivered and pick how they paid.',
      'Open Invoices and check the counts, red Overdue tag and search.',
      'Start a New quote and open More details.',
      'More, tap Customers: find, add or change one.',
    ],
  },
  {
    release: '0.1.57',
    changes: [
      'Online shop now has just Specials and Delivery and pickup.',
      'Which products are on the shop is set on each product: open a product, then the Online tab. Published on the website and Sell when out of stock are the first two switches.',
      'Newsletter and Closed days are gone from the app. Nothing already saved in Odoo is changed. Website orders are under Sell.',
    ],
    test: [
      'More, Shop: only Specials and Delivery and pickup should be there.',
      'Make a product (or open one), Online tab: the first two switches are Published on the website and Sell when out of stock.',
      'Sell, Orders, Website orders: still opens.',
    ],
  },
  {
    release: '0.1.56',
    changes: [
      'Sell tab redesign: three colored buttons on top of Orders (green Packed, orange To pack, red Late) with counts read from Odoo. Tap one to open the delivery board.',
      'Customers has colored buttons too: Customers, Owe you (unpaid invoices) and Overdue.',
      'Orders are grouped under Today, Sell and Money as cards with tiles. Market is quiet cards with one Open register button, instead of big purple blocks.',
    ],
    test: [
      'Sell, Orders: check the three colored buttons. To pack should match the delivery board.',
      'Sell, Customers: Owe you and Overdue should match the unpaid invoices.',
      'Sell, Market: tap Open register, Day sheet, Price sheet.',
    ],
  },
  {
    release: '0.1.55',
    changes: [
      'The pages inside More now match the More page: each menu item is its own rounded card with a small tile, instead of bare text on the page. This covers Online shop and its pages, Money and reports and its pages, Management, Settings and Developer.',
      'Lists such as website orders show each order as a card with the amount on the right.',
    ],
    test: [
      'More, Shop: each item should be a card with a tile on the left.',
      'More, Money: the Reports and Money groups should have a small heading and card rows.',
      'Open a few pages from Shop and Money (website orders, specials, bills due) and check nothing looks cut off or cramped.',
    ],
  },
  {
    release: '0.1.54',
    changes: [
      'More page redesign: your business name and logo with your role at the top, quick buttons for Settings, Money and Shop, and an Owner only box for Management and Developer.',
      'Management is split into People, Setup and Odoo, and the repeated Money and Shop cards are gone.',
      'The bottom bar is words only. The long labels no longer break letter by letter.',
      'Money, This month: each product name has its own line with the amount under it, and the delivery charge is no longer listed as a product.',
      'More room at the bottom of every page so the plus button does not cover the last row.',
      'Settings, Look: choose Light, Dark or follow the phone.',
    ],
    test: [
      'More: check the header, the quick buttons and the Owner only box. Sign in as a helper: the owner items should be gone.',
      'More, Management: tap People, Setup and Odoo.',
      'Settings, Look: try Dark, then Light, then Phone setting.',
      'More, Money: This month should list each product on its own line, with no Delivery line.',
    ],
  },
  {
    release: '0.1.53',
    changes: ['A finished batch always shows What was made: how many were made and the yield against the plan. The cost lines show only when Odoo has a cost; otherwise it says Odoo has no cost for this batch yet. Before, the whole card was missing without a cost.'],
    test: ['Make, open a finished batch that has no cost in Odoo (for example 12 Classic Strawberry Jam): What was made should show the amount and yield.'],
  },
  {
    release: '0.1.52',
    changes: [
      'The delivery board keeps deliveries and pickups apart: a Deliveries / Pickups switch at the top, each with its count. Deliveries keep the route, stop numbers, address and proof photo. Pickups have no route, stops or address, only the customer, phone and the Picked up button.',
      'Stop numbers count only deliveries.',
      'The orders list says Delivery or Pickup on each order.',
    ],
    test: [
      'Sell, Orders, Delivery board: tap Deliveries and Pickups. A pickup order should not have a stop number or address.',
      'Sell, Orders: each order in the list says Delivery or Pickup.',
    ],
  },
  {
    release: '0.1.51',
    changes: ['Paying a purchase bill and paying on delivery now list your Odoo payment accounts (Bank, Cash and so on, as named in Odoo), the same list Bought ingredients uses. Before, they only knew Cash, Cash App and Venmo by name.'],
    test: ['Ingredients, Purchase orders, an order that is checked in, Lines tab: the Bill and payment card lists every account, including Bank.', 'Sell, Orders, Delivery board, Delivered: the Payment card lists the same accounts.'],
  },
  {
    release: '0.1.50',
    changes: [
      'The pack screen has one button, Pack. The Delivery / Pickup choice is gone: delivery or pickup is what the order says in Odoo, shown as "Delivery (set in Odoo): ...".',
      'Delivered or picked up is now its own step on the delivery board. Orders whose Odoo delivery method is a pickup show Picked up instead of Delivered.',
    ],
    test: [
      'Sell, Orders, open an order that is ready: there should be no Delivery / Pickup choice, and the button should say Pack.',
      'After packing, open the Delivery board: the order is under Packed. A pickup order has a Picked up button; a delivery order has Delivered.',
    ],
  },
  {
    release: '0.1.49',
    changes: ['A Take a photo of the bill button on a purchase order (after the delivery is in) and on every bill in Purchase history. The picture is kept on the bill in Odoo and waits on the phone without signal.'],
    test: ['Ingredients, Purchase orders, open an order, Lines tab, Bill and payment: tap Take a photo of the bill.', 'Ingredients, Purchase history, open a bill: the photo shows there too, and in Odoo on the bill.'],
  },
  {
    release: '0.1.48',
    changes: [
      'Purchase orders: the Lines tab now has the next step. Confirm order, then Check in the delivery, then Make the bill with Cash, Cash App or Venmo (or "not paid yet"). No more going to Odoo for the bill.',
      'A bill now shows how it was paid: date, Cash / Cash App / Venmo and the amount.',
      'Find a batch lists the newest batches right away, and narrows as you type.',
      'Orders Odoo is waiting on: each short line has Make a batch for this, which opens Start batch with the amount filled in. Website orders also has a What to make card that adds up everything short.',
    ],
    test: [
      'Ingredients, Purchase orders, open a quote, Lines tab: tap Confirm order. Then Check in the delivery. Then pick how you paid under Bill and payment.',
      'Open that bill in Purchase history: it should show how it was paid.',
      'Stock, Find a batch: the newest batches show before you type anything.',
      'Sell, Orders: a What to make card should list what is short. Tap one: Start batch opens with that amount.',
    ],
  },
  {
    release: '0.1.47',
    changes: [
      'Packing an order now reads the delivery method chosen at checkout: it shows "Chosen at checkout: Local delivery" and starts the Delivery / Pickup choice on what the order says. You can still change it.',
      'An order Odoo is waiting on says how short each line is, for example "Short by 2: need 3, 1 free. Finish a batch or count stock."',
      'A finished batch has Add a tasting for this batch and Shelf-life check for this batch, which open those logs with the batch filled in.',
    ],
    test: [
      'Sell, Orders, open a website order: it should say what was chosen at checkout, and Delivery or Pickup should start on that.',
      'Open an order that says Waiting for stock: each line says how short it is.',
      'Make, open a finished batch: tap Add a tasting for this batch. The product and batch should already be filled in.',
    ],
  },
  {
    release: '0.1.46',
    changes: [
      'Purchase orders: after you save a new order it opens straight on its lines, the Lines tab lists the lines, and a Confirm order button makes the delivery so Check in a delivery finds it. Check in says what to do when nothing is expected.',
      'Dates on every Odoo form (order date, expected arrival, batch dates and more) are a calendar with a No date button, not typed text.',
      'The Changes list no longer shows "Untaxed Amount: empty to empty"; empty changes are hidden and amounts show their numbers.',
      'Cottage-food rules: the owner can tap Change the rules, then Fill in the Texas rules, to start from the Texas state health department list (read 2026-11-27, with sources). Edit it and save. The app does not decide what is allowed.',
    ],
    test: [
      'Buy, Purchase orders, New order: pick a vendor, Save. It should open on the order lines. Add a line, then tap Confirm order. Then Check in a delivery should list it.',
      'Open any order or batch form: dates open a calendar.',
      'Safety and records, Cottage-food rules (owner): Change the rules, Fill in the Texas rules, read them, Save. Check the details against dshs.texas.gov.',
    ],
  },
  {
    release: '0.1.45',
    changes: [
      'Make, Jars in stock: sizes are grouped under each product with a total, use-by soon first, then the most in stock. Out-of-stock jars are hidden behind a Show out of stock button, anything a recipe uses as an ingredient is left out, and a Find a jar box shows on a long list.',
      'Tasting log and Shelf-life check fill themselves in: the day is today with a calendar, Who tasted it is you, Score is five stars, Look, Smell, Texture are one Good / Off choice that starts on Good, and Product or Batch number show names to tap. Saving keeps who and the day for the next entry.',
    ],
    test: [
      'Make, Jars in stock: the list should be grouped and sorted, with no ingredients and no zero jars. Tap Show out of stock to see them.',
      'Safety and records, Tasting log: Who tasted it is your name, tap a star score, tap a suggested batch or product, and save.',
      'Safety and records, Shelf-life check: the day is today, Look/Smell/Texture start on Good. Tap a batch number to pick it.',
    ],
  },
  {
    release: '0.1.44',
    changes: [
      'Finish batch now asks "How many were made?", starting at the planned amount, and saves it in Odoo.',
      'Fixed "You cannot set more than 1 lot": the batch number now replaces any lot on the batch, so a retry or second try keeps exactly one.',
      'Delivery and pickup methods open again. Odoo 19 has no zip code from/to fields, so the app only asks for fields Odoo has (and shows "Zip code starts with" if Odoo has it).',
    ],
    test: [
      'Make, a Cooking batch: Finish batch has a "How many were made?" box. Change it to a smaller number, finish, and check the batch page yield.',
      'Finish the Black Raspberry Jelly batch again: it should finish with no "more than 1 lot" message.',
      'More, Management, Online shop, Delivery and pickup methods: the list should open and a method should edit.',
    ],
  },
  {
    release: '0.1.43',
    changes: [
      'Pay on delivery: when you tap Move to Delivered, the app now makes the Odoo invoice for the order, and a Payment card asks how the customer paid: Cash, Cash App, Venmo, or Not paid yet.',
      'Cash, Cash App and Venmo mark the invoice paid in Odoo with the payment method of that name. Not paid yet leaves the invoice open under Money. Works without signal and is sent in order.',
    ],
    test: [
      'Sell, Orders, Delivery board: on a packed stop tap Move to Delivered. A Payment card should show.',
      'Tap Cash (or Cash App or Venmo). In Odoo the order should have a posted invoice that is Paid. If a method is missing, the card says to add it in Odoo, Accounting, Configuration, Journals.',
      'Try Not paid yet on another order: the invoice should be open under Money.',
    ],
  },
  {
    release: '0.1.42',
    changes: [
      'The use-by date on a batch is now a calendar, with +3 months, +6 months and +1 year buttons.',
      'It fills in by itself: first the product’s shelf life in Odoo, then the default shelf life the owner sets in More, Management, then six months. The batch page says which one it used.',
    ],
    test: [
      'Open a Cooking batch: the use-by date should be filled in, with a line saying where it came from.',
      'Tap the date: a calendar opens. Pick a day, or tap +3 months, +6 months or +1 year.',
      'More, Management, Shelf life: set a default in days and save. A product with no shelf life in Odoo should use it.',
    ],
  },
  {
    release: '0.1.41',
    changes: [
      'The Delivery board works again. Odoo 19 has no Mobile field on contacts, and the board (and the supplier call page) asked for it. They now ask only for fields Odoo has.',
      'Packing: a batch past its use-by date is used last, marked EXPIRED in the list, and a red warning shows above it.',
    ],
    test: [
      'Sell, Orders, Delivery board: the deliveries for today should show (no "Invalid field mobile" message).',
      'Open order S00002 to pack: batch 261126-13 should say EXPIRED, and the warning should show. Fix its date in Odoo, Inventory, Lots if it was a typing mistake.',
      'Buy, a supplier: the call and map buttons should work.',
    ],
  },
  {
    release: '0.1.40',
    changes: [
      'The batch page shows three steps (Planned, Cooking, Finish) with a tick on what is done. A started batch says "Ready to cook" and has a Start cooking button. A planned batch has a Confirm this batch button.',
      'If Finish batch is greyed out, the page now says why in plain words (for example "Batch number is empty").',
    ],
    test: [
      'Open a started batch: you should see the three steps and "Ready to cook". Fill in the batch number and use-by and Finish batch should turn on. If it stays grey, the line under it should say why. Tell me what it says.',
      'Open a planned (not yet confirmed) batch and tap Confirm this batch. It should become Ready to cook.',
      'On a Ready to cook batch tap Start cooking. It should move to Cooking (and show under Cooking on the Make tab). If it stays Ready to cook, tell me: I could not test this against your Odoo.',
    ],
  },
  {
    release: '0.1.39',
    changes: [
      'Make opens on Batches. Order is Batches, Recipes, Jars in stock. The bottom tabs are now Today, Buy, Make, Sell, More.',
      'Start a batch opens the new batch right away ("Batch started"). A second start of the same recipe within two minutes asks first. A new "Start now / Plan for later" switch replaces the second picker. Make lists refresh when you come back to them.',
      'Batch states show our word first with Odoo\'s in brackets, such as Planned (Odoo: Confirmed). Planned now includes Odoo\'s Confirmed; Cooking is In Progress.',
      'The batch shows Odoo\'s own ingredient amounts with units. The start screen says its numbers are from the recipe, and says "no cost set in Odoo yet" instead of 0.00.',
      'Wording: "Makes 20 packs of 6", "1 unit". A Cook a batch button is on the recipe and the product\'s Recipe tab.',
      'Jars in stock shows each finished product with how many are in stock, use-by soon first. Find a product and Food safety no longer repeat on every Make tab (Food safety is under Batches).',
      'The Developer connection check no longer asks for the old Packagings setting.',
    ],
    test: [
      'Make: it opens on Batches. Tap Start a batch, pick a recipe, tap Start. You should land on that batch, not the list. Go back, start the same recipe again, and it should ask first.',
      'Check a started batch: do the ingredient amounts match the Odoo order (for example the Pineapple one: Butter 12, Sugar 10)? Tell me if not, with the recipe name.',
      'Recipes tab: tap a recipe, then Cook a batch. Jars in stock: do the numbers match Odoo?',
      'Bottom tabs: Today, Buy, Make, Sell, More.',
    ],
  },
  {
    release: '0.1.38',
    changes: [
      'Developer, Connection check now lists every add-on the app uses, in groups (Core, Selling, Kitchen, Extras): Invoicing, Price lists, Discount codes, Delivery, Email Marketing, Events, Surveys, Storage places, Packagings, Discuss, Fleet. Each missing one says what to turn on in Odoo. It only reads.',
    ],
    test: [
      'Open More, Developer, Run the check. Tell me which add-ons show missing and whether that matches your Odoo.',
    ],
  },
  {
    release: '0.1.37',
    changes: [
      'Back now returns to the tab you came from. Open I bought something, a recipe, the delivery board or a market button, tap Back, and you are on the same tab again.',
      'No more doubles: each thing lives in one place. Buy and Sell lost their Everything-in rows. Search is on Today only, Customers and suppliers is in Sell only (Suppliers stays in Buy), Tasks is on Today only.',
      'Sell: Delivery board is a row at the top of Orders (no extra Delivery tab). Make, Batches: Plan batches and This week are rows there, and Finished is a stage.',
    ],
    test: [
      'Open pages from each tab and tap Back, on the screen and with the phone back gesture. You should always land on the tab you started from.',
      'Look through Make, Buy, Sell and More for anything that still shows up twice, and tell me where.',
    ],
  },
  {
    release: '0.1.36',
    changes: [
      'A recipe and its product are now one page. From a recipe, tap Product page for price, photos, stock and shop switches. A product with a recipe has a Recipe tab with its ingredients and Edit the recipe. Both have the cookbook look.',
      'Delivery board: stage buttons (To pack, Packed, Delivered) with counts. Each card moves along with one button: Pack it, then Move to Delivered.',
      'Make, Batches: stage buttons (Planned, Cooking, Ready to finish) with counts, so you see each stage on its own.',
    ],
    test: [
      'Open a recipe in Make, tap Product page, then open the Recipe tab there and tap Edit the recipe. You should land back on the recipe.',
      'Delivery board with a few orders: switch between the three stages and move a packed order to Delivered.',
      'Make, Batches: check the counts match what is in Odoo, and open a batch from each stage.',
    ],
  },
  {
    release: '0.1.35',
    changes: [
      'Buy tab: a big I bought something button, then Running low, Shopping list, Ingredient list, Purchase orders, Check in a delivery and Purchase history, each one tap away.',
      'Sell tab: Orders, Delivery, Customers and Market. Quotes, wholesale, repeat orders and the delivery board open directly.',
      'Market day is big buttons: Open register, Day sheet, Check out and in, Price sheet, Cash drawer, Day totals, Results.',
      'Money and reports (owner only) opens on this month: what sold, units out, and the best sellers as bars. These are Odoo’s own totals.',
    ],
    test: [
      'Buy tab: tap I bought something, then back, then each row. Each should open the right page.',
      'Sell tab, Delivery: open the delivery board. Sell tab, Market: tap each big button.',
      'More, Money and reports, as the owner: check This month matches your sales in Odoo.',
    ],
  },
  {
    release: '0.1.34',
    changes: [
      'Make tab: Recipes, Batches and Jars in stock sit at the top. Recipes is a recipe box; tap a recipe to open it.',
      'Recipe pages (and the recipe box) have a new cookbook look: warm paper and dashed cards. Other screens stay clean.',
      'Batches shows what is cooking, with Start a batch right there.',
    ],
    test: [
      'Make tab, Recipes: your recipes are listed. Tap one and check it opens straight on the recipe, with the paper look.',
      'Make tab, Batches: open a batch, and tap Start a batch.',
      'Sign in as an inventory person: Make shows Jars in stock but no recipe box.',
    ],
  },
  {
    release: '0.1.33',
    changes: [
      'New look for moving around: five tabs along the bottom (Today, Make, Buy, Sell, More). Every screen is in one of them.',
      'A + button on every tab: Start a batch, I bought something, New quote or order, A task. Each opens the same page as before, ready to fill in.',
      'Today keeps the to-do list and Tasks, with a Search button at the top. Money, Online shop, Management and Developer are in More (owner only).',
    ],
    test: [
      'Sign in as the owner: all five tabs show. Sign in as a baker: only Today, Make and More show, and More has no Management.',
      'Tap + and each choice. Start a batch should open the new batch page, I bought something the Bought ingredients page.',
      'Open a page from a tab and tap Back: you should land back on the tab you came from.',
    ],
  },
  {
    release: '0.1.32',
    changes: [
      'Contacts, History tab: Call and Open map for a supplier, plus a scorecard (orders, on time or late, last 5 deliveries, price changes).',
      'Shopping list: Make draft orders per supplier. One draft purchase order per usual supplier, once a day, never confirmed by the app. Items with no usual supplier are left out.',
      'Delivery board: Route card. Sort by zip, move stops up or down, and open the whole route in Maps. The app does not plan the route.',
      'Management: Mileage with Odoo’s free Fleet app (odometer readings, miles since the last one). It says so if Fleet is not installed.',
      'Scan a code: Find a product and Find a batch can scan a product barcode or a batch number with the camera.',
      'Find a batch: Share label text (product, batch, use-by, ingredients, allergens) as plain text to any app.',
    ],
    test: [
      'Open a supplier in Customers and suppliers, History tab: tap Call, Open map and Show scorecard.',
      'Plan a batch that is short of an ingredient, open Shopping list, tap Make draft orders per supplier, and check the drafts in Odoo Purchase.',
      'Delivery board with two or more stops: Sort by zip, move one, open the route in Maps.',
      'Install Fleet in Odoo, add a vehicle, then Management, Mileage, save a reading.',
      'Find a product, Scan a code on a jar with a barcode. Find a batch, scan a batch code.',
      'Find a batch, open one, Share label text, and send it to your label printer app. Tell me if it needs a picture or PDF instead.',
    ],
  },
  {
    release: '0.1.31',
    changes: [
      'Production: new This week page. Planned batches by day; tap one to move it to another day.',
      'Recipes: Save as new version (owner). Copies the recipe with a new reference like “Grape jelly v2”, notes why on the old one, and archives it. Batches already started keep what they had.',
      'Recipes: Recipe tests (owner). Make a small test batch, score taste, texture and set from 1 to 5, add notes, then Keep (opens the new-version step) or Drop.',
      'Management: new Events and booths (owner). Name, dates, place, who is in charge, a bring-list and results.',
    ],
    test: [
      'Production, This week: move a planned batch to another day and check the date in Odoo.',
      'Recipes, open a recipe, Save as new version with a reason. Check Odoo has the new copy, the old one archived, and the note on the old one.',
      'Recipes, Recipe tests: make one test, score it, tap Keep.',
      'Management, Events and booths: add a market, then fill the bring-list and results. Tell me if Odoo says the Events app is missing.',
    ],
  },
  {
    release: '0.1.30',
    changes: [
      'New Tasks page (Home, and a Today line). The owner gives out tasks with a due date, a person and an optional batch or order; each person ticks theirs Done. They are Odoo activities. A person with no Odoo login gets their task as the owner.',
      'Delivered now also makes a reminder to write a thank-you note by hand (once per order).',
      'Customer History tab: Special dates (birthday, order anniversary) as reminders to you only. Today shows how many fall this week.',
      'Every record page has a Changes tab: who changed what and when, from Odoo.',
      'Waiting to send: each item shows its database and steps, Odoo’s refusal in plain words, and only the owner can remove one.',
    ],
    test: [
      'Home, Tasks, New task: give yourself a task, tick it Done, and check it is gone from Odoo’s activities.',
      'Mark a delivery Delivered, then check Tasks and the customer in Odoo for the thank-you reminder.',
      'Open a customer, History tab, add a birthday a few days away, and check Today.',
      'Open any product or contact, Changes tab, and check the history reads well.',
      'Waiting to send as a non-owner: you should not see Remove.',
    ],
  },
  {
    release: '0.1.29',
    changes: [
      'Management: new Prices and seasons. Customer groups (a price list with its own rules, for example wholesale) and Seasons (a start and end day each year for a product).',
      'Recipes: new Gift boxes view. A gift box is a kit of products you pick, sold as one item.',
      'Today: lines for products in season now and products starting their season soon. Nothing is switched on the shop by itself.',
    ],
    test: [
      'Management, Prices and seasons, Customer groups: if it says to turn on Pricelists, do that in Odoo, then make a Wholesale group with one rule and check it in Odoo.',
      'Seasons: give a product a start and end day that includes today, and check Today shows it in season.',
      'Recipes, Gift boxes: make a box of two jellies and check it in Odoo as a kit.',
    ],
  },
  {
    release: '0.1.28',
    changes: [
      'Management: new Online shop (owner). New website orders (last 3 days), On the shop (switch a product on or off, and whether it sells when out of stock), Specials (discount codes: a percent off the order, with dates and a limit, switch off without deleting), Delivery and pickup (areas, price, pickup), Closed days (a warning on the Delivery board only) and Newsletter.',
      'Newsletter: pick who it goes to, write a subject and a few words, add new products with their Odoo prices, and save a draft. Nothing is sent until you open the draft and tap Send, and it first says how many people it goes to.',
      'Today: new line for website orders from the last 3 days.',
      'Delivery board: after Delivered, a How did it go? box (1 to 5 stars and a comment) saved as a note on the order.',
      'Customer History tab: Sent by (adds a Referred by tag in Odoo) and the list of people they sent with their order counts. No rewards are sent.',
      'Product screen, Online tab: more shop fields, including the page text, order on the shop page, and the search title, description and keywords.',
    ],
    test: [
      'Management, Online shop, On the shop: switch a jelly off and on and check Published on the website changes on the product in Odoo.',
      'Specials: make a 10 percent code HOLIDAY10 with dates. Check in Odoo, Sales, Discount programs, that it is there, then use the code on a test shop order. Tell me if Odoo refuses it.',
      'Delivery and pickup: add a Pickup method and a local Delivery method with a price and zip range. Check them in Odoo.',
      'Closed days: close tomorrow and check the Delivery board warns tomorrow.',
      'Newsletter: save a draft to a small test list, check it in Odoo Email Marketing, then send it to yourself only and check it arrives. It must never send without your tap.',
      'Mark one delivery Delivered and give it 4 stars. Check the note in the order’s chatter.',
      'Open a customer, History tab, mark who sent them, and check the tag in Odoo.',
    ],
  },
  {
    release: '0.1.27',
    changes: [
      'New area Quotes and orders (Sales). New quote: customer, addresses, dates, price list, payment terms, terms and notes, and lines. Prices, discounts, tax and totals are Odoo’s; leave Price blank to use Odoo’s price for that customer.',
      'New wholesale order: the same form with a case (a unit set on the product) per line and payment terms like Net 30. After you confirm it, Make the invoice sends it to Odoo as an invoice.',
      'Share a quote as text from the Send tab, or tap Email it from Odoo (Odoo’s own email). Nothing is sent unless you tap. A PDF comes in a later app build.',
      'Repeat orders: who usually orders, how many days between orders, who is due. Tap a customer, or use Repeat the last order on the customer’s History tab, to make a new quote like their last order. Nothing is sent to them.',
    ],
    test: [
      'Quotes and orders, New quote: pick a customer, save, then Edit the lines and add two products with quantities. Check the prices and total match what Odoo shows on the same quote.',
      'On the quote’s Send tab, tap Share as text and check the text reads right. Tap Confirm the order and check Odoo made a delivery.',
      'New wholesale order: pick a wholesale customer, payment terms Net 30, a line in cases. Confirm, then Make the invoice and check the invoice in Odoo.',
      'Repeat orders: check the usual gap and days since match their orders. Tap one and check a new draft quote appears in Quotes and open orders.',
      'Try Email it from Odoo on a quote sent to yourself. If Odoo refuses, tell me the message.',
    ],
  },
  {
    release: '0.1.26',
    changes: [
      'Market: a new Market day card. Market day sheet (what sold at the last three markets beside what is in stock, with a pack list to tick), Check out and check in (type what you took and what came back, shown beside what Odoo says sold), Price sheet (big list to share), Cash drawer (count bills and coins, compared with the opening and closing cash Odoo has), Day totals (type the Cash App and Venmo totals and see if they match Odoo), and Results (sales after closing, by way to pay, best sellers, what is left).',
      'What you type here is saved in Odoo’s Food app settings contact and also kept on the phone, so a count made with no signal is not lost. Nothing is written into the Point of Sale and stock is not changed.',
    ],
    test: [
      'Market, Results: pick yesterday’s or last market. Compare the sales total, ways to pay and best sellers with Odoo’s Point of Sale report.',
      'Market day sheet: check it shows the last markets’ quantities and today’s stock. Tick a few items.',
      'Check out and check in: add two jellies, type took 12 and came back 3. After the market, check Odoo’s sold number shows beside it.',
      'Price sheet: check the prices match Odoo, then Share the price list.',
      'Cash drawer: count some bills and coins at open and close and check the total and the line comparing with Odoo.',
      'Day totals: type your Cash App total and check it says Matches when equal to Odoo’s.',
      'Do one count with airplane mode on, turn signal on, and check it appears in the Food app settings contact in Odoo.',
    ],
  },
  {
    release: '0.1.25',
    changes: [
      'Management: Reports became Money and reports (owner only), now a menu. New: Bills due (unpaid bills, late ones marked), Cash in and out (by cash, Cash App, Venmo and bank), Sales tax as Odoo booked it by month, Month goal with a progress bar, Budget against spent by category, Add an expense, and Accountant packet.',
      'Add an expense: what, store, date, amount, category and how it was paid, with a receipt photo. It makes a bill in Odoo, posts it, marks it paid if you picked a way to pay, and keeps the receipt on it. It works without signal.',
      'Accountant packet: one spreadsheet file for a month (sales, tax, cash, invoices, purchase bills) to share to email or Drive.',
      'Share as a spreadsheet file now also on Sales, Profit, Invoices and Purchase history lists.',
    ],
    test: [
      'Money and reports, Bills due: compare with Odoo bills not yet paid. A bill past its due date should say LATE.',
      'Cash in and out: pick This month and compare with your payments in Odoo.',
      'Sales tax: compare a month with Odoo’s tax lines. Ask your accountant if unsure; it is information only.',
      'Month goal: type a goal, save, and check the bar matches this month’s sales from Reports, Sales.',
      'Budget: open a category, type a budget, save, and check spent and left.',
      'Add an expense: lids from a shop, a category, Paid with Cash, and a receipt photo. Check in Odoo a posted, paid vendor bill with the photo attached. Try it once with airplane mode on.',
      'Accountant packet: build last month and share it to your email. Open the file in a spreadsheet and check each section.',
      'Invoices, Share as a spreadsheet file: check the file opens.',
    ],
  },
  {
    release: '0.1.24',
    changes: [
      'Management: new Reports (owner only). Sales shows best and slowest sellers for today, 7 days, this month, last month or this year, counting website orders and market sales. Profit shows sold total, units and Odoo’s cost beside each product. Stock value shows what is on the shelves, as Odoo values it. Year compares each month with the same month last year. Break-even says how many units cover a cost you type.',
      'Every number is Odoo’s own. The app only adds up lists and counts units for the break-even; it works out no prices or taxes.',
    ],
    test: [
      'As owner, Management, Reports, Sales: check the best sellers match what you know sold this month. Try the other time buttons.',
      'Profit: check sold totals and cost each against Odoo (Sales, Reporting, and the product Cost).',
      'Stock value: compare the total with Odoo Inventory, Reporting, Stock valuation. If it says Odoo gives no value, tell me.',
      'Year: check a month you know the total for.',
      'Break-even: pick a jelly, type a market fee of 50, and check the count is 50 divided by (price minus cost), rounded up.',
      'Sign in as a helper and check Management and Reports are not offered.',
    ],
  },
  {
    release: '0.1.23',
    changes: [
      'New area Safety and records. Kitchen checks (fridge and freezer temperature, cleaning), Tasting log and Shelf-life check are Odoo Surveys. The owner taps once to make each survey in Odoo (the Surveys app must be on); after that anyone adds entries, with or without signal, and sees the latest ones.',
      'Safety and records: Cottage-food rules. The owner types their own rules; everyone reads and ticks them before selling. The app knows no law, it only shows what was typed.',
      'Safety and records: Nutrition notes per product, typed in and saved in Odoo. Never calculated.',
    ],
    test: [
      'Turn on the Surveys app in Odoo. As owner, open Safety and records, Kitchen checks, tap Make the Kitchen checks survey. Check in Odoo a survey with that name and its questions now exists.',
      'Add an entry (temperatures, Yes on cleaning). Check it shows under Latest entries and in Odoo under the survey Results.',
      'Add an entry with airplane mode on. Check it says saved on the phone, then appears after signal returns, once.',
      'Do the same for Tasting log and Shelf-life check.',
      'As owner, Cottage-food rules, Change the rules, type two lines and save. Open it as someone else and tick each rule.',
      'Nutrition notes: pick a jelly, type a few lines, save, close and reopen to see them again.',
    ],
  },
  {
    release: '0.1.22',
    changes: [
      'Photos: batches now have Batch photos (a timeline, newest first), delivery board orders have Delivery proof, and a batch number page has Photos. The picture is saved as an attachment on the record in Odoo, so you see it in Odoo too. With no signal it waits on the phone and goes later.',
      'Batch: new Allergens card. Tag an ingredient on its product screen with a tag that starts with Contains (for example Contains milk) and every batch using it shows the allergens together.',
      'Find a batch: now shows what the batch went into and a Who to tell if there is a recall list (customers who got it, directly or inside a finished batch), with a Share traceability sheet button that sends it as plain text.',
    ],
    test: [
      'Open a started batch, tap Take a batch photo, allow the camera if asked, take a picture. Check it shows under Batch photos, and in Odoo on the batch (chatter attachments).',
      'Take a photo with airplane mode on. Check it says it is saved on the phone. Turn signal on and check it appears.',
      'Delivery board: tap Take a proof photo on an order and check the picture is on the sales order in Odoo.',
      'Tag an ingredient Contains milk in Odoo (product Tags). Open a batch that uses it and check Allergens lists it.',
      'Stock, Find a batch: pick an ingredient batch number that went into a finished batch sold to a customer. Check the customer shows under Who to tell, then tap Share traceability sheet and check the text is right.',
    ],
  },
  {
    release: '0.1.21',
    changes: [
      'Management: new Stock alerts. The owner sets how many days ahead use-by alerts show (14 by default). It is saved in Odoo (in a contact called Food app settings, made the first time) so every phone uses the same number. Today and Expiring soon use it.',
      'Stock: new Waste and spoilage. Pick a product, the batch, how many, and a reason (Odoo’s scrap reasons). It comes off the stock in Odoo.',
      'Stock: Count stock now stops safely if stock moved since you counted (for example a count made with no signal), and says what changed so you can count again.',
      'Stock: new Places. What is in each storage place and moving stock between places. It needs Storage Locations switched on in Odoo Inventory settings; the app says so if it is off.',
      'Stock: new Unit helper. Type once that 1 cup of an ingredient is, say, 120 g, and it converts on screen. Odoo’s own unit is never changed.',
    ],
    test: [
      'Management, Stock alerts: change the days to 10 and Save. Check in Odoo the contact Food app settings has useByDays=10. Open Today and Expiring soon and check they use 10 days.',
      'Stock, Waste and spoilage: pick a product with a batch, enter 1, pick a reason, save. Check in Odoo a scrap was made and validated and the stock went down by 1.',
      'Stock, Count stock: count a product, save. Check Odoo stock matches. Then count with airplane mode on, change the same stock in Odoo, turn signal on, and check the waiting entry says stock changed and nothing was overwritten.',
      'Turn on Storage Locations in Odoo and make places Pantry and Freezer. Stock, Places: move a few of something from Pantry to Freezer and check the transfer in Odoo is done and the stock is in the new place.',
      'Stock, Unit helper: pick flour, set 1 cup = 120 g, save. Type 2 cups and check it shows 240 g. Close and reopen: the match is remembered.',
    ],
  },
  {
    release: '0.1.20',
    changes: [
      'Production: new Plan batches. Pick recipes and how many; it adds up what they need and shows what you have, what is on order, and what is short. Jars, lids and labels are marked as packaging. Save as planned batches (draft batches in Odoo) or start them all now.',
      'Ingredients: new Shopping list. What planned batches are short of, plus what is running low, grouped by each ingredient’s usual supplier, with ticks that stay on the phone.',
      'Start a batch: Half, Recipe and Double buttons. The owner also sees Odoo’s price and cost for the product.',
      'A finished batch shows its yield (made compared with the plan).',
      'New Batch checklist on a batch: tick each step; Odoo gets a note with who and when. Steps come from a survey called “Batch checklist” if you make one in Odoo Surveys (its questions are the steps); otherwise a default list.',
    ],
    test: [
      'Production, Plan batches. Add 2 recipes with amounts. Check what it needs, what you have, what is on order and what is short match Odoo. Save as planned batches and check draft batches in Odoo.',
      'Ingredients, Shopping list. Check the short items from planned batches and the running-low items are there under their supplier. Tick some, close the app, reopen: ticks stay.',
      'Start a batch, tap Double and Half and check the ingredients follow. As the owner check the price and cost line shows; as another role it is hidden.',
      'Open a batch that is started: the Batch checklist shows. Tick a step and check a note appears on the batch in Odoo. Tick one with airplane mode on and check it arrives once.',
      'Optional: in Odoo Surveys make a survey titled Batch checklist with a question per step, then reopen a batch and check those steps show.',
      'Open a finished batch and check the Yield line.',
    ],
  },
  {
    release: '0.1.19',
    changes: [
      'New Delivery board (button at the top of Website orders): today’s deliveries and pickups with the address (tap for the map), phone, the customer’s notes, and the step: To pack, Packed, Delivered. Tap Delivered once it is handed over; it is saved as a note on the order in Odoo.',
      'Contacts have a History tab: that customer’s invoices, and purchases from that supplier.',
      'Ingredients: a new “Prices paid over time” button on each ingredient shows each price paid, the store and date, with the cheapest marked.',
      'New Search everything on the home screen: products, customers, batch numbers, orders and batches in one box.',
      'Today now also shows Invoices not paid yet (Sales) and Deliveries and pickups due today (Shipping). The home screen puts your own role’s areas first.',
    ],
    test: [
      'Website orders, Delivery board. Check today’s orders show with address, phone and the customer’s notes. Tap the address and check the map opens.',
      'On a packed order tap Delivered. Check the order in Odoo has a note “Delivered”. Tap it with airplane mode on, then turn signal on and check one note arrives.',
      'Home, Customers and suppliers, open a customer, History tab: Invoices to this contact lists their invoices. Open a supplier and check Purchases from this contact.',
      'Ingredients, Ingredient list, open one, Prices paid over time. Check the prices match your bills and the cheapest is marked.',
      'Home, Search everything. Type part of a customer name, a product and a batch number. Tap a customer or product to open it.',
      'Sign in as Production, then Sales: check each sees their own area first on the home screen, and that Today shows the new counts.',
    ],
  },
  {
    release: '0.1.18',
    changes: [
      'New Invoices on the home screen (Sales and Owner): who owes you and who has paid, newest first. Tap one to see what was on it, and mark it paid with Cash, Cash App or Venmo.',
      'New Purchase history under Ingredients: every purchase and bill with date, store, total, paid or not. Tap one to see the lines.',
      'New ingredients added in the app now have Track Inventory switched on, so their stock is counted.',
    ],
    test: [
      'Home, Invoices. Not paid shows what customers owe. Paid and All switch the list. Search by a customer name or invoice number.',
      'Open an unpaid invoice. Check the lines and total match Odoo. Tap Paid with Cash and check in Odoo that the invoice shows Paid and a payment was made once.',
      'Turn on airplane mode, open Invoices (it shows the last list), open one and mark it paid. It says saved on the phone. Turn signal back on and check Odoo shows one payment.',
      'Ingredients, Purchase history. Check a purchase from Bought ingredients is there with the right store, date, total and lines. Mark an unpaid one paid.',
      'Ingredients, Ingredient list, Add an ingredient and save. In Odoo check its Track Inventory is on.',
    ],
  },
  {
    release: '0.1.17',
    changes: ['Fixes the pickers that said “Couldn’t read the list from Odoo” (an unexpected keyword argument): units for Packagings and Change the unit, and other pickers in the product and contact forms. Odoo 19 renamed that option.'],
    test: [
      'A product, Packagings tab, Add. Units such as Pack of 6 list. Pick one, Save, and check it in Odoo.',
      'Ingredients, Bought ingredients, add an ingredient, Change the unit. Units list and one can be picked.',
      'In a product, pick a category and a tax; in a contact, pick a country. The lists show with no error.',
    ],
  },
  {
    release: '0.1.16',
    changes: ['New Bought ingredients button at the top of Ingredients: pick who you bought from, add what you bought with the price paid, Save. Odoo makes the order, receives it into stock, and makes a vendor bill marked paid. Works with no signal. Purchase orders and Check in a delivery are under “Ordering ahead”. Variants have their own tab on a product. Packagings are picked from Odoo’s units on the product (Packagings tab).'],
    test: [
      'Ingredients, Bought ingredients. Pick a store, Add what you bought, pick an ingredient. Type a price each and check Total paid follows; type a total and check the price follows.',
      'Check and save. Pick how it was paid (or Not paid yet) and Save purchase. In Odoo check: the purchase order, the delivery received, the stock up, the ingredient’s cost changed (Average Cost), and the vendor bill posted and paid from the journal you picked.',
      'Try an ingredient with batch numbers: it asks for a batch number and use-by date. Check them on the batch in Odoo.',
      'Turn on airplane mode, do a purchase and Save. It says it is saved on the phone. Turn signal back on and check it all arrives in Odoo, once.',
      'A product: the Variants tab lists each variant with its stock. Tap one to change it. Batches only lists batches.',
      'A product, Packagings tab: pick units such as Pack of 6, Save, and check the Packagings on the product’s Sales tab in Odoo.',
    ],
  },
  {
    release: '0.1.15',
    changes: ['Find a product shows one row per product, with the total stock and how many variants. A product’s Batches tab lists its variants; tap one to see and change it (reference, barcode, price, weight, volume, archive), its batches and packagings. Packagings say so in plain words when this Odoo has no Packagings list. Descriptions that Odoo keeps as HTML now show as plain text. Color is a row of swatches. The log is shorter and clearer: it leaves out quick reads that worked, shows each screen opened and each message shown to you, marks failures as errors, and has a Problems only switch.'],
    test: [
      'Find a product, search “Apricot Freezer Jam”. There is one row with the total in stock and “8 variants”. Tap it: the batches show for all variants.',
      'Open and change this product, Batches tab. Each variant shows its own stock. Tap one, change its barcode, Save. Check the barcode in Odoo.',
      'In a variant, open Packagings. If this Odoo has no Packagings list you see a plain message, not an error. Tell me if Odoo shows packagings anywhere on the product form.',
      'Open a product, Point of Sale tab. The description has no tags. Edit it, Save, and check it in Odoo. Tap a color swatch and check the color in Odoo.',
      'Check the Notes on receipts, Notes on delivery orders and Quotation description on the Stock and Sales tabs for leftover tags.',
      'Developer, Log. Use the app for a minute. Check that screens opened and any red messages are listed, and that Problems only shows just the warnings and errors. Share the problems.',
    ],
  },
  {
    release: '0.1.14',
    changes: ['Buy, make, sell workflow. Check in a delivery now shows the price each and total paid per line, and saves them on the order. Orders that are confirmed but not finished can have their lines changed. Cost on a product is read-only when its category uses Average Cost. Finish batch asks how much of each ingredient was really used and shows the cost Odoo worked out. Market shows open registers with a Close register button. The Developer connection check lists each category’s costing.'],
    test: [
      'Ingredients, Check in a delivery, open one. Each line shows Price each and Total paid. Change the total and check the price follows. Check in, then open the purchase order in Odoo and see the new price on the line.',
      'In Odoo, check the ingredient’s cost moved to the average of old and new purchases.',
      'Ingredients, Purchase orders, open a confirmed order, Lines. You can change a price or amount.',
      'Open an ingredient or product whose category is on Average Cost. Cost shows as read-only with a note.',
      'Production, open a started batch. Under Finish this batch, each ingredient shows the recipe amount. Change one, then Finish batch. The batch page then shows what the batch cost and the cost each, from Odoo.',
      'Market. If a register is open it shows under Open registers with how long. Close register opens the Point of Sale; in it tap the menu, then Close Register. Check whether Odoo then takes stock off.',
      'Developer, Run the check. Each category shows its costing method. Raw Material should say Average Cost.',
    ],
  },
  {
    release: '0.1.13',
    changes: ['Recipe ingredient picker shows raw materials only (with a switch for all products) and has Add a new ingredient. Start batch shows what the recipe makes, each ingredient with its unit, recipe and batch amounts, and need versus have with units. Stock has a new What’s in stock list.'],
    test: [
      'Production, Recipes, open a recipe, tap Add an ingredient. Only raw materials show. Switch on Show all products and the finished products appear.',
      'In the same picker, tap Add a new ingredient, fill in the name, category and unit, Save. It is picked for the recipe.',
      'Production, Start a batch, pick Apricot Preserves (4 oz, Quilted). Check "The recipe makes…", the units on each ingredient, and Not enough in stock with units. Change the number of jars and check "Recipe:" shows next to each amount.',
      'Stock, What’s in stock. Check amounts and units, try All, Made and Ingredients, search, and tap a product to see its batches with use-by dates.',
      'On a purchase order’s lines, picking a product only lists products you can buy.',
    ],
  },
  {
    release: '0.1.12',
    changes: ['Back now goes back one screen, in the app and with the phone’s back gesture, instead of jumping to Home. The product pickers show each variant’s full name, and when you pick what a new recipe makes, products that already have a recipe come first.'],
    test: [
      'Ingredients, Purchase orders, open an order, tap Lines, Edit the order lines. Tap Back at the top: each tap goes up one step (lines, order, list, menu), then Home.',
      'Do the same with the phone’s back gesture.',
      'Try it in Stock (Find a batch), Production (a batch, All batch details), Recipes (a recipe) and Customers and suppliers (a contact).',
      'Production, Recipes, New recipe. The list shows full names like Apricot Freezer Jam (4 oz, Quilted), with products that already have a recipe first.',
    ],
  },
  {
    release: '0.1.11',
    changes: ['Edit the lines of a purchase order (quantity, unit, price, add, remove), the ingredients of one production batch, and a product’s packagings (like Pack of 6).'],
    test: [
      'Ingredients, Purchase orders, open a draft order, tap the Lines tab, then Edit the order lines. Change a quantity and a price, add a line (pick a product, its unit fills in), Save. Check the order in Odoo.',
      'Open an order that is already confirmed. The lines show but can’t change.',
      'Production, open a batch, tap All batch details, then the Ingredients tab and Change the ingredients of this batch. Change an amount, remove one and add one, Save. Check the batch in Odoo. The recipe itself does not change.',
      'Find a product, open it, tap the Packagings tab, then Edit packagings. Add Pack of 6 with quantity 6, Save. Check it in Odoo under the product’s Sales tab.',
    ],
  },
  {
    release: '0.1.10',
    changes: [
      'Product screen now has the fields of Odoo’s product form in tabs: Main, Stock, Online, Point of Sale and Batches. You can switch on Track Inventory, batch tracking and expiry for a product.',
      'Customers and suppliers: address, tax ID, tags, terms, price list and more. Batches: all dates and notes, and Add a batch. Purchase orders: a new list to see, add and change orders. Reorder rules and production batches: All settings screens. Ingredients: All product details.',
    ],
    test: [
      'Find a product, open Apricot Freezer Jam, tap Open and change this product. Compare each tab with Odoo (Main, Stock, Online, Point of Sale, Batches).',
      'On Stock, switch on Track Inventory, set Track by to Batch, switch on Has an expiration date and type Expires 120 days. Tap the one Save and check the product in Odoo.',
      'On Main, add a sales tax from the list and change the cost, then Save.',
      'Customers and suppliers: open one, check Address and Sales and buying tabs, change something, Save, check in Odoo.',
      'Stock, Find a batch: open a batch, tap All batch details, change a date, Save. Also tap Add a batch.',
      'Ingredients, Purchase orders: open one, change the vendor reference and expected arrival, Save. Tap New order too.',
      'Ingredients, Running low: tap All rule settings on a rule. Ingredient list, open an ingredient, tap All product details.',
      'Production, open a batch, tap All batch details.',
    ],
  },
  {
    release: '0.1.9',
    changes: ['Recipes: the recipe screen now holds what Odoo’s recipe form holds. Product and variant, how many it makes and its unit, a reference, Made here or Kit, a unit for every ingredient, ingredient order, and by-products. One Save for the whole recipe.'],
    test: [
      'Production, then Recipes. Open Apricot Preserves (8 oz, Ball). Check Makes, its unit, the reference and the type match Odoo.',
      'Each ingredient shows an Amount and a Unit. Change one amount and one unit.',
      'Use Move up and Move down on an ingredient, then tap Add an ingredient and pick one.',
      'Tap Add a by-product, pick a product, give an amount and a share of the cost.',
      'Tap the single Save button at the bottom. In Odoo, open the recipe: every change is there, in the same order.',
      'Tap New recipe, pick a product, fill it in and Save. It shows in Odoo.',
      'Turn on airplane mode, change a recipe, Save. It says saved on the phone. Turn signal back on and check Odoo.',
    ],
  },
  {
    release: '0.1.8',
    changes: ['Ingredients: a new Ingredient list to see, add and change ingredients, with their category, cost, purchase taxes and vendor prices.'],
    test: [
      'Open Ingredients, then Ingredient list. It starts on Raw Material and shows Black Rasberries, Butter, Lemon Juice, Liquid Pectin, Mason Jar and Sugar with what is on hand.',
      'Tap Category to look at other categories, or type in Search.',
      'Open Black Rasberries. Check the cost, the 8.25% Texas tax, and that "Stock is counted" says Yes.',
      'Change the cost and tap Save. In Odoo, the product shows the new cost.',
      'Under Vendors, open heb. Change the price and tap Save, then check it in Odoo, Purchase tab.',
      'Tap Add a vendor, pick one, type a price, Save. Then open it and tap Remove this vendor.',
      'Back on the list, tap Add an ingredient. Give a name, category, unit and cost, then Save. It shows in Odoo (turn on Track Inventory there if you count stock for it).',
    ],
  },
  {
    release: '0.1.7',
    changes: ['Add and change things in the app: recipes (amounts, ingredients, new recipes), products (name, price, shelf life), customers and suppliers, and a batch’s number or use-by date.'],
    test: [
      'Production, then Recipes: open a recipe, change an ingredient amount, tap Save. In Odoo the recipe shows the new amount.',
      'Add an ingredient to a recipe, then remove it again.',
      'Tap New recipe: pick the product, how many it makes, add ingredients, Save recipe. It shows in Odoo, Manufacturing, Bills of Materials.',
      'Find a product, then Add a product: give a name and price. It appears in Odoo (turn on Track Inventory in Odoo if you count stock for it).',
      'Open a product and tap Change name, price or shelf life. Check the new price in Odoo.',
      'Home, Customers and suppliers: add a contact and change one. Check them in Odoo, Contacts.',
      'Stock, Find a batch: open a batch and change its use-by date. Check it in Odoo, Inventory, Lots.',
      'Turn on Pretend offline, change an amount, turn it off: it goes to Odoo by itself.',
    ],
  },
  {
    release: '0.1.6',
    changes: ['Home: a Today card with what is waiting for you, and Find a product (price, photo and stock by batch).'],
    test: [
      'Open the home screen. Today shows counts for your roles: batches to finish, website orders to pack, batches close to their use-by date, ingredients running low, deliveries to check in.',
      'Tap a Today row. It opens that area.',
      'Tap Find a product and type part of a name. The price matches the product in Odoo.',
      'Tap a product: its photo and each batch with its use-by date and amount show.',
    ],
  },
  {
    release: '0.1.5',
    changes: ['Market: a button for each register that opens Odoo’s Point of Sale, and a list of the ways to pay that Odoo has.'],
    test: [
      'Open Market. Your registers from Odoo show as buttons, and Ways to pay lists Cash, Cash App and Venmo (set up in Odoo).',
      'Tap a register. Odoo’s Point of Sale opens in your browser. Sign in if it asks.',
      'Ring up a test sale paid with cash. In Odoo, the order shows in Point of Sale, and the batch stock goes down.',
    ],
  },
  {
    release: '0.1.4',
    changes: ['Ingredients: see what is running low, set the low and full levels, order from a supplier (or add a new one), and check a delivery in with batch numbers and use-by dates.'],
    test: [
      'Open Ingredients, then Set levels for a product (under Running low). Give a test ingredient a low and a full level, higher than what you have.',
      'Running low now lists it. Tap Order more, pick a supplier (or Add a new supplier), and tap Place order.',
      'In Odoo, Purchase shows the order, confirmed, with the price filled in by Odoo. Nothing is sent to the supplier.',
      'In Odoo, receive that order so a delivery is waiting. In the app, open Check in a delivery.',
      'Type how many arrived, plus the supplier’s batch number and use-by date for products that track batches. Tap Check in.',
      'In Odoo the delivery is Done and the batch shows in Inventory, Lots with its use-by date.',
    ],
  },
  {
    release: '0.1.3',
    changes: ['Stock: count stock by batch, an Expiring soon list where you can throw out a batch, and Find a batch to see where it came from and where it went.'],
    test: [
      'Open Stock, then Count stock. Search for a product and open it.',
      'Type a different number on one line and tap Save. In Odoo, Inventory shows that number on hand.',
      'Open Expiring soon. Batches close to their use-by date show, soonest first. Switch between 7, 14 and 30 days.',
      'Tap Throw out on a test batch and confirm. In Odoo the stock comes off and a scrap is recorded.',
      'Open Find a batch and type part of a batch number. Open it: you see what it was made from and which orders it went out on.',
      'Turn on Pretend offline and save a count: it waits, then goes to Odoo when you turn it off.',
    ],
  },
  {
    release: '0.1.2',
    changes: ['Website orders: see orders waiting to be packed, pack them taking the batch that expires first, and mark each as delivered or picked up.'],
    test: [
      'In the test Odoo, place a website order for a product that has batch numbers, and confirm it so a delivery is made.',
      'Open Website orders. The order shows under Waiting to be packed.',
      'Open it. Each line says which batch to take, the one with the earliest use-by date first.',
      'Choose Delivery or Pickup and tap the green button.',
      'In Odoo the delivery is Done, uses those batches, and has a note saying delivered or picked up.',
      'An order Odoo is still waiting on stock for shows "Waiting for stock" and can’t be handed over.',
    ],
  },
  {
    release: '0.1.1',
    changes: ['Production: start a batch from a recipe, see its ingredients, and finish it with a batch number and use-by date. Works without signal too.'],
    test: [
      'Open Production. Your recipes from Odoo show when you tap Start a batch.',
      'Pick a recipe and change the amount. The ingredient amounts change with it.',
      'Ask for more than the shelves hold: a "Not enough in stock" box names the short ingredient.',
      'Tap Start batch. In Odoo, Manufacturing shows the new order, confirmed.',
      'Open the batch in the app. It lists the ingredients.',
      'Finish it: the batch number is filled in and the use-by date comes from the product shelf life. Change them if you like, then tap Finish batch.',
      'In Odoo the order is Done, and Inventory, Lots shows the batch number with its use-by date.',
      'Turn on Pretend offline, start another batch, and turn it off: the batch appears in Odoo by itself.',
    ],
  },
  {
    release: '0.1.0',
    changes: [
      'First version: sign in to Odoo, roles, the company name, logo and colors, working without signal, beta updates, and the Developer screen.',
    ],
    test: [
      'Sign in to the test database (Developer screen, Switch database) with the test API key.',
      'The app shows the company name, logo and colors from Odoo.',
      'Mark the database as a test copy: the orange TEST DATABASE band shows on every screen.',
      'Connection check: every line is green, or says what to turn on in Odoo.',
      'Your roles show on Settings. Owner sees Management and Developer.',
      'In Management, give a staff member a role. It shows as a Tag on their Employee in Odoo.',
      'Sign in as that staff member: only their role areas show, and no Management.',
      'Turn on Pretend offline, then Send a test note: it waits in the queue.',
      'Turn Pretend offline off: the note sends by itself, and shows on your contact in Odoo.',
      'Close the app without signal and reopen it: you are still signed in, and the queue is still there.',
      'Turn on Beta updates, restart, and check the channel line says beta.',
    ],
  },
];

export const latestNote = (release: string): ReleaseNote | undefined => RELEASE_NOTES.find((n) => n.release === release) ?? RELEASE_NOTES[0];

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

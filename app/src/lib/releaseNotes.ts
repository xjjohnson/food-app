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

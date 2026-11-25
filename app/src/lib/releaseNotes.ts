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

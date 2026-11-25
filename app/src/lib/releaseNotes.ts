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

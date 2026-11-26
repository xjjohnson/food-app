/**
 * Two small typed records kept in the Food app settings contact in Odoo:
 * the owner's own cottage-food rules (typed in, never worked out by the app),
 * and nutrition notes per product (typed, never calculated). One line each,
 * with line breaks stored as " ⏎ ".
 */
import type { Settings } from './appSettings';

const BREAK = ' ⏎ ';

/** Text to one safe line for the settings contact. */
export const toLine = (t: string) => t.replace(/\r?\n/g, BREAK).replace(/</g, '‹').replace(/&/g, '＆').trim();
export const fromLine = (t: string | undefined) => (t ?? '').split(BREAK).join('\n');

export const RULES_KEY = 'cottage.rules';
export const nutritionKey = (productId: number) => `nutrition.${productId}`;

/** The owner's rules as a checklist to read before selling: one rule per line. */
export const rulesList = (s: Settings) => fromLine(s[RULES_KEY]).split('\n').map((l) => l.trim()).filter(Boolean);
export const nutritionText = (s: Settings, productId: number) => fromLine(s[nutritionKey(productId)]);

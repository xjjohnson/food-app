import { askKind, keepForNext, logDefaults, logProblems, LogForm } from '../lib/surveyLog';
import { groupJars, splitSize } from '../lib/stock';

const GOOD = [{ id: 11, value: 'Good' }, { id: 12, value: 'Off' }];
const tasting: LogForm = {
  surveyId: 1,
  title: 'Tasting log',
  questions: [
    { id: 1, title: 'Product or batch tasted', type: 'char_box', choices: [] },
    { id: 2, title: 'Who tasted it', type: 'char_box', choices: [] },
    { id: 3, title: 'Score (1 to 5)', type: 'numerical_box', choices: [] },
    { id: 4, title: 'Comment', type: 'text_box', choices: [] },
  ],
};
const shelf: LogForm = {
  surveyId: 2,
  title: 'Shelf-life check',
  questions: [
    { id: 5, title: 'Batch number', type: 'char_box', choices: [] },
    { id: 6, title: 'Day checked', type: 'date', choices: [] },
    { id: 7, title: 'Look', type: 'simple_choice', choices: GOOD },
    { id: 8, title: 'Smell', type: 'simple_choice', choices: GOOD },
  ],
};

describe('log forms fill themselves in', () => {
  test('how each question is asked', () => {
    expect(tasting.questions.map(askKind)).toEqual(['product', 'who', 'score', 'text']);
    expect(shelf.questions.map(askKind)).toEqual(['batch', 'date', 'choice', 'choice']);
  });

  test('a fresh entry has who, today and Good on each choice', () => {
    expect(logDefaults(tasting, '2026-11-27', 'Justin')).toEqual({ 2: 'Justin' });
    expect(logDefaults(shelf, '2026-11-27', '')).toEqual({ 6: '2026-11-27', 7: '11', 8: '11' });
  });

  test('the product or batch must be picked or typed; the next entry keeps who and the day', () => {
    expect(logProblems(tasting, { 2: 'Justin' })).toContain('Product or batch tasted: pick one or type it.');
    expect(logProblems(tasting, { 1: 'Peach Jam', 2: 'Justin', 3: '5' })).toEqual([]);
    expect(keepForNext(shelf, { 5: 'J-1', 6: '2026-11-20', 7: '12', 8: '11' }, '2026-11-27', '')).toEqual({ 6: '2026-11-20', 7: '11', 8: '11' });
  });
});

describe('jars in stock', () => {
  const row = (id: number, name: string, onHand: number, soon?: number) => ({ id, name, onHand, free: onHand, unit: 'Units', soon });
  test('sizes group under the product', () => {
    expect(splitSize('Black Raspberry Jelly (4 oz)')).toEqual({ base: 'Black Raspberry Jelly', size: '4 oz' });
    expect(splitSize('Peach Jam')).toEqual({ base: 'Peach Jam', size: '' });
  });

  test('use-by soon first, then most in stock; empty and ingredients hidden', () => {
    const rows = [row(1, 'Apple Butter (4 oz)', 3), row(2, 'Apple Butter (8 oz)', 5), row(3, 'Grape Jelly (4 oz)', 2, 5), row(4, 'Fig Jam', 0), row(5, 'Apricot Halves', 9), row(6, 'Cookies', 20)];
    const groups = groupJars(rows, { ingredientIds: new Set([5]) });
    expect(groups.map((g) => [g.name, g.total])).toEqual([['Grape Jelly', 2], ['Cookies', 20], ['Apple Butter', 8]]);
    expect(groups[2]!.sizes.map((s) => s.size)).toEqual(['4 oz', '8 oz']);
    expect(groupJars(rows, { ingredientIds: new Set([5]), showEmpty: true }).map((g) => g.name)).toContain('Fig Jam');
    expect(groupJars(rows, { text: 'apple' }).map((g) => g.name)).toEqual(['Apple Butter']);
  });
});
<<<<<<< HEAD

import { parseSettings, writeSettings } from '../lib/appSettings';
import { RULES_KEY, rulesList, toLine } from '../lib/records';
import { TEXAS_RULES } from '../lib/texasRules';

describe('Texas cottage-food rules', () => {
  test('the list keeps every rule, and the exact label line, through the one-line storage', () => {
    const stored = writeSettings({ [RULES_KEY]: toLine(TEXAS_RULES.join('\n')) });
    const back = rulesList(parseSettings(stored));
    expect(back).toHaveLength(TEXAS_RULES.length);
    expect(back.some((r) => r.includes('THIS PRODUCT WAS PRODUCED IN A PRIVATE RESIDENCE THAT IS NOT SUBJECT TO GOVERNMENTAL LICENSING OR INSPECTION.'))).toBe(true);
    expect(back.some((r) => r.includes('$150,000'))).toBe(true);
  });
});

import { loadHistory } from '../lib/activities';

describe('changes list', () => {
  test('an empty-to-empty change is hidden, a real one shows with its numbers', async () => {
    const c = {
      call: async (model: string) => {
        if (model === 'mail.message') return [{ id: 1, date: '2026-11-27 10:00:00', author_id: [1, 'Justin'], body: '', tracking_value_ids: [10, 11] }];
        return [
          { id: 10, field_id: [1, 'Untaxed Amount'], old_value_char: false, new_value_char: false, old_value_float: 0, new_value_float: 0, mail_message_id: [1, 'm'] },
          { id: 11, field_id: [2, 'Total'], old_value_char: false, new_value_char: false, old_value_float: 5, new_value_float: 9, mail_message_id: [1, 'm'] },
        ];
      },
    };
    const lines = await loadHistory(c as never, 'purchase.order', 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe('Total: 5 → 9');
  });
});
=======
>>>>>>> origin/main

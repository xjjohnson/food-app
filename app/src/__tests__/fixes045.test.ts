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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { OdooClient } from '../lib/odoo';
import { enqueue, sendQueue } from '../lib/queue';
import { nutritionKey, nutritionText, rulesList, toLine } from '../lib/records';
import { parseSettings, writeSettings } from '../lib/appSettings';
import { LOG_KINDS, loadLogEntries, loadLogForm, logChange, logProblems, setupLog } from '../lib/surveyLog';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
const shelf = LOG_KINDS.find((k) => k.id === 'shelf')!;

describe('logs kept as Odoo surveys', () => {
  test('the owner makes the survey once; its questions and choices load', async () => {
    const { odoo } = bakery();
    const c = await client(odoo);
    expect(await loadLogForm(c, 'Shelf-life check')).toBeNull();
    expect(await setupLog(c, shelf)).toBe(true);
    expect(await setupLog(c, shelf)).toBe(false);
    const form = (await loadLogForm(c, 'Shelf-life check'))!;
    expect(form.questions.map((q) => q.title)).toEqual(shelf.questions.map((q) => q.title));
    expect(odoo.tables['survey.survey']).toHaveLength(1);
  });

  test('an entry is one finished answer sheet, made once even if sent twice', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const c = await client(odoo);
    await setupLog(c, shelf);
    const form = (await loadLogForm(c, 'Shelf-life check'))!;
    const q = (t: string) => form.questions.find((x) => x.title === t)!;
    const pass = q('Result').choices.find((x) => x.value === 'Pass')!;
    const values = { [q('Batch number').id]: 'J-12', [q('Result').id]: String(pass.id), [q('Day checked').id]: '2026-11-26' };
    expect(logProblems(form, values)).toEqual([]);
    expect(logProblems(form, {})).toEqual(['Fill in at least one answer.']);
    expect(logProblems(form, { [q('Day checked').id]: 'soon' })[0]).toContain('use the form');
    const change = logChange(form, values, 1700000000000);
    const lines = (change.args[0] as { user_input_line_ids: unknown[][] }).user_input_line_ids;
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => (l[2] as { answer_type: string }).answer_type).sort()).toEqual(['char_box', 'date', 'suggestion']);
    await enqueue(AsyncStorage, DB, 1, change);
    await enqueue(AsyncStorage, DB, 1, change);
    await sendQueue(c, AsyncStorage, DB);
    expect(odoo.tables['survey.user_input']).toHaveLength(1);
    expect(odoo.tables['survey.user_input']![0]).toMatchObject({ survey_id: form.surveyId, state: 'done' });
  });

  test('entries list newest first with their answers in question order', async () => {
    const { odoo } = bakery();
    const c = await client(odoo);
    await setupLog(c, shelf);
    const form = (await loadLogForm(c, 'Shelf-life check'))!;
    const a = odoo.create('survey.user_input', { survey_id: form.surveyId, state: 'done', create_date: '2026-11-26 09:00:00', create_uid: [2, 'Bea Baker'] });
    odoo.create('survey.user_input', { survey_id: form.surveyId, state: 'done', create_date: '2026-11-25 09:00:00' });
    odoo.create('survey.user_input.line', { user_input_id: [a, 'x'], question_id: [form.questions[1]!.id, 'Day checked'], answer_type: 'date', value_date: '2026-11-26' });
    odoo.create('survey.user_input.line', { user_input_id: [a, 'x'], question_id: [form.questions[0]!.id, 'Batch number'], answer_type: 'char_box', value_char_box: 'J-12' });
    const list = await loadLogEntries(c, form);
    expect(list).toHaveLength(2);
    const mine = list.find((e) => e.id === a)!;
    expect(mine.by).toBe('Bea Baker');
    expect(mine.answers).toEqual([{ question: 'Batch number', value: 'J-12' }, { question: 'Day checked', value: '2026-11-26' }]);
  });
});

describe('typed records in the settings contact', () => {
  test('rules and nutrition notes survive the one-line storage, line breaks and all', () => {
    const rules = 'Label every jar\nKeep sales under the limit & check the state rules';
    const stored = writeSettings({ 'cottage.rules': toLine(rules), [nutritionKey(5)]: toLine('Serving 1 tbsp\nSugar 12 g') });
    const s = parseSettings(stored);
    expect(rulesList(s)).toEqual(['Label every jar', 'Keep sales under the limit ＆ check the state rules']);
    expect(nutritionText(s, 5)).toBe('Serving 1 tbsp\nSugar 12 g');
  });
});

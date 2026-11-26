/**
 * Small records kept as Odoo Surveys (free, built in): kitchen checks, tasting
 * log, shelf-life check. Each log is one survey; the questions are the fields
 * and every entry is one finished answer sheet, so it reads fine in Odoo too
 * (Surveys, the survey, Results). The owner makes the survey once with a tap;
 * after that anyone can add entries, with or without signal (offline queue).
 *
 * The app never changes an Odoo setting: if the Surveys app is not on, it says
 * so and the owner switches it on in Odoo.
 *
 * Kept free of React; the client is passed in.
 */
import type { OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export type QType = 'char_box' | 'text_box' | 'numerical_box' | 'date' | 'simple_choice';

export interface LogKind {
  id: 'kitchen' | 'tasting' | 'shelf';
  /** The survey's title in Odoo. */
  title: string;
  detail: string;
  questions: { title: string; type: QType; choices?: string[] }[];
}

const YN = ['Yes', 'No'];
const GOOD = ['Good', 'Off'];

export const LOG_KINDS: LogKind[] = [
  {
    id: 'kitchen',
    title: 'Kitchen checks',
    detail: 'Fridge and freezer temperatures, cleaning, who and when',
    questions: [
      { title: 'Fridge temperature (°F)', type: 'numerical_box' },
      { title: 'Freezer temperature (°F)', type: 'numerical_box' },
      { title: 'Surfaces cleaned and sanitized?', type: 'simple_choice', choices: YN },
      { title: 'Hands washed, hair and apron covered?', type: 'simple_choice', choices: YN },
      { title: 'Notes', type: 'text_box' },
    ],
  },
  {
    id: 'tasting',
    title: 'Tasting log',
    detail: 'Samples and tastings: what, who, score, comment',
    questions: [
      { title: 'Product or batch tasted', type: 'char_box' },
      { title: 'Who tasted it', type: 'char_box' },
      { title: 'Score (1 to 5)', type: 'numerical_box' },
      { title: 'Comment', type: 'text_box' },
    ],
  },
  {
    id: 'shelf',
    title: 'Shelf-life check',
    detail: 'Check a batch as it ages: look, smell, texture, pass or fail',
    questions: [
      { title: 'Batch number', type: 'char_box' },
      { title: 'Day checked', type: 'date' },
      { title: 'Look', type: 'simple_choice', choices: GOOD },
      { title: 'Smell', type: 'simple_choice', choices: GOOD },
      { title: 'Texture', type: 'simple_choice', choices: GOOD },
      { title: 'Result', type: 'simple_choice', choices: ['Pass', 'Fail'] },
      { title: 'Notes', type: 'text_box' },
    ],
  },
];

export interface LogQuestion {
  id: number;
  title: string;
  type: QType;
  choices: { id: number; value: string }[];
}

export interface LogForm {
  surveyId: number;
  title: string;
  questions: LogQuestion[];
}

const TYPES: QType[] = ['char_box', 'text_box', 'numerical_box', 'date', 'simple_choice'];

/** The survey and its questions, or null when it is not made yet. Throws if Odoo has no Surveys app. */
export async function loadLogForm(c: Client, title: string): Promise<LogForm | null> {
  const [s] = (await c.call('survey.survey', 'search_read', [[['title', '=', title]]], { fields: ['title'], limit: 1 })) as { id: number }[];
  if (!s) return null;
  const qs = (await c.call('survey.question', 'search_read', [[['survey_id', '=', s.id], ['is_page', '=', false]]], { fields: ['title', 'question_type', 'sequence'], order: 'sequence asc, id asc' })) as Record<string, unknown>[];
  const answers = qs.length ? ((await c.call('survey.question.answer', 'search_read', [[['question_id', 'in', qs.map((q) => q.id)]]], { fields: ['question_id', 'value', 'sequence'], order: 'sequence asc, id asc' })) as Record<string, unknown>[]) : [];
  const qOf = (a: Record<string, unknown>) => (Array.isArray(a.question_id) ? (a.question_id[0] as number) : (a.question_id as number));
  return {
    surveyId: s.id,
    title,
    questions: qs
      .filter((q) => TYPES.includes(q.question_type as QType))
      .map((q) => ({
        id: q.id as number,
        title: String(q.title ?? ''),
        type: q.question_type as QType,
        choices: answers.filter((a) => qOf(a) === q.id).map((a) => ({ id: a.id as number, value: String(a.value ?? '') })),
      })),
  };
}

/** Makes the survey with its questions (owner tap). Does nothing if it is already there. Returns true if it made it. */
export async function setupLog(c: Client, kind: LogKind): Promise<boolean> {
  const have = (await c.call('survey.survey', 'search', [[['title', '=', kind.title]]], { limit: 1 })) as number[];
  if (have.length) return false;
  const survey = (await c.call('survey.survey', 'create', [{ title: kind.title }], {})) as number;
  let seq = 1;
  for (const q of kind.questions) {
    const qid = (await c.call('survey.question', 'create', [{ survey_id: survey, title: q.title, question_type: q.type, sequence: seq++ }], {})) as number;
    for (const v of q.choices ?? []) await c.call('survey.question.answer', 'create', [{ question_id: qid, value: v }], {});
  }
  return true;
}

/** Values typed on the form: the question's id to the text typed or the chosen answer's id. */
export type LogValues = Record<number, string>;

/** What is still missing, in plain words. Numbers must be numbers; dates look like 2026-11-26. */
export function logProblems(form: LogForm, v: LogValues): string[] {
  const out: string[] = [];
  for (const q of form.questions) {
    const t = (v[q.id] ?? '').trim();
    if (!t) continue;
    if (q.type === 'numerical_box' && !Number.isFinite(Number(t.replace(',', '.')))) out.push(`${q.title}: type a number.`);
    if (q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(t)) out.push(`${q.title}: use the form 2026-11-26.`);
  }
  if (!form.questions.some((q) => (v[q.id] ?? '').trim())) out.push('Fill in at least one answer.');
  return out;
}

/** One finished entry. Sent once even if the queue sends it twice (the token is in the nickname). */
export function logChange(form: LogForm, v: LogValues, now = Date.now()): NewChange {
  const token = `food-app-log-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const lines: unknown[] = [];
  for (const q of form.questions) {
    const t = (v[q.id] ?? '').trim();
    if (!t) continue;
    const base = { question_id: q.id };
    if (q.type === 'char_box') lines.push([0, 0, { ...base, answer_type: 'char_box', value_char_box: t }]);
    else if (q.type === 'text_box') lines.push([0, 0, { ...base, answer_type: 'text_box', value_text_box: t }]);
    else if (q.type === 'numerical_box') lines.push([0, 0, { ...base, answer_type: 'numerical_box', value_numerical_box: Number(t.replace(',', '.')) }]);
    else if (q.type === 'date') lines.push([0, 0, { ...base, answer_type: 'date', value_date: t }]);
    else lines.push([0, 0, { ...base, answer_type: 'suggestion', suggested_answer_id: Number(t) }]);
  }
  return {
    label: `${form.title} entry`,
    model: 'survey.user_input',
    method: 'create',
    args: [{ survey_id: form.surveyId, state: 'done', nickname: token, user_input_line_ids: lines }],
    already: { model: 'survey.user_input', domain: [['nickname', '=', token]] },
  };
}

export interface LogEntry {
  id: number;
  when: string;
  by: string;
  answers: { question: string; value: string }[];
}

/** The latest entries, newest first. */
export async function loadLogEntries(c: Client, form: LogForm, limit = 20): Promise<LogEntry[]> {
  const inputs = (await c.call('survey.user_input', 'search_read', [[['survey_id', '=', form.surveyId], ['state', '=', 'done']]], { fields: ['create_date', 'create_uid'], order: 'id desc', limit })) as Record<string, unknown>[];
  if (!inputs.length) return [];
  const lines = (await c.call('survey.user_input.line', 'search_read', [[['user_input_id', 'in', inputs.map((i) => i.id)]]], { fields: ['user_input_id', 'question_id', 'answer_type', 'value_char_box', 'value_text_box', 'value_numerical_box', 'value_date', 'suggested_answer_id'] })) as Record<string, unknown>[];
  const order = new Map(form.questions.map((q, i) => [q.id, i]));
  return inputs.map((i) => ({
    id: i.id as number,
    when: typeof i.create_date === 'string' ? i.create_date.slice(0, 16) : '',
    by: Array.isArray(i.create_uid) ? String(i.create_uid[1] ?? '') : '',
    answers: lines
      .filter((l) => Array.isArray(l.user_input_id) ? l.user_input_id[0] === i.id : l.user_input_id === i.id)
      .sort((a, b) => (order.get(Array.isArray(a.question_id) ? (a.question_id[0] as number) : (a.question_id as number)) ?? 0) - (order.get(Array.isArray(b.question_id) ? (b.question_id[0] as number) : (b.question_id as number)) ?? 0))
      .map((l) => {
        const t = l.answer_type;
        const value = t === 'char_box' ? l.value_char_box : t === 'text_box' ? l.value_text_box : t === 'numerical_box' ? l.value_numerical_box : t === 'date' ? l.value_date : Array.isArray(l.suggested_answer_id) ? l.suggested_answer_id[1] : '';
        return { question: Array.isArray(l.question_id) ? String(l.question_id[1] ?? '') : '', value: String(value ?? '') };
      }),
  }));
}

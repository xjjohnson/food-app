/**
 * The offline queue: changes made without signal (at a market, in the back
 * room) that Odoo doesn't have yet.
 *
 * How it works:
 * - With signal, a change goes straight to Odoo (`saveOrQueue`). Only when
 *   Odoo can't be reached is it kept here, in the order it was made.
 * - When signal comes back the queue is sent oldest first (`sendQueue`). A
 *   send that fails for lack of signal stops the run and tries again later.
 * - If Odoo refuses a change (for example the product was archived), that
 *   change is marked "needs a look" and the run stops, so later changes
 *   that may depend on it aren't sent out of order. The Waiting screen shows
 *   it with Odoo's reason, to try again or remove.
 * - Every change is tagged with the database it was made for, and is only
 *   ever sent to that one. Switching to the test database never sends live
 *   changes there, or the other way round.
 * - A change can name what to look for in Odoo first (`already`). If a send
 *   reached Odoo but the answer was lost, the next try finds it there and
 *   doesn't make it twice.
 * - Only things a person did in the app go in here. An app update never adds
 *   to it, and an entry from a newer or older app version that this one
 *   doesn't understand is held for a look instead of being sent.
 *
 * Kept free of React; storage and the client are passed in.
 */
import { OdooError, type OdooClient } from './odoo';
import { log } from './log';

export const QUEUE_KEY = 'queue/v1';
export const QUEUE_VERSION = 1;

/** A second call on the record a create made. `onlyWhen` is checked first, so running it twice is harmless. */
export interface ThenCall {
  method: string;
  kwargs?: Record<string, unknown>;
  onlyWhen?: unknown[];
}

export interface QueuedChange {
  v: number;
  id: string;
  /** The database it was made for (dbSwitch.dbId). */
  db: string;
  /** What it is in plain words, for the Waiting screen: "Finish batch CC-0412". */
  label: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
  /** Look for this in Odoo first; when found, the change is already there and isn't sent again. */
  already?: { model: string; domain: unknown[] };
  /** Run on the record right after a create or a write (for example confirming a batch). */
  then?: ThenCall;
  /** Who made it (Odoo user id) and when. */
  by: number;
  createdAt: number;
  tries: number;
  state: 'waiting' | 'stuck';
  /** Odoo's reason, when it refused. */
  error?: string;
  lastTryAt?: number;
}

export interface Storage {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<unknown>;
}

type Client = Pick<OdooClient, 'call' | 'session'>;

export async function loadQueue(storage: Storage): Promise<QueuedChange[]> {
  try {
    const raw = await storage.getItem(QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((x) => x && typeof x.id === 'string' && typeof x.db === 'string')
      .map((x: QueuedChange) => (x.v === QUEUE_VERSION ? x : { ...x, state: 'stuck' as const, error: 'Made by another version of the app. Check it before sending.' }));
  } catch {
    return [];
  }
}

async function saveQueue(storage: Storage, q: QueuedChange[]) {
  await storage.setItem(QUEUE_KEY, JSON.stringify(q));
}

let seq = 0;
const newId = (now: number) => `${now.toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface NewChange {
  label: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
  already?: { model: string; domain: unknown[] };
  then?: ThenCall;
}

export async function enqueue(storage: Storage, db: string, by: number, change: NewChange, now = Date.now()): Promise<QueuedChange> {
  const item: QueuedChange = { v: QUEUE_VERSION, id: newId(now), db, by, createdAt: now, tries: 0, state: 'waiting', ...change };
  const q = await loadQueue(storage);
  q.push(item);
  await saveQueue(storage, q);
  log.info('queue', `kept to send later: ${change.label}`);
  return item;
}

/** The changes for this database still to send (waiting or needing a look). */
export const forDb = (q: QueuedChange[], db: string) => q.filter((x) => x.db === db);

/** Runs a change's `then` call on the records it made (or found already there). */
async function runThen(c: Client, item: NewChange, ids: number[]): Promise<void> {
  const t = item.then;
  if (!t || !ids.length) return;
  const todo = t.onlyWhen ? ((await c.call(item.model, 'search', [[['id', 'in', ids], ...t.onlyWhen]])) as number[]) : ids;
  if (todo.length) await c.call(item.model, t.method, [todo], t.kwargs ?? {});
}

/** Makes the change in Odoo, then runs its `then` call. Skips what is already there. */
async function execute(c: Client, item: NewChange, checkAlready: boolean): Promise<unknown> {
  if (checkAlready && item.already) {
    const found = (await c.call(item.already.model, 'search', [item.already.domain])) as number[];
    if (found.length) {
      if (item.then && item.already.model === item.model) await runThen(c, item, found);
      return null;
    }
  }
  const result = await c.call(item.model, item.method, item.args, item.kwargs ?? {});
  if (item.then) {
    const ids = typeof result === 'number' ? [result] : item.method === 'write' && Array.isArray(item.args[0]) ? (item.args[0] as number[]) : [];
    await runThen(c, item, ids);
  }
  return result;
}

export interface SendResult {
  sent: number;
  /** True when it stopped because Odoo couldn't be reached. */
  offline: boolean;
  /** The change that Odoo refused, if the run stopped on one. */
  stuck?: QueuedChange;
  left: number;
}

/**
 * Sends this database's waiting changes to Odoo, oldest first. Changes for
 * other databases are left exactly as they are. Never throws.
 */
export async function sendQueue(c: Client, storage: Storage, db: string, now = Date.now()): Promise<SendResult> {
  let q = await loadQueue(storage);
  let sent = 0;
  const out = (extra: Partial<SendResult>): SendResult => ({ sent, offline: false, left: forDb(q, db).length, ...extra });
  for (const item of forDb(q, db)) {
    if (item.state === 'stuck') return out({ stuck: item });
    try {
      await execute(c, item, true);
      q = (await loadQueue(storage)).filter((x) => x.id !== item.id);
      await saveQueue(storage, q);
      sent++;
      log.info('queue', `sent: ${item.label}`);
    } catch (e) {
      const offline = e instanceof OdooError && e.kind === 'network';
      q = (await loadQueue(storage)).map((x) =>
        x.id === item.id ? { ...x, tries: x.tries + 1, lastTryAt: now, ...(offline ? {} : { state: 'stuck' as const, error: e instanceof Error ? e.message : String(e) }) } : x,
      );
      await saveQueue(storage, q);
      if (offline) return out({ offline: true });
      log.warn('queue', `Odoo refused: ${item.label}`);
      return out({ stuck: q.find((x) => x.id === item.id) });
    }
  }
  return out({});
}

/** Puts a change that needed a look back in line to send. */
export async function retryChange(storage: Storage, id: string): Promise<void> {
  const q = await loadQueue(storage);
  await saveQueue(
    storage,
    q.map((x) => (x.id === id ? { ...x, v: QUEUE_VERSION, state: 'waiting' as const, error: undefined } : x)),
  );
}

/** Drops a change for good: it is never sent. */
export async function removeChange(storage: Storage, id: string): Promise<void> {
  const q = await loadQueue(storage);
  const gone = q.find((x) => x.id === id);
  await saveQueue(storage, q.filter((x) => x.id !== id));
  if (gone) log.warn('queue', `removed without sending: ${gone.label}`);
}

export type SaveOutcome = { status: 'saved'; result: unknown } | { status: 'queued'; item: QueuedChange };

/**
 * Saves a change: straight to Odoo when it can be reached, otherwise into the
 * queue. If older changes are still waiting, this one waits behind them so
 * Odoo gets them in the order they were made. Odoo refusing the change is
 * thrown to the screen (the person is there to see why); only "no signal"
 * queues.
 */
export async function saveOrQueue(c: Client | null, storage: Storage, db: string, by: number, change: NewChange, now = Date.now()): Promise<SaveOutcome> {
  const waiting = forDb(await loadQueue(storage), db).length > 0;
  if (c && !waiting) {
    try {
      return { status: 'saved', result: await execute(c, change, false) };
    } catch (e) {
      if (!(e instanceof OdooError && e.kind === 'network')) throw e;
    }
  }
  return { status: 'queued', item: await enqueue(storage, db, by, change, now) };
}

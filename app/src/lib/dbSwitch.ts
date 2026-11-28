/**
 * Switching which Odoo database the phone is attached to (Developer screen),
 * for example from the live food database to its test copy.
 *
 * The phone keeps its offline copies and everything waiting to send in
 * its own storage. That data belongs to ONE Odoo database, so it must never
 * be sent to another. Switching therefore:
 *   1. saves everything the phone holds for the database being left to a
 *      snapshot file, and checks it can be read back before anything is cleared;
 *   2. empties the phone's data and loads the snapshot of the database being
 *      entered (empty the first time, so it downloads fresh from Odoo);
 *   3. records which database the phone's data belongs to.
 * A journal makes the swap finish itself if the app is closed half way. The
 * phone never copies old data into Odoo here; each database keeps its own.
 * Kept free of React; storage, files and the key store are passed in.
 */
import { BETA_KEY } from './updateChannel';
import { LOG_KEY } from './log';
import { ODOO_STORAGE_KEY, cleanUrl } from './odoo';
import type { SecretStore } from './secrets';

export const SECRET_KEY = 'odoo.secret';
/** Which database the phone's data belongs to. Written last in a swap. */
export const OWNER_KEY = 'dbswitch/owner';
export const KNOWN_KEY = 'dbswitch/known';
/** Which databases are marked as the live one or a test copy: { [dbId]: 'live' | 'test' }. */
export const KINDS_KEY = 'dbswitch/kinds';
export const JOURNAL_KEY = 'dbswitch/journal';

/** Kept as they are across a switch: the sign-in, update channel, log, the brand and this feature's own records. */
export function isShared(key: string): boolean {
  return key === ODOO_STORAGE_KEY || key === BETA_KEY || key === LOG_KEY || key.startsWith('dbswitch/') || key.startsWith('dev/');
}

export interface DbTarget {
  url: string;
  db: string;
  login: string;
}

/** Same address and database name always give the same id. */
export function dbId(t: Pick<DbTarget, 'url' | 'db'>): string {
  return `${cleanUrl(t.url).toLowerCase()}|${t.db.trim().toLowerCase()}`;
}

/** "food.example.com / food-test" for words on screen. */
export function dbLabel(t: Pick<DbTarget, 'url' | 'db'>): string {
  return `${cleanUrl(t.url).replace(/^https?:\/\//, '')} / ${t.db.trim()}`;
}

export interface KeyValueStore {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<unknown>;
  removeItem(k: string): Promise<unknown>;
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<unknown>;
  multiRemove(keys: readonly string[]): Promise<unknown>;
}

/** Where a database's snapshot lives (a file on the phone, so it doesn't crowd the app's storage). */
export interface SnapshotStore {
  read(id: string): Promise<string | null>;
  write(id: string, text: string): Promise<void>;
}

export interface Deps {
  storage: KeyValueStore;
  snapshots: SnapshotStore;
  secrets: SecretStore;
}

export interface KnownDb extends DbTarget {
  id: string;
  lastUsed: number;
}

export async function knownDatabases(storage: KeyValueStore): Promise<KnownDb[]> {
  try {
    const raw = await storage.getItem(KNOWN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string' && typeof x.url === 'string' && typeof x.db === 'string') : [];
  } catch {
    return [];
  }
}

async function remember(storage: KeyValueStore, t: DbTarget, now: number) {
  const id = dbId(t);
  const list = (await knownDatabases(storage)).filter((x) => x.id !== id);
  list.push({ id, url: cleanUrl(t.url), db: t.db.trim(), login: t.login, lastUsed: now });
  await storage.setItem(KNOWN_KEY, JSON.stringify(list));
}

export type DbKind = 'live' | 'test';

export async function dbKinds(storage: Pick<KeyValueStore, 'getItem'>): Promise<Record<string, DbKind>> {
  try {
    const raw = await storage.getItem(KINDS_KEY);
    const d = raw ? JSON.parse(raw) : {};
    return d && typeof d === 'object' ? (d as Record<string, DbKind>) : {};
  } catch {
    return {};
  }
}

/** Marks a database as the live one or a test copy. Only one can be live: marking another live makes the old one unmarked. */
export async function setDbKind(storage: Pick<KeyValueStore, 'getItem' | 'setItem'>, t: Pick<DbTarget, 'url' | 'db'>, kind: DbKind | null) {
  const kinds = await dbKinds(storage);
  const id = dbId(t);
  if (kind === 'live') for (const k of Object.keys(kinds)) if (kinds[k] === 'live') delete kinds[k];
  if (kind) kinds[id] = kind;
  else delete kinds[id];
  await storage.setItem(KINDS_KEY, JSON.stringify(kinds));
}

/** 'test' when this database is marked as a test copy, 'live' when marked live, null when not marked. */
export async function kindOf(storage: Pick<KeyValueStore, 'getItem'>, t: Pick<DbTarget, 'url' | 'db'> | null): Promise<DbKind | null> {
  if (!t) return null;
  return (await dbKinds(storage))[dbId(t)] ?? null;
}

/**
 * The keystore only accepts letters, digits, "." "-" and "_" in a key name, so
 * the address and database are encoded (an "@" or ":" made every save fail).
 */
export const secretFor = (id: string) => `${SECRET_KEY}.${id.replace(/[^A-Za-z0-9._-]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`)}`;

/** A key saved for a database the phone has been attached to before. */
export async function hasSavedSecret(secrets: SecretStore, t: Pick<DbTarget, 'url' | 'db'>): Promise<boolean> {
  return !!(await secrets.get(secretFor(dbId(t))));
}

async function snapshotOf(storage: KeyValueStore): Promise<Record<string, string>> {
  // Saved copies of Odoo's answers (cache/) are not snapshotted: they are read again from Odoo.
  const keys = (await storage.getAllKeys()).filter((k) => !isShared(k) && !k.startsWith('cache/'));
  const out: Record<string, string> = {};
  for (const [k, v] of await storage.multiGet(keys)) if (v !== null) out[k] = v;
  return out;
}

const why = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 120);

interface Journal {
  from: string;
  to: DbTarget;
}

/** Steps 2 and 3; safe to run again if the app was closed part way (the snapshots are already saved). */
async function finishSwap(deps: Deps, j: Journal, now: number) {
  const { storage, snapshots } = deps;
  const keys = (await storage.getAllKeys()).filter((k) => !isShared(k));
  if (keys.length) await storage.multiRemove(keys);
  const raw = await snapshots.read(dbId(j.to));
  const saved: Record<string, string> = raw ? JSON.parse(raw) : {};
  const pairs = Object.entries(saved).filter(([k]) => !isShared(k));
  if (pairs.length) await storage.multiSet(pairs);
  await storage.setItem(OWNER_KEY, dbId(j.to));
  await storage.setItem(ODOO_STORAGE_KEY, JSON.stringify({ url: cleanUrl(j.to.url), db: j.to.db.trim(), login: j.to.login }));
  await remember(storage, j.to, now);
  await storage.removeItem(JOURNAL_KEY);
}

/**
 * Moves the phone to another database. Call only after the sign-in to the new
 * database has worked, so a wrong password or name changes nothing. Restart
 * the app afterwards so every screen reloads its data.
 */
export async function switchDatabase(deps: Deps, from: DbTarget | null, to: DbTarget, secret: string, now = Date.now()): Promise<void> {
  const { storage, snapshots, secrets } = deps;
  const fromId = from ? dbId(from) : (await storage.getItem(OWNER_KEY)) ?? null;
  if (fromId === dbId(to)) throw new Error('Already attached to that database.');
  if (from) await remember(storage, from, now);
  // 1. Save what the phone holds for the database being left, and prove it reads back.
  if (fromId) {
    const SAFE = "Couldn't save this database's data safely, so nothing was changed.";
    let text: string;
    try {
      text = JSON.stringify(await snapshotOf(storage));
    } catch (e) {
      throw new Error(`${SAFE} The phone couldn't read its own saved data (${why(e)}).`);
    }
    try {
      await snapshots.write(fromId, text);
    } catch (e) {
      throw new Error(`${SAFE} The phone couldn't write the backup file (${why(e)}). It may be out of storage space.`);
    }
    let back: string | null;
    try {
      back = await snapshots.read(fromId);
    } catch (e) {
      throw new Error(`${SAFE} The backup file was written but couldn't be read back (${why(e)}).`);
    }
    if (back !== text) throw new Error(`${SAFE} The backup file didn't match what was saved${back === null ? ' (it was empty or missing)' : ''}.`);
    const old = await secrets.get(SECRET_KEY);
    if (old) await secrets.set(secretFor(fromId), old);
  }
  await secrets.set(SECRET_KEY, secret);
  await secrets.set(secretFor(dbId(to)), secret);
  const journal: Journal = { from: fromId ?? '', to };
  await storage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  // 2 and 3.
  await finishSwap(deps, journal, now);
}

/** Looks for a swap the app was closed in the middle of, and finishes it. Returns true if it did. */
export async function resumeSwitch(deps: Deps, now = Date.now()): Promise<boolean> {
  const raw = await deps.storage.getItem(JOURNAL_KEY).catch(() => null);
  if (!raw) return false;
  try {
    const j = JSON.parse(raw) as Journal;
    if (!j?.to?.url || !j?.to?.db) throw new Error('bad journal');
    await finishSwap(deps, j, now);
    return true;
  } catch {
    // A damaged journal: drop it. The sign-in still points at the old database and the owner tag stops anything being sent (see dataMatches).
    await deps.storage.removeItem(JOURNAL_KEY).catch(() => undefined);
    return false;
  }
}

/**
 * True when the phone's data may be sent to this database: it was made for it,
 * or for no database yet (phones from before the switcher).
 */
export async function dataMatches(storage: KeyValueStore, current: Pick<DbTarget, 'url' | 'db'>): Promise<boolean> {
  const owner = await storage.getItem(OWNER_KEY).catch(() => null);
  return !owner || owner === dbId(current);
}

/** Tags phones from before the switcher with the database they are signed in to, so the check above has something to compare with. */
export async function claimIfUnowned(storage: KeyValueStore, current: Pick<DbTarget, 'url' | 'db'>) {
  const owner = await storage.getItem(OWNER_KEY).catch(() => null);
  if (!owner) await storage.setItem(OWNER_KEY, dbId(current)).catch(() => undefined);
}

/** The words shown before switching. */
export function switchWarning(pendingText: string, from: Pick<DbTarget, 'url' | 'db'> | null, to: Pick<DbTarget, 'url' | 'db'>): string {
  const keep = `Everything on this phone for ${from ? dbLabel(from) : 'the current database'} is saved separately and comes back if you switch back. None of it is sent to ${dbLabel(to)}.`;
  return pendingText ? `Not sent to Odoo yet: ${pendingText}. It stays with ${from ? dbLabel(from) : 'the current database'} and does NOT send until you switch back. ${keep}` : keep;
}

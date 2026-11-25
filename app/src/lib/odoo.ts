/**
 * Talking to the business's Odoo 19: signing in and calling any model.
 *
 * Uses Odoo's JSON-RPC endpoint (/jsonrpc) with the person's password or an
 * API key (Odoo: Preferences > Account Security > New API key). Odoo is the
 * single source of truth: every save in the app goes through here.
 *
 * Kept free of React. The network call is passed in, so tests use a fake
 * server.
 */
import { flakyDrop, pretendOffline, SLOW_MS, weakSignal } from './devFlags';
import { log } from './log';

export const ODOO_STORAGE_KEY = 'odoo/v1';

export interface OdooLogin {
  /** "https://food.example.com" or an odoo.com address. */
  url: string;
  db: string;
  login: string;
}

export interface OdooSession extends OdooLogin {
  uid: number;
  name: string;
  /** The person's company (res.company id). */
  companyId: number;
  /** The person's own contact (res.partner id). */
  partnerId: number;
  /** "19.0" and so on, from Odoo itself. Empty if Odoo wouldn't say. */
  serverVersion: string;
}

export type Fetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** network: no signal or wrong address. login: Odoo said no. server: Odoo refused the change. */
export class OdooError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'login' | 'server',
  ) {
    super(message);
  }
}

/** Tidies what was typed: adds https://, drops a trailing slash and /web or /odoo paths. */
export function cleanUrl(url: string): string {
  let u = url.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/[?#].*$/, '').replace(/\/+(web|odoo|shop)(\/.*)?$/i, '').replace(/\/+$/, '');
  return u;
}

/** The database name an odoo.com address usually uses: "acme" for acme.odoo.com. */
export function guessDb(url: string): string {
  const m = cleanUrl(url).match(/^https?:\/\/([^./]+)\.odoo\.com$/i);
  return m ? m[1]! : '';
}

let rpcId = 0;

/** What a call was, for the log: "mrp.production.create" or "sign in". Never what was sent. */
function callName(service: string, method: string, args: unknown[]): string {
  if (service === 'object' && typeof args[3] === 'string' && typeof args[4] === 'string') return `${args[3]}.${args[4]}`;
  if (service === 'common' && method === 'authenticate') return 'sign in';
  return `${service}.${method}`;
}

async function rpc(fetchFn: Fetch, url: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  const name = callName(service, method, args);
  const started = Date.now();
  try {
    const result = await rpcOnce(fetchFn, url, service, method, args);
    log.info('odoo', `${name} ok ${Date.now() - started} ms`);
    return result;
  } catch (e) {
    log.warn('odoo', `${name} failed after ${Date.now() - started} ms: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

async function rpcOnce(fetchFn: Fetch, url: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  let res;
  try {
    if (pretendOffline()) throw new Error('Pretend offline is on (Developer screen).');
    if (weakSignal() === 'slow') await new Promise((r) => setTimeout(r, SLOW_MS));
    if (flakyDrop()) throw new Error('Weak signal test: this call was dropped (Developer screen).');
    res = await fetchFn(`${url}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: ++rpcId }),
    });
  } catch {
    throw new OdooError("Couldn't reach Odoo. Check the address and the phone's internet.", 'network');
  }
  if (!res.ok) {
    // 5xx and gateway errors are usually a passing server problem: treat like no signal, so queued work waits and tries again.
    throw new OdooError(`Odoo answered with an error (${res.status}). Check the address.`, 'network');
  }
  let data: { result?: unknown; error?: { message?: string; data?: { message?: string; name?: string } } };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new OdooError("That address doesn't look like an Odoo server.", 'network');
  }
  if (data.error) {
    const msg = data.error.data?.message || data.error.message || 'Odoo error';
    if (/AccessDenied|Access Denied/i.test(`${data.error.data?.name} ${msg}`)) throw new OdooError('Wrong email, password or API key.', 'login');
    if (/database .* does not exist|KeyError/i.test(msg)) throw new OdooError("That database name isn't on this Odoo.", 'login');
    throw new OdooError(msg, 'server');
  }
  return data.result;
}

/** Odoo wants datetimes as "2026-11-12 14:00:00" in UTC. */
export function toOdooTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** The id of a many2one value ([id, "Name"] or false). 0 when empty. */
export const m2oId = (v: unknown): number => (Array.isArray(v) && typeof v[0] === 'number' ? v[0] : typeof v === 'number' ? v : 0);

export class OdooClient {
  constructor(
    private readonly fetchFn: Fetch,
    readonly session: OdooSession,
    private readonly secret: string,
  ) {}

  /** Signs in and reads who the person is and which company they belong to. */
  static async signIn(fetchFn: Fetch, login: OdooLogin, secret: string): Promise<OdooClient> {
    const url = cleanUrl(login.url);
    const db = login.db.trim();
    const email = login.login.trim();
    if (!url || !db || !email || !secret) throw new OdooError('Fill in the address, database, email and password or API key.', 'login');
    const uid = await rpc(fetchFn, url, 'common', 'authenticate', [db, email, secret, {}]);
    if (typeof uid !== 'number' || uid <= 0) throw new OdooError('Wrong email, password or API key.', 'login');
    let serverVersion = '';
    try {
      const v = (await rpc(fetchFn, url, 'common', 'version', [])) as { server_version?: unknown } | null;
      if (typeof v?.server_version === 'string') serverVersion = v.server_version;
    } catch {
      // Not knowing the version is not a reason to refuse the sign-in.
    }
    const base: OdooSession = { url, db, login: email, uid, name: email, companyId: 0, partnerId: 0, serverVersion };
    const probe = new OdooClient(fetchFn, base, secret);
    const [me] = (await probe.call('res.users', 'read', [[uid]], { fields: ['name', 'company_id', 'partner_id'] })) as { name?: unknown; company_id?: unknown; partner_id?: unknown }[];
    return new OdooClient(fetchFn, { ...base, name: typeof me?.name === 'string' ? me.name : email, companyId: m2oId(me?.company_id), partnerId: m2oId(me?.partner_id) }, secret);
  }

  /** Any model method: call('mrp.production', 'search_read', [domain], { fields }). */
  call(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<unknown> {
    return rpc(this.fetchFn, this.session.url, 'object', 'execute_kw', [this.session.db, this.session.uid, this.secret, model, method, args, kwargs]);
  }

  /** True when the person belongs to this Odoo group ("base.group_system"). False if Odoo won't say. */
  async hasGroup(xmlid: string): Promise<boolean> {
    try {
      return (await this.call('res.users', 'has_group', [[this.session.uid], xmlid])) === true;
    } catch {
      return false;
    }
  }

  /** True when this Odoo has the model (its app is installed and the person may read it). */
  async hasModel(model: string): Promise<boolean> {
    try {
      const n = await this.call('ir.model', 'search_count', [[['model', '=', model]]]);
      return typeof n === 'number' && n > 0;
    } catch {
      return false;
    }
  }
}

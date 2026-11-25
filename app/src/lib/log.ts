/**
 * The app's own log, so when something goes wrong there's a record of what
 * the app tried and what Odoo answered. Kept on the phone for 7 days (the
 * last 2,000 lines), and shared from the Developer screen.
 *
 * Nothing secret is written: passwords, API keys and tokens are blanked out
 * before a line is kept, and Odoo calls are logged by model and method only,
 * never with what was sent.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number;
  level: LogLevel;
  /** What part of the app: app, odoo, queue, update, crash... */
  area: string;
  msg: string;
}

export const LOG_KEY = 'log/v1';
export const KEEP_MS = 7 * 24 * 3600 * 1000;
const MAX_LINES = 2000;
const MAX_MSG = 1000;

/** Blanks anything that looks like a password, key or token. */
export function redact(msg: string): string {
  return msg
    .replace(/((?:password|passwd|api[_ -]?key|secret|token)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1***')
    .replace(/\b[a-f0-9]{32,}\b/gi, '***');
}

let lines: LogEntry[] = [];
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(LOG_KEY, JSON.stringify(lines)).catch(() => undefined);
  }, 1000);
}

function add(level: LogLevel, area: string, msg: string) {
  lines.push({ t: Date.now(), level, area, msg: redact(msg).slice(0, MAX_MSG) });
  if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
  listeners.forEach((l) => l());
  if (loaded) save();
}

export const log = {
  info: (area: string, msg: string) => add('info', area, msg),
  warn: (area: string, msg: string) => add('warn', area, msg),
  error: (area: string, msg: string) => add('error', area, msg),
  all: (): LogEntry[] => lines.slice(),
  /** Reads what was kept from earlier runs and drops lines older than 7 days. */
  async load(now = Date.now()) {
    try {
      const raw = await AsyncStorage.getItem(LOG_KEY);
      const old = raw ? (JSON.parse(raw) as LogEntry[]) : [];
      lines = [...(Array.isArray(old) ? old : []), ...lines].filter((e) => e && e.t >= now - KEEP_MS).slice(-MAX_LINES);
    } catch {
      // A damaged log is dropped.
    }
    loaded = true;
    save();
  },
  clear() {
    lines = [];
    listeners.forEach((l) => l());
    AsyncStorage.removeItem(LOG_KEY).catch(() => undefined);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** One error as text, with the first few lines of its stack. */
export function describeError(e: unknown, stackLines = 6): string {
  if (e instanceof Error) {
    const stack = (e.stack ?? '').split('\n').slice(1, stackLines + 1).join('\n');
    return stack ? `${e.message}\n${stack}` : e.message;
  }
  return String(e);
}

/** The log as plain text, for sharing. */
export function logText(entries: LogEntry[]): string {
  return entries.map((e) => `${new Date(e.t).toISOString()} ${e.level.toUpperCase()} [${e.area}] ${e.msg}`).join('\n');
}

/**
 * The app's colors, built from the Odoo company's primary and secondary
 * colors, in light and dark mode. Whatever color the company has, it is
 * darkened or lightened just enough that text on it stays easy to read
 * (WCAG contrast 4.5:1 or more for buttons, 7:1 for the header), so a pale
 * brand color never makes white text unreadable.
 *
 * Kept free of React.
 */

export interface Palette {
  /** The page behind everything. */
  bg: string;
  /** Cards on the page. */
  card: string;
  text: string;
  /** Secondary text. */
  muted: string;
  /** Lines between rows and around fields. */
  line: string;
  /** The header band: the company color, made dark enough for white text. */
  head: string;
  onHead: string;
  /** Main buttons, chosen chips and links. */
  accent: string;
  onAccent: string;
  /** A soft tint of the accent: pressed rows, chip fills. */
  tint: string;
  /** The secondary brand color, for small marks only. */
  second: string;
  ok: string;
  warn: string;
  warnBg: string;
  stop: string;
  onStop: string;
}

/** A calm neutral used until Odoo gives the company's own color. */
export const DEFAULT_PRIMARY = '#7A4B2A';
export const DEFAULT_SECONDARY = '#C97A40';

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: Rgb) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

function lum([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio of two hex colors (1 to 21); 1 when either is not a color. */
export function contrast(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return 1;
  const [hi, lo] = lum(x) > lum(y) ? [lum(x), lum(y)] : [lum(y), lum(x)];
  return (hi + 0.05) / (lo + 0.05);
}

/** Moves a color toward black (dir -1) or white (dir 1) until it has `min` contrast against `against`. */
export function nudge(hex: string, against: string, min: number, dir: 1 | -1): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  let cur: Rgb = c;
  for (let i = 0; i < 60 && contrast(toHex(cur), against) < min; i++) {
    cur = cur.map((v) => (dir === 1 ? v + (255 - v) * 0.08 : v * 0.92)) as Rgb;
  }
  return toHex(cur);
}

const mix = (a: string, b: string, t: number) => {
  const x = hexToRgb(a) ?? [0, 0, 0];
  const y = hexToRgb(b) ?? [0, 0, 0];
  return toHex(x.map((v, i) => v * (1 - t) + y[i]! * t) as Rgb);
};

const WHITE = '#FFFFFF';
const INK = '#151210';

export function makePalette(primaryIn: string, secondaryIn: string, dark: boolean): Palette {
  const primary = hexToRgb(primaryIn) ? primaryIn.toUpperCase() : DEFAULT_PRIMARY;
  const secondary = hexToRgb(secondaryIn) ? secondaryIn.toUpperCase() : primary;
  const bg = dark ? mix('#0E0C0B', primary, 0.06) : mix('#F7F4F1', primary, 0.05);
  const card = dark ? mix('#1A1715', primary, 0.06) : WHITE;
  const text = dark ? '#F2EEEA' : INK;
  const muted = dark ? '#B9B1AA' : '#57504A';
  const line = dark ? mix(card, WHITE, 0.14) : mix(card, INK, 0.13);
  const head = nudge(primary, WHITE, 7, -1);
  const accent = dark ? nudge(primary, card, 4.5, 1) : nudge(primary, card, 4.5, -1);
  const onAccent = contrast(accent, WHITE) >= contrast(accent, INK) ? WHITE : INK;
  const tint = dark ? mix(card, accent, 0.22) : mix(card, accent, 0.12);
  const second = dark ? nudge(secondary, card, 3, 1) : nudge(secondary, card, 3, -1);
  return {
    bg,
    card,
    text,
    muted,
    line,
    head,
    onHead: WHITE,
    accent,
    onAccent,
    tint,
    second,
    ok: dark ? '#6CCB8F' : '#1E7A44',
    warn: dark ? '#F2B33D' : '#8A5300',
    warnBg: dark ? '#3A2C10' : '#FBEBCB',
    stop: dark ? '#FF8A94' : '#B00020',
    onStop: dark ? '#2A0008' : WHITE,
  };
}

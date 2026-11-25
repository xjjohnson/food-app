/**
 * The app's name, logo and colors, taken from the Odoo company (res.company)
 * of the signed-in person: its name, its logo, and the primary and secondary
 * colors set under Settings > Companies > Document Layout. Read-only: the app
 * never writes them. A copy is kept on the phone so the brand shows offline
 * and from the first frame on the next start.
 *
 * Kept free of React.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OdooClient } from './odoo';

type Caller = Pick<OdooClient, 'call' | 'session'>;

export const BRAND_KEY = 'brand/v1';
/** A logo bigger than this is not kept (it would slow every start for a picture). */
export const MAX_LOGO_CHARS = 700_000;

export interface Brand {
  /** The company name, '' until read from Odoo. */
  name: string;
  /** data: URL of the logo, or '' when Odoo has none or it is too big. */
  logo: string;
  /** #RRGGBB, or '' when Odoo has none we can use. */
  primary: string;
  secondary: string;
  fetchedAt: number;
}

export const NO_BRAND: Brand = { name: '', logo: '', primary: '', secondary: '', fetchedAt: 0 };

/** The name to show when Odoo hasn't given one yet. */
export const FALLBACK_NAME = 'Food app';

/** A valid #RRGGBB from whatever Odoo stores (it may hold #RGB, other text or nothing); '' when unusable. */
export function cleanColor(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.trim();
  if (/^#[0-9a-f]{3}$/i.test(t)) return ('#' + t.slice(1).split('').map((c) => c + c).join('')).toUpperCase();
  return /^#[0-9a-f]{6}$/i.test(t) ? t.toUpperCase() : '';
}

/** The image type from the first bytes of the base64 (Odoo gives bare base64). */
export function logoDataUrl(b64: unknown): string {
  if (typeof b64 !== 'string' || !b64 || b64.length > MAX_LOGO_CHARS) return '';
  const mime = b64.startsWith('iVBOR') ? 'image/png' : b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('UklGR') ? 'image/webp' : '';
  return mime ? `data:${mime};base64,${b64}` : '';
}

/** Reads the company's name, logo and colors from Odoo. Fields this Odoo doesn't have come back empty. */
export async function fetchBrand(c: Caller, now = Date.now()): Promise<Brand> {
  const id = c.session.companyId;
  if (!id) throw new Error('Odoo did not say which company this person belongs to.');
  let row: Record<string, unknown> | undefined;
  try {
    [row] = (await c.call('res.company', 'read', [[id]], { fields: ['name', 'logo_web', 'primary_color', 'secondary_color'] })) as Record<string, unknown>[];
  } catch {
    // An Odoo without the document layout colors: ask for the name and logo alone.
    [row] = (await c.call('res.company', 'read', [[id]], { fields: ['name', 'logo_web'] })) as Record<string, unknown>[];
  }
  return {
    name: typeof row?.name === 'string' ? row.name.trim() : '',
    logo: logoDataUrl(row?.logo_web),
    primary: cleanColor(row?.primary_color),
    secondary: cleanColor(row?.secondary_color),
    fetchedAt: now,
  };
}

export function parseBrand(raw: string | null): Brand {
  try {
    const d = raw ? (JSON.parse(raw) as Partial<Brand>) : {};
    return {
      name: typeof d.name === 'string' ? d.name : '',
      logo: typeof d.logo === 'string' && d.logo.startsWith('data:image/') ? d.logo : '',
      primary: cleanColor(d.primary),
      secondary: cleanColor(d.secondary),
      fetchedAt: Number(d.fetchedAt) || 0,
    };
  } catch {
    return NO_BRAND;
  }
}

export async function loadBrand(): Promise<Brand> {
  return parseBrand(await AsyncStorage.getItem(BRAND_KEY).catch(() => null));
}

export async function saveBrand(b: Brand): Promise<void> {
  await AsyncStorage.setItem(BRAND_KEY, JSON.stringify(b)).catch(() => undefined);
}

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Brand, FALLBACK_NAME, fetchBrand, loadBrand, NO_BRAND, saveBrand } from './brand';
import { log } from './log';
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY, makePalette, Palette } from './palette';
import { useOdooIfAny } from './useOdoo';

interface BrandApi {
  brand: Brand;
  /** The company name, or "Food app" until Odoo has given one. */
  name: string;
  colors: Palette;
  dark: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<BrandApi | null>(null);

/**
 * The company's name, logo and colors from Odoo. The saved copy shows first;
 * a fresh one is read after each sign-in. Read-only: nothing is written to Odoo.
 */
export function BrandProvider({ children, initial }: { children: ReactNode; initial?: Brand }) {
  const odoo = useOdooIfAny();
  const client = odoo?.client ?? null;
  const offline = odoo?.offline ?? false;
  const [brand, setBrand] = useState<Brand>(initial ?? NO_BRAND);
  const dark = useColorScheme() === 'dark';

  useEffect(() => {
    if (initial) return;
    let alive = true;
    loadBrand().then((b) => alive && b.fetchedAt && setBrand(b));
    return () => {
      alive = false;
    };
  }, [initial]);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const b = await fetchBrand(client);
      setBrand(b);
      await saveBrand(b);
    } catch (e) {
      log.warn('brand', `couldn't read the company brand: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [client]);

  useEffect(() => {
    if (client && !offline) refresh();
  }, [client, offline, refresh]);

  const colors = useMemo(() => makePalette(brand.primary || DEFAULT_PRIMARY, brand.secondary || DEFAULT_SECONDARY, dark), [brand.primary, brand.secondary, dark]);
  const api = useMemo(() => ({ brand, name: brand.name || FALLBACK_NAME, colors, dark, refresh }), [brand, colors, dark, refresh]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useBrand(): BrandApi {
  const api = useContext(Ctx);
  if (api) return api;
  // Outside a provider (single-component tests): the default look.
  return { brand: NO_BRAND, name: FALLBACK_NAME, colors: makePalette(DEFAULT_PRIMARY, DEFAULT_SECONDARY, false), dark: false, refresh: async () => undefined };
}

/** Colors for StyleSheets: `const s = useStyles(makeStyles)`. */
export function useStyles<T>(make: (c: Palette) => T): T {
  const { colors } = useBrand();
  return useMemo(() => make(colors), [colors, make]);
}

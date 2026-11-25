import { cleanColor, fetchBrand, logoDataUrl, parseBrand } from '../lib/brand';
import { OdooClient } from '../lib/odoo';
import { contrast, makePalette } from '../lib/palette';
import { bakery, URL } from '../testing/fakeOdoo';

describe('the company brand from Odoo', () => {
  test('reads the name, logo and colors of the person’s company, and writes nothing', async () => {
    const { odoo, baker } = bakery();
    const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: baker.login }, 'key');
    const b = await fetchBrand(c, 5);
    expect(b).toEqual({ name: 'Hivemind Bakery', logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', primary: '#C2185B', secondary: '#FFC107', fetchedAt: 5 });
    expect(odoo.calls.filter((x) => x.method === 'write' || x.method === 'create')).toEqual([]);
  });

  test('odd values from Odoo are dropped, not shown', () => {
    expect(cleanColor('#abc')).toBe('#AABBCC');
    expect(cleanColor('red')).toBe('');
    expect(cleanColor(false)).toBe('');
    expect(logoDataUrl(false)).toBe('');
    expect(logoDataUrl('PHN2Zz4=')).toBe('');
    expect(parseBrand('{"name":"X","logo":"javascript:alert(1)","primary":"#123456"}')).toMatchObject({ name: 'X', logo: '', primary: '#123456' });
    expect(parseBrand('not json').name).toBe('');
  });

  test.each([
    ['pale yellow', '#FFF59D'],
    ['bright pink', '#C2185B'],
    ['near black', '#111111'],
    ['white', '#FFFFFF'],
  ])('any company color stays readable (%s)', (_name, color) => {
    for (const dark of [false, true]) {
      const p = makePalette(color, color, dark);
      expect(contrast(p.head, p.onHead)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.accent, p.onAccent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accent, p.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.text, p.card)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.muted, p.card)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

import { checkInChanges, checkOutChanges, isMarket } from '../lib/marketStock';
import type { PlaceStock } from '../lib/places';

const q = (placeId: number, productId: number, lotId: number, qty: number): PlaceStock => ({ placeId, place: `P${placeId}`, productId, product: `Prod${productId}`, lotId, lot: `L${lotId}`, qty });
const market = { id: 9, name: 'WH/Market' };

describe('market stock transfers', () => {
  test('knows the Market place by name', () => {
    expect(isMarket({ name: 'WH/Market' })).toBe(true);
    expect(isMarket({ name: 'Market' })).toBe(true);
    expect(isMarket({ name: 'WH/Farmers Market bin' })).toBe(false);
  });

  test('check out takes from the biggest batch first and reports a shortage', () => {
    const main = [q(1, 5, 11, 4), q(1, 5, 12, 10), q(1, 6, 13, 2)];
    const { changes, short } = checkOutChanges([{ productId: 5, qty: 12 }, { productId: 6, qty: 5 }], main, market);
    const steps = changes.map((c) => c.step as { kind: string; lotId: number; qty: number; toId: number });
    expect(steps.map((s) => [s.lotId, s.qty])).toEqual([[12, 10], [11, 2], [13, 2]]);
    expect(steps.every((s) => s.kind === 'move' && s.toId === 9)).toBe(true);
    expect(short).toEqual([{ productId: 6, missing: 3 }]);
  });

  test('check in moves what came back from Market to where the product lives', () => {
    const inMarket = [q(9, 5, 12, 6)];
    const main = [q(1, 5, 11, 4)];
    const changes = checkInChanges([{ productId: 5, qty: 4 }], inMarket, main, null);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.step).toMatchObject({ kind: 'move', fromId: 9, toId: 1, qty: 4, lotId: 12 });
  });
});

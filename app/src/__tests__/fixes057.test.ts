import { PRODUCT_SECTIONS } from '../lib/productForm';

describe('shop switches live on the product', () => {
  test('the Online tab starts with Published on the website and Sell when out of stock', () => {
    const online = PRODUCT_SECTIONS.find((t: { id: string }) => t.id === 'online')!;
    expect(online.fields.slice(0, 2).map((f: { name: string }) => f.name)).toEqual(['is_published', 'allow_out_of_stock_order']);
  });
});

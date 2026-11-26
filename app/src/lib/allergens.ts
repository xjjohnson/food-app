/**
 * Allergens, rolled up from the ingredients. An allergen is a product tag in Odoo that
 * starts with "Contains" (for example "Contains milk"), put on the ingredient on its
 * product screen. A recipe or batch shows the tags of all its ingredients together.
 * Reads only.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export const isAllergenTag = (name: string) => /^contains\b/i.test(name.trim());

export async function loadAllergens(c: Client, productIds: number[]): Promise<string[]> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return [];
  const rows = (await c.call('product.product', 'read', [ids], { fields: ['product_tag_ids'] })) as { product_tag_ids?: number[] }[];
  const tagIds = [...new Set(rows.flatMap((r) => r.product_tag_ids ?? []))];
  if (!tagIds.length) return [];
  const tags = (await c.call('product.tag', 'read', [tagIds], { fields: ['name'] })) as { name: string }[];
  return tags.map((t) => String(t.name)).filter(isAllergenTag).sort();
}

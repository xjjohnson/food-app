import { useEffect, useState } from 'react';
import { Body, Card, Row } from '../components/ui';
import { m2oId } from '../lib/odoo';
import { loadLots, loadVariants, PRODUCT_SECTIONS, type LotRow, type VariantRow } from '../lib/productForm';
import { useOdoo } from '../lib/useOdoo';
import { GenericForm } from './GenericForm';

/**
 * Add a product, or change one, with the fields of Odoo's product form in
 * tabs (Main, Stock, Online, Point of Sale) and a look at its variants and
 * batches. Track Inventory, batch tracking and expiry are switches the
 * person flips here; the app never flips them by itself.
 */
export function ProductForm({ productId, templateId, onBack }: { productId?: number; templateId?: number; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [tmplId, setTmplId] = useState<number | null>(templateId ?? (productId ? null : 0));
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);

  useEffect(() => {
    if ((!productId && !templateId) || !client || offline) return;
    (async () => {
      let t = templateId ?? 0;
      if (!t) {
        const [p] = (await client.call('product.product', 'read', [[productId!]], { fields: ['product_tmpl_id'] })) as Record<string, unknown>[];
        t = m2oId(p?.product_tmpl_id);
      }
      setTmplId(t);
      const vs = await loadVariants(client, t);
      setVariants(vs);
      setLots(await loadLots(client, vs.map((v) => v.id)));
    })().catch(() => setTmplId(0));
  }, [client, offline, productId, templateId]);

  if ((productId || templateId) && tmplId === null) return <Body muted>Opening the product…</Body>;
  return (
    <GenericForm
      model="product.template"
      recordId={productId || templateId ? tmplId || null : null}
      title="Product"
      noun="Product"
      sections={PRODUCT_SECTIONS}
      required={['name']}
      defaults={{ sale_ok: true }}
      onBack={onBack}
      testID="product-form"
      extraTabs={[
        {
          id: 'batches',
          label: 'Batches',
          render: () => (
            <>
              <Card title="Variants">
                {variants.map((v) => (
                  <Row key={v.id} title={v.name} testID={`variant-${v.id}`} />
                ))}
                {!variants.length ? <Body muted>None.</Body> : null}
              </Card>
              <Card title="Batches">
                {lots.map((l) => (
                  <Row key={l.id} title={l.name} detail={`${l.product}. Expires ${l.expiration || 'not set'}. Off the shelf ${l.removal || 'not set'}.`} testID={`lot-${l.id}`} />
                ))}
                {!lots.length ? <Body muted>No batches yet.</Body> : null}
                <Body muted>Change a batch from Stock, Find a batch.</Body>
              </Card>
            </>
          ),
        },
      ]}
    />
  );
}

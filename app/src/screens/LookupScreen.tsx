import { useInnerBack } from '../lib/innerBack';
import { ScanButton } from './BuyingPages';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Row, Screen } from '../components/ui';
import { currencySymbol, lookupGroups, ProductGroup, stockByBatchOf } from '../lib/lookup';
import type { LotStock } from '../lib/orders';
import { fmtQty } from '../lib/production';
import { useOdoo } from '../lib/useOdoo';
import { ProductForm } from './ProductForm';

/** Product lookup: price, photo and stock by batch, from Odoo. */
export function LookupScreen() {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [items, setItems] = useState<ProductGroup[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [batches, setBatches] = useState<LotStock[] | null>(null);
  const [symbol, setSymbol] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<{ id?: number } | null>(null);
  const [tick, setTick] = useState(0);
  useInnerBack(form ? () => { setForm(null); setTick((n) => n + 1); } : null);

  useEffect(() => {
    if (client && !offline) currencySymbol(client, client.session.companyId).then(setSymbol);
  }, [client, offline]);

  useEffect(() => {
    if (!client || offline) return;
    const t = setTimeout(() => {
      lookupGroups(client, text)
        .then(setItems)
        .catch((e) => setError(`Couldn’t read products from Odoo. ${e instanceof Error ? e.message : String(e)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, tick]);

  const show = async (p: ProductGroup) => {
    if (open === p.id) return setOpen(null);
    setOpen(p.id);
    setBatches(null);
    if (client) setBatches(await stockByBatchOf(client, p.id).catch(() => []));
  };

  if (form)
    return (
      <ProductForm
        templateId={form.id}
        onBack={() => {
          setForm(null);
          setTick((n) => n + 1);
        }}
      />
    );

  return (
    <Screen title="Find a product" testID="lookup-screen">
      {offline ? <Body muted>No signal. Product details come from Odoo, so they show when the phone is back online.</Body> : <Field label="Product" value={text} onChangeText={setText} testID="lookup-text" />}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!offline ? <ScanButton onMatch={(m) => setText(m.kind === 'product' ? m.name : m.product)} /> : null}
      <Button label="Add a product" kind="plain" onPress={() => setForm({})} testID="add-product" />
      {items.map((p) => (
        <Card key={p.id} testID={`product-${p.id}`}>
          <Row title={p.name} detail={`${fmtQty(p.onHand)} in stock${p.variants > 1 ? ` · ${p.variants} variants` : ''}`} value={p.price === null ? '' : `${symbol}${p.price.toFixed(2)}`} onPress={() => show(p)} testID={`open-product-${p.id}`} />
          {open === p.id ? (
            <>
              <Button label="Open and change this product" kind="plain" onPress={() => setForm({ id: p.id })} testID={`edit-product-${p.id}`} />
              {p.photo ? <Image source={{ uri: `data:image/png;base64,${p.photo}` }} style={{ width: 128, height: 128, borderRadius: 8 }} accessibilityLabel={`Photo of ${p.name}`} /> : null}
              {batches && !batches.length ? <Body muted>No batch numbers on the shelves for this product.</Body> : null}
              {batches?.map((b) => (
                <Row key={b.lotId} title={`Batch ${b.lot}`} detail={b.useBy ? `Use by ${b.useBy}` : 'No use-by date'} value={fmtQty(b.qty)} testID={`batch-line-${b.lotId}`} />
              ))}
            </>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

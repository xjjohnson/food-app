import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { Body, Card, ErrorText, Field, Row, Screen } from '../components/ui';
import { currencySymbol, lookupProducts, ProductCard, stockByBatch } from '../lib/lookup';
import type { LotStock } from '../lib/orders';
import { fmtQty } from '../lib/production';
import { useOdoo } from '../lib/useOdoo';

/** Product lookup: price, photo and stock by batch, from Odoo. */
export function LookupScreen() {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [items, setItems] = useState<ProductCard[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [batches, setBatches] = useState<LotStock[] | null>(null);
  const [symbol, setSymbol] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (client && !offline) currencySymbol(client, client.session.companyId).then(setSymbol);
  }, [client, offline]);

  useEffect(() => {
    if (!client || offline) return;
    const t = setTimeout(() => {
      lookupProducts(client, text)
        .then(setItems)
        .catch((e) => setError(`Couldn’t read products from Odoo. ${e instanceof Error ? e.message : String(e)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text]);

  const show = async (p: ProductCard) => {
    if (open === p.id) return setOpen(null);
    setOpen(p.id);
    setBatches(null);
    if (client) setBatches(await stockByBatch(client, p.id).catch(() => []));
  };

  return (
    <Screen title="Find a product" testID="lookup-screen">
      {offline ? <Body muted>No signal. Product details come from Odoo, so they show when the phone is back online.</Body> : <Field label="Product" value={text} onChangeText={setText} testID="lookup-text" />}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items.map((p) => (
        <Card key={p.id} testID={`product-${p.id}`}>
          <Row title={p.name} detail={`${fmtQty(p.onHand)} in stock`} value={p.price === null ? '' : `${symbol}${p.price.toFixed(2)}`} onPress={() => show(p)} />
          {open === p.id ? (
            <>
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

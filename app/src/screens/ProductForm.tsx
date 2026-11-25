import { useEffect, useState } from 'react';
import { Body, Button, ErrorText, Field, Screen } from '../components/ui';
import { editProductChange, hasShelfLifeField, loadProductDetail, newProductChange, ProductDetail } from '../lib/edit';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toNum = (t: string) => Number(t.replace(',', '.'));

/** Add a product, or change one: its name, price and shelf life, as Odoo has them. */
export function ProductForm({ productId, onBack }: { productId?: number; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [p, setP] = useState<ProductDetail | null>(null);
  const [hasShelf, setHasShelf] = useState(true);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client || offline) return;
    (async () => {
      try {
        if (productId) {
          const d = await loadProductDetail(client, productId);
          if (d) {
            setP(d);
            setHasShelf(d.hasShelfLife);
            setName(d.name);
            setPrice(String(d.price));
            setDays(d.shelfLife ? String(d.shelfLife) : '');
          }
        } else setHasShelf(await hasShelfLifeField(client));
      } catch (e) {
        setError(`Couldn’t read the product. ${why(e)}`);
      }
    })();
  }, [client, offline, productId]);

  const okPrice = price.trim() !== '' && Number.isFinite(toNum(price)) && toNum(price) >= 0;
  const okDays = days.trim() === '' || (Number.isInteger(toNum(days)) && toNum(days) > 0);
  const ready = name.trim().length > 0 && okPrice && okDays && !note && (!productId || !!p);
  return (
    <Screen title={productId ? 'Change product' : 'New product'} testID="product-form">
      {offline && !productId ? <Body muted>No signal. You can save it now and it goes to Odoo when signal is back.</Body> : null}
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" testID="product-name" />
      <Field label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" testID="product-price" />
      {hasShelf ? <Field label="Shelf life in days (optional)" value={days} onChangeText={setDays} keyboardType="number-pad" testID="product-days" /> : <Body muted>Shelf life isn’t available in this Odoo, so use-by dates are typed each time.</Body>}
      {price !== '' && !okPrice ? <ErrorText>Type the price as a number, like 8.50.</ErrorText> : null}
      {days !== '' && !okDays ? <ErrorText>Use a whole number of days.</ErrorText> : null}
      {!productId ? <Body muted>To count stock for a new product, switch on Track Inventory on it in Odoo. The app doesn’t change that.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Save"
        disabled={!ready}
        busy={busy}
        testID="save-product"
        onPress={async () => {
          setBusy(true);
          setError('');
          const v = { name, price: toNum(price), shelfLife: days.trim() ? toNum(days) : null };
          try {
            const r = await save(p ? editProductChange(p, v) : newProductChange(v, hasShelf));
            setNote(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
            setTimeout(onBack, 1000);
          } catch (e) {
            setError(`Odoo said no: ${why(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { Body, Card, ErrorText, Field, Row, Screen } from '../components/ui';
import { useInnerBack } from '../lib/innerBack';
import { Hit, searchAll } from '../lib/searchAll';
import { CONTACT_SECTIONS } from '../lib/forms';
import { useOdoo } from '../lib/useOdoo';
import { GenericForm } from './GenericForm';
import { ProductForm } from './ProductForm';

const KINDS: Hit['kind'][] = ['Product', 'Contact', 'Batch number', 'Order', 'Batch being made'];

/** One box that finds products, customers, batch numbers and orders. Products and contacts open to change. */
export function SearchScreen() {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState<Hit | null>(null);
  const [error, setError] = useState('');
  useInnerBack(open ? () => setOpen(null) : null);

  useEffect(() => {
    if (!client || offline) return;
    const t = setTimeout(() => {
      searchAll(client, text)
        .then(setHits)
        .catch((e) => setError(`Couldn’t search Odoo. ${e instanceof Error ? e.message : String(e)}`));
    }, 300);
    return () => clearTimeout(t);
  }, [client, offline, text]);

  if (open?.kind === 'Contact')
    return <GenericForm model="res.partner" recordId={open.id} title="Contact" noun="Contact" sections={CONTACT_SECTIONS} required={['name']} testID="search-contact" onBack={() => setOpen(null)} />;
  if (open?.kind === 'Product') return <ProductForm templateId={open.id} onBack={() => setOpen(null)} />;

  return (
    <Screen title="Search everything" testID="search-screen">
      {offline ? <Body muted>No signal. Search reads Odoo, so it works when the phone is back online.</Body> : <Field label="Type a name, number or phone" value={text} onChangeText={setText} testID="search-box" />}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {text.trim().length >= 2 && !hits.length && !offline ? <Body muted>Nothing found.</Body> : null}
      {KINDS.map((k) => {
        const list = hits.filter((h) => h.kind === k);
        return list.length ? (
          <Card key={k} title={k === 'Contact' ? 'Customers and suppliers' : k === 'Product' ? 'Products' : k === 'Order' ? 'Orders' : k === 'Batch number' ? 'Batch numbers' : 'Batches being made'}>
            {list.map((h) => (
              <Row key={`${h.kind}-${h.id}`} title={h.title} detail={h.detail} onPress={h.kind === 'Contact' || h.kind === 'Product' ? () => setOpen(h) : undefined} testID={`hit-${h.kind}-${h.id}`} />
            ))}
          </Card>
        ) : null;
      })}
    </Screen>
  );
}

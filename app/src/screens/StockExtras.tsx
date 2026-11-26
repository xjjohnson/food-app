import { useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen, SwitchRow } from '../components/ui';
import { loadSettings, settingChange } from '../lib/appSettings';
import { useInnerBack } from '../lib/innerBack';
import { fmtQty } from '../lib/production';
import { loadPlaces, loadPlaceStock, moveChange, Place, PlaceStock, placesOn } from '../lib/places';
import { CountLine, loadCountLines, loadWasteReasons, ProductRow, searchProducts, wasteChange, WasteReason } from '../lib/stock';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toNum = (t: string) => Number(t.replace(',', '.'));

function useProductSearch(active: boolean) {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [found, setFound] = useState<ProductRow[]>([]);
  useEffect(() => {
    if (!client || offline || !active) return;
    const t = setTimeout(() => searchProducts(client, text).then(setFound).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [client, offline, active, text]);
  return { text, setText, found };
}

/** Waste and spoilage: take some of a product (and batch) off the stock, with a reason. */
export function WastePage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [lines, setLines] = useState<CountLine[]>([]);
  const [lot, setLot] = useState<CountLine | null>(null);
  const [qty, setQty] = useState('');
  const [reasons, setReasons] = useState<WasteReason[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { text, setText, found } = useProductSearch(!product);
  useInnerBack(product ? () => setProduct(null) : null);

  const open = async (p: ProductRow) => {
    if (!client) return;
    try {
      setLines((await loadCountLines(client, p.id)).filter((l) => l.onHand > 0));
      setReasons(await loadWasteReasons(client));
      setLot(null);
      setQty('');
      setPicked([]);
      setNote('');
      setProduct(p);
    } catch (e) {
      setError(`Couldn’t read the stock from Odoo. ${why(e)}`);
    }
  };

  if (!product)
    return (
      <Screen title="Waste and spoilage" testID="waste-screen">
        {offline ? <Body muted>No signal. Pick the product when the phone is back online.</Body> : <Field label="Find a product" value={text} onChangeText={setText} testID="waste-search" />}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {found.map((p) => (
          <Row key={p.id} title={p.name} onPress={() => open(p)} testID={`waste-product-${p.id}`} />
        ))}
        <Button label="Back" kind="plain" onPress={onBack} />
      </Screen>
    );

  const n = toNum(qty);
  const max = lot?.onHand ?? lines.reduce((a, l) => a + l.onHand, 0);
  const ok = n > 0 && n <= max;
  return (
    <Screen title={product.name} testID="waste-form">
      <Card title="Which batch">
        {lines.map((l) => (
          <Row key={l.quantId} title={l.lot ? `Batch ${l.lot}` : 'No batch number'} detail={l.place} value={fmtQty(l.onHand)} onPress={() => setLot(l)} testID={`waste-lot-${l.quantId}`} />
        ))}
        {lot ? <Body>{`Chosen: ${lot.lot ? `batch ${lot.lot}` : 'no batch number'}`}</Body> : <Body muted>Tap a line, or leave it for stock with no batch.</Body>}
      </Card>
      <Field label="How many thrown out" value={qty} onChangeText={setQty} keyboardType="decimal-pad" testID="waste-qty" />
      {n > max ? <ErrorText>That is more than is on hand.</ErrorText> : null}
      {reasons.length ? (
        <Card title="Why">
          {reasons.map((r) => (
            <SwitchRow key={r.id} title={r.name} value={picked.includes(r.id)} onChange={(v) => setPicked(v ? [...picked, r.id] : picked.filter((x) => x !== r.id))} testID={`waste-reason-${r.id}`} />
          ))}
        </Card>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Take it off the stock"
        disabled={!ok || !!note}
        busy={busy}
        testID="waste-save"
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            const out = await save(wasteChange(product.name, product.id, lot?.lotId ?? 0, n, picked));
            setNote(out.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Done. It is off the stock in Odoo.');
            setTimeout(() => setProduct(null), 1200);
          } catch (e) {
            setError(`Odoo would not take that. ${why(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button label="Back" kind="plain" onPress={() => setProduct(null)} />
    </Screen>
  );
}

/** Places (pantry, freezer, market bin): what is where, and moving stock between places. */
export function PlacesPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [on, setOn] = useState<boolean | null>(null);
  const [stock, setStock] = useState<PlaceStock[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [moving, setMoving] = useState<PlaceStock | null>(null);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useInnerBack(moving ? () => setMoving(null) : null);

  useEffect(() => {
    if (!client || offline) return;
    (async () => {
      const enabled = await placesOn(client);
      setOn(enabled);
      if (enabled) {
        setStock(await loadPlaceStock(client));
        setPlaces(await loadPlaces(client));
      }
    })().catch((e) => setError(`Couldn’t read places from Odoo. ${why(e)}`));
  }, [client, offline, note]);

  if (moving) {
    const n = toNum(qty);
    return (
      <Screen title={`Move ${moving.product}`} testID="move-screen">
        <Body muted>{`From ${moving.place}${moving.lot ? `, batch ${moving.lot}` : ''}. ${fmtQty(moving.qty)} there.`}</Body>
        <Field label="How many to move" value={qty} onChangeText={setQty} keyboardType="decimal-pad" testID="move-qty" />
        {error ? <ErrorText>{error}</ErrorText> : null}
        {note ? <Body>{note}</Body> : null}
        <Card title="Move to">
          {places.filter((p) => p.id !== moving.placeId).map((p) => (
            <Button
              key={p.id}
              label={p.name}
              disabled={!(n > 0 && n <= moving.qty) || !!note}
              testID={`move-to-${p.id}`}
              onPress={async () => {
                setError('');
                try {
                  const out = await save(moveChange(moving, p, n));
                  setNote(out.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Moved in Odoo.');
                  setTimeout(() => {
                    setMoving(null);
                    setQty('');
                  }, 1200);
                } catch (e) {
                  setError(`Odoo would not take that. ${why(e)}`);
                }
              }}
            />
          ))}
        </Card>
        <Button label="Back" kind="plain" onPress={() => setMoving(null)} />
      </Screen>
    );
  }

  return (
    <Screen title="Places" testID="places-screen">
      {offline ? <Body muted>No signal. This comes from Odoo, so it shows when the phone is back online.</Body> : null}
      {on === false ? <Body>Odoo is not set up with storage places. The owner can turn on Storage Locations in Odoo Inventory settings, then add places like Pantry, Freezer and Market bin.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {[...new Set(stock.map((s) => s.place))].map((place) => (
        <Card key={place} title={place}>
          {stock.filter((s) => s.place === place).map((s, i) => (
            <Row key={i} title={s.product} detail={s.lot ? `Batch ${s.lot}` : undefined} value={fmtQty(s.qty)} onPress={() => setMoving(s)} testID={`place-line-${s.placeId}-${s.productId}-${s.lotId}`} />
          ))}
        </Card>
      ))}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/** Unit helper: a typed match (1 cup of flour is 120 g) shown beside Odoo's unit. Nothing is converted in Odoo. */
export function UnitHelperPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [from, setFrom] = useState('cup');
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('g');
  const [typed, setTyped] = useState('1');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const { text, setText, found } = useProductSearch(!product);
  useInnerBack(product ? () => setProduct(null) : null);

  const open = async (p: ProductRow) => {
    setProduct(p);
    setNote('');
    if (!client) return;
    const s = (await loadSettings(client))[`unit.${p.id}`];
    const [f, a, t] = (s ?? '').split('|');
    if (f && a && t) {
      setFrom(f);
      setAmount(a);
      setTo(t);
    }
  };

  if (!product)
    return (
      <Screen title="Unit helper" testID="units-screen">
        <Body muted>Cups, ounces and pounds beside Odoo’s own unit. Type a match once for an ingredient.</Body>
        {offline ? <Body muted>No signal. Pick the ingredient when the phone is back online.</Body> : <Field label="Find an ingredient" value={text} onChangeText={setText} testID="units-search" />}
        {found.map((p) => (
          <Row key={p.id} title={p.name} onPress={() => open(p)} testID={`units-product-${p.id}`} />
        ))}
        <Button label="Back" kind="plain" onPress={onBack} />
      </Screen>
    );

  const factor = toNum(amount);
  return (
    <Screen title={product.name} testID="units-form">
      <Body>{`1 `}</Body>
      <Field label="Unit (for example cup)" value={from} onChangeText={setFrom} testID="units-from" />
      <Field label="is how much" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" testID="units-amount" />
      <Field label="in this unit (for example g)" value={to} onChangeText={setTo} testID="units-to" />
      <Field label={`How many ${from || 'units'}`} value={typed} onChangeText={setTyped} keyboardType="decimal-pad" testID="units-typed" />
      {factor > 0 && toNum(typed) > 0 ? <Body>{`${fmtQty(toNum(typed))} ${from} = ${fmtQty(toNum(typed) * factor)} ${to}`}</Body> : null}
      <Body muted>This is only a helper. Odoo keeps its own unit; nothing here changes it.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Remember this match"
        disabled={!(factor > 0) || !from.trim() || !to.trim() || /[|\n=]/.test(`${from}${to}`)}
        testID="units-save"
        onPress={async () => {
          try {
            const out = await save(settingChange(`unit.${product.id}`, `${from.trim()}|${amount.trim()}|${to.trim()}`));
            setNote(out.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
          } catch (e) {
            setError(`Odoo would not take that. ${why(e)}`);
          }
        }}
      />
      <Button label="Back" kind="plain" onPress={() => setProduct(null)} />
    </Screen>
  );
}

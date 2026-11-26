import { useInnerBack } from '../lib/innerBack';
import { labelText } from '../lib/buying';
import { ScanButton } from './BuyingPages';
import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Row, Screen, Segments } from '../components/ui';
import { editLotChange } from '../lib/edit';
import { LOT_SECTIONS } from '../lib/forms';
import { fmtQty, isDate } from '../lib/production';
import type { LotStock } from '../lib/orders';
import { stockByBatch } from '../lib/lookup';
import { InStockRow, loadInStock, StockKind, BatchTrace, CountLine, countChange, ExpiringLot, findLots, loadCountLines, loadExpiring, ProductRow, searchProducts, throwOutChange, traceLot } from '../lib/stock';
import { loadSettings, useByDays } from '../lib/appSettings';
import { Recall, recallLot, recallText } from '../lib/recall';
import { PhotosCard } from './PhotosCard';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { GenericForm } from './GenericForm';
import { PlacesPage, UnitHelperPage, WastePage } from './StockExtras';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Page = 'menu' | 'have' | 'count' | 'expiring' | 'find' | 'waste' | 'places' | 'units';

/** Stock: counts, expiring soon, and finding a batch. */
export function StockScreen() {
  const [page, setPage] = useState<Page>('menu');
  const back = () => setPage('menu');
  useInnerBack(page === 'menu' ? null : back);
  if (page === 'have') return <InStock onBack={back} />;
  if (page === 'count') return <CountStock onBack={back} />;
  if (page === 'expiring') return <Expiring onBack={back} />;
  if (page === 'find') return <FindBatch onBack={back} />;
  if (page === 'waste') return <WastePage onBack={back} />;
  if (page === 'places') return <PlacesPage onBack={back} />;
  if (page === 'units') return <UnitHelperPage onBack={back} />;
  return (
    <Screen title="Stock" testID="stock-screen">
      <Row title="What’s in stock" detail="Everything on the shelves, with how much and which batches" onPress={() => setPage('have')} testID="stock-have" />
      <Row title="Count stock" detail="Walk the shelves and type what is there" onPress={() => setPage('count')} testID="stock-count" />
      <Row title="Expiring soon" detail="Batches close to their use-by date" onPress={() => setPage('expiring')} testID="stock-expiring" />
      <Row title="Waste and spoilage" detail="Take spoiled or dropped stock off, with a reason" onPress={() => setPage('waste')} testID="stock-waste" />
      <Row title="Places" detail="What is in the pantry, freezer or market bin, and moving it" onPress={() => setPage('places')} testID="stock-places" />
      <Row title="Unit helper" detail="Cups, ounces and pounds beside Odoo’s unit" onPress={() => setPage('units')} testID="stock-units" />
      <Row title="Find a batch" detail="Where a batch came from and where it went" onPress={() => setPage('find')} testID="stock-find" />
    </Screen>
  );
}

const KINDS: { id: StockKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'made', label: 'Made' },
  { id: 'raw', label: 'Ingredients' },
];

/** What is available: each counted product with how much there is, and its batches when tapped. */
function InStock({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<StockKind>('all');
  const [rows, setRows] = useState<InStockRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [batches, setBatches] = useState<LotStock[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!client || offline) return;
    const t = setTimeout(() => {
      loadInStock(client, text, kind)
        .then(setRows)
        .catch((e) => setError(`Couldn’t read stock from Odoo. ${why(e)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, kind]);

  const show = async (r: InStockRow) => {
    if (open === r.id) return setOpen(null);
    setOpen(r.id);
    setBatches(null);
    if (client) setBatches(await stockByBatch(client, r.id).catch(() => []));
  };

  return (
    <Screen title="What’s in stock" testID="have-screen">
      {offline ? <NeedsSignal onBack={onBack} /> : <Field label="Find a product" value={text} onChangeText={setText} testID="have-search" />}
      <Segments options={KINDS} value={kind} onChange={setKind} testID="have-kind" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows?.map((r) => (
        <Card key={r.id} testID={`have-${r.id}`}>
          <Row title={r.name} detail={r.onHand <= 0 ? 'None on hand' : `${fmtQty(r.free)} ${r.unit} free after orders`.trim()} value={`${fmtQty(r.onHand)} ${r.unit}`.trim()} onPress={() => show(r)} testID={`have-row-${r.id}`} />
          {open === r.id ? (
            <>
              {batches && !batches.length ? <Body muted>No batch numbers on the shelves for this product.</Body> : null}
              {batches?.map((b) => (
                <Row key={b.lotId} title={`Batch ${b.lot}`} detail={b.useBy ? `Use by ${b.useBy}` : 'No use-by date'} value={`${fmtQty(b.qty)} ${r.unit}`.trim()} testID={`have-batch-${b.lotId}`} />
              ))}
            </>
          ) : null}
        </Card>
      ))}
      {rows && !rows.length ? <Body muted>Nothing found.</Body> : null}
      {!offline ? <Button label="Back" kind="plain" onPress={onBack} /> : null}
    </Screen>
  );
}

function NeedsSignal({ onBack }: { onBack: () => void }) {
  return (
    <>
      <Body muted>No signal. This list comes from Odoo, so it shows when the phone is back online.</Body>
      <Button label="Back" kind="plain" onPress={onBack} />
    </>
  );
}

function CountStock({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [text, setText] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [lines, setLines] = useState<CountLine[]>([]);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useInnerBack(product ? () => setProduct(null) : null);

  useEffect(() => {
    if (!client || offline || product) return;
    const t = setTimeout(async () => {
      try {
        setProducts(await searchProducts(client, text));
      } catch (e) {
        setError(`Couldn’t read products from Odoo. ${why(e)}`);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, product]);

  const open = async (p: ProductRow) => {
    if (!client) return;
    setError('');
    try {
      setLines(await loadCountLines(client, p.id));
      setTyped({});
      setProduct(p);
    } catch (e) {
      setError(`Couldn’t read the stock from Odoo. ${why(e)}`);
    }
  };

  const changed = lines.filter((l) => typed[l.quantId] !== undefined && typed[l.quantId] !== '' && Number(typed[l.quantId]!.replace(',', '.')) !== l.onHand && Number.isFinite(Number(typed[l.quantId]!.replace(',', '.'))));

  if (!product)
    return (
      <Screen title="Count stock" testID="count-screen">
        {offline ? <NeedsSignal onBack={onBack} /> : null}
        {!offline ? <Field label="Find a product" value={text} onChangeText={setText} testID="count-search" /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {products.map((p) => (
          <Row key={p.id} title={p.name} onPress={() => open(p)} testID={`count-product-${p.id}`} />
        ))}
        {!offline ? <Button label="Back" kind="plain" onPress={onBack} /> : null}
      </Screen>
    );

  return (
    <Screen title={product.name} testID="count-lines-screen">
      <Body>Type what you counted. Leave a line empty if it is right.</Body>
      {!lines.length ? <Body muted>Odoo has none of this on the shelves. Receive it in Odoo first, then count.</Body> : null}
      {lines.map((l) => (
        <Card key={l.quantId}>
          <Row title={l.lot ? `Batch ${l.lot}` : 'No batch number'} detail={l.place} value={`Odoo: ${fmtQty(l.onHand)}`} />
          <Field label="Counted" value={typed[l.quantId] ?? ''} onChangeText={(v) => setTyped({ ...typed, [l.quantId]: v })} keyboardType="decimal-pad" testID={`counted-${l.quantId}`} />
        </Card>
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label={changed.length ? `Save ${changed.length} count${changed.length > 1 ? 's' : ''}` : 'Nothing changed'}
        disabled={!changed.length || !!note}
        busy={busy}
        testID="save-counts"
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            let queued = false;
            for (const l of changed) if ((await save(countChange(product.name, l, Number(typed[l.quantId]!.replace(',', '.'))))).status === 'queued') queued = true;
            setNote(queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Counts saved in Odoo.');
            setTimeout(() => setProduct(null), 1200);
          } catch (e) {
            setError(`Odoo said no: ${why(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button label="Back to products" kind="plain" onPress={() => setProduct(null)} />
    </Screen>
  );
}

type Window = '7' | '14' | '30';

function Expiring({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [win, setWin] = useState<Window>('14');
  useEffect(() => {
    if (!client || offline) return;
    loadSettings(client).then((st) => {
      const d = String(useByDays(st));
      if (d === '7' || d === '14' || d === '30') setWin(d);
    });
  }, [client, offline]);
  const [list, setList] = useState<ExpiringLot[] | null>(null);
  const [sure, setSure] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!client || offline) return;
    loadExpiring(client, Number(win))
      .then(setList)
      .catch((e) => setError(`Couldn’t read batches from Odoo. ${why(e)}`));
  }, [client, offline, win, tick]);

  return (
    <Screen title="Expiring soon" testID="expiring-screen">
      <Segments<Window> options={[{ id: '7', label: '7 days' }, { id: '14', label: '14 days' }, { id: '30', label: '30 days' }]} value={win} onChange={setWin} testID="expiring-window" />
      {offline ? <NeedsSignal onBack={onBack} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {list && !list.length ? <Body muted>Nothing close to its use-by date.</Body> : null}
      {list?.map((l) => (
        <Card key={l.id} testID={`exp-${l.id}`}>
          <Row title={`${fmtQty(l.qty)} ${l.product}`} detail={`Batch ${l.lot} · use by ${l.useBy}`} value={l.days < 0 ? 'Past' : l.days === 0 ? 'Today' : `${l.days} d`} />
          {sure === l.id ? (
            <>
              <Body>Throw out all {fmtQty(l.qty)}? This takes it off the stock in Odoo.</Body>
              <Button
                label="Yes, throw it out"
                kind="danger"
                testID={`confirm-throw-${l.id}`}
                onPress={async () => {
                  try {
                    await save(throwOutChange(l));
                    setSure(null);
                    setTick((t) => t + 1);
                  } catch (e) {
                    setError(`Odoo said no: ${why(e)}`);
                  }
                }}
              />
              <Button label="Keep it" kind="plain" onPress={() => setSure(null)} />
            </>
          ) : (
            <Button label="Throw out" kind="plain" onPress={() => setSure(l.id)} testID={`throw-${l.id}`} />
          )}
        </Card>
      ))}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function FindBatch({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ id: number; name: string; product: string }[]>([]);
  const [trace, setTrace] = useState<BatchTrace | null>(null);
  const [recall, setRecall] = useState<Recall | null>(null);
  const [error, setError] = useState('');
  const { save } = useQueue();
  const [edit, setEdit] = useState<{ name: string; useBy: string } | null>(null);
  const [note, setNote] = useState('');
  const [form, setForm] = useState<{ id?: number } | null>(null);
  useInnerBack(form ? () => setForm(null) : trace ? () => { setTrace(null); setRecall(null); setEdit(null); } : null);

  useEffect(() => {
    if (!client || offline || trace || form) return;
    const t = setTimeout(() => {
      findLots(client, text)
        .then(setFound)
        .catch((e) => setError(`Couldn’t search Odoo. ${why(e)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, trace]);

  if (form)
    return (
      <GenericForm
        model="stock.lot"
        recordId={form.id ?? null}
        title="Batch"
        noun="Batch"
        sections={LOT_SECTIONS}
        required={['name', 'product_id']}
        testID="lot-form"
        onBack={() => {
          setForm(null);
          setTrace(null);
        }}
      />
    );

  if (trace)
    return (
      <Screen title={`Batch ${trace.lot.name}`} testID="trace-screen">
        <Row title={trace.lot.product} detail={trace.lot.useBy ? `Use by ${trace.lot.useBy}` : 'No use-by date'} value={`${fmtQty(trace.lot.onHand)} here`} />
        <Card title="Made in">
          {trace.madeIn.length ? (
            trace.madeIn.map((m) => (
              <Body key={m.name}>{`${m.name}. Ingredients: ${m.ingredients.length ? m.ingredients.map((i) => `${i.product} (batch ${i.lot})`).join(', ') : 'no batch numbers recorded'}`}</Body>
            ))
          ) : (
            <Body muted>Not made here, or no record of it.</Body>
          )}
        </Card>
        {trace.usedIn.length ? (
          <Card title="Used to make">
            {trace.usedIn.map((u) => (
              <Body key={u.name}>{`${u.name} · ${u.product}`}</Body>
            ))}
          </Card>
        ) : null}
        {recall && recall.finished.length ? (
          <Card title="Went into">
            {recall.finished.map((f) => (
              <Body key={f.batch}>{`${f.batch} · ${f.product}${f.lots.length ? ` (batch ${f.lots.join(', ')})` : ''}. ${f.customers.length ? `Sent to ${[...new Set(f.customers.map((o) => o.customer || o.name))].join(', ')}.` : 'Not sent to a customer yet.'}`}</Body>
            ))}
          </Card>
        ) : null}
        {recall ? (
          <Card title="Who to tell if there is a recall" testID="recall-card">
            {recall.customers.length ? recall.customers.map((n) => <Body key={n}>{n}</Body>) : <Body muted>No customer has had this batch yet.</Body>}
            <Button label="Share label text" kind="plain" onPress={async () => { if (client) Share.share({ message: await labelText(client, recall.trace) }); }} testID="share-label" />
            <Button label="Share traceability sheet" kind="plain" onPress={() => Share.share({ message: recallText(recall, new Date().toISOString().slice(0, 10)) })} testID="share-trace" />
          </Card>
        ) : null}
        <PhotosCard model="stock.lot" resId={trace.lot.id} recordName={`batch ${trace.lot.name}`} testID="lot-photos" />
        <Card title="Went out on">
          {trace.wentOutOn.length ? trace.wentOutOn.map((o) => <Row key={o.name} title={o.customer || o.name} detail={`${o.origin || o.name} · ${fmtQty(o.qty)}`} />) : <Body muted>Not sent to any customer yet.</Body>}
        </Card>
        {edit ? (
          <Card title="Change this batch">
            <Field label="Batch number" value={edit.name} onChangeText={(v) => setEdit({ ...edit, name: v })} autoCapitalize="characters" testID="edit-lot-name" />
            <Field label="Use by (year-month-day)" value={edit.useBy} onChangeText={(v) => setEdit({ ...edit, useBy: v })} placeholder="2026-12-25" testID="edit-lot-useby" />
            {edit.useBy && !isDate(edit.useBy) ? <ErrorText>Use the form 2026-12-25.</ErrorText> : null}
            {note ? <Body>{note}</Body> : null}
            <Button
              label="Save"
              disabled={!edit.name.trim() || (!!edit.useBy && !isDate(edit.useBy)) || !!note}
              testID="save-lot"
              onPress={async () => {
                setError('');
                try {
                  const r = await save(editLotChange(trace.lot.id, edit));
                  setNote(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
                  setTrace({ ...trace, lot: { ...trace.lot, name: edit.name.trim(), useBy: edit.useBy || trace.lot.useBy } });
                  setTimeout(() => {
                    setEdit(null);
                    setNote('');
                  }, 900);
                } catch (e) {
                  setError(`Odoo said no: ${why(e)}`);
                }
              }}
            />
          </Card>
        ) : (
          <>
            <Button label="Change batch number or use-by date" kind="plain" onPress={() => setEdit({ name: trace.lot.name, useBy: trace.lot.useBy })} testID="edit-lot" />
            <Button label="All batch details" kind="plain" onPress={() => setForm({ id: trace.lot.id })} testID="lot-all" />
          </>
        )}
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Back to search" kind="plain" onPress={() => { setTrace(null); setRecall(null); setEdit(null); }} />
      </Screen>
    );

  return (
    <Screen title="Find a batch" testID="find-screen">
      {offline ? <NeedsSignal onBack={onBack} /> : <Field label="Batch number" value={text} onChangeText={setText} testID="find-text" />}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!offline ? <ScanButton label="Scan a batch code" onMatch={(m) => m.kind === 'lot' && setText(m.name)} /> : null}
      <Button label="Add a batch" kind="plain" onPress={() => setForm({})} testID="new-lot" />
      {found.map((f) => (
        <Row
          key={f.id}
          title={f.name}
          detail={f.product}
          onPress={async () => {
            if (!client) return;
            try {
              const r = await recallLot(client, f.id);
              setRecall(r);
              setTrace(r?.trace ?? null);
            } catch (e) {
              setError(`Couldn’t trace this batch. ${why(e)}`);
            }
          }}
          testID={`found-${f.id}`}
        />
      ))}
      {!offline ? <Button label="Back" kind="plain" onPress={onBack} /> : null}
    </Screen>
  );
}

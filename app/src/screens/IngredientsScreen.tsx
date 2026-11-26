import { useInnerBack } from '../lib/innerBack';
import { useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen } from '../components/ui';
import { GenericForm } from './GenericForm';
import { LinesScreen, unitAfterProduct } from './SubRecordsEditor';
import { PO_LINES } from '../lib/subRecords';
import { PURCHASE_SECTIONS, REORDER_SECTIONS } from '../lib/forms';
import { loadPurchaseOrders, poStateLabel, PurchaseRow, Arrived, checkInChanges, loadReceiptLines, loadReceipts, loadRules, LowItem, newSupplierChange, placeOrderChange, Receipt, ReceiptLine, searchSuppliers, setLevelsChange, Supplier, usualSuppliers } from '../lib/ingredients';
import { fmtQty, isDate } from '../lib/production';
import { searchProducts } from '../lib/stock';
import { IngredientListScreen } from './IngredientListScreen';
import { PlanScreen } from './PlanScreen';
import { loadRecipes } from '../lib/production';
import { MoneyScreen } from './MoneyScreen';
import { BoughtScreen } from './BoughtScreen';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toNum = (t: string) => Number(t.replace(',', '.'));

type Page = { p: 'menu' } | { p: 'bought' } | { p: 'history' } | { p: 'shop' } | { p: 'list' } | { p: 'low' } | { p: 'order'; item: LowItem } | { p: 'levels'; item?: LowItem } | { p: 'receipts' } | { p: 'checkin'; receipt: Receipt } | { p: 'rule'; id: number } | { p: 'pos' } | { p: 'po'; id?: number; lines?: boolean };

/** The page Back goes to from each page. */
function upFrom(p: Page): Page {
  switch (p.p) {
    case 'order':
    case 'levels':
    case 'rule':
      return { p: 'low' };
    case 'po':
      return p.lines ? { p: 'po', id: p.id } : { p: 'pos' };
    case 'checkin':
      return { p: 'receipts' };
    default:
      return { p: 'menu' };
  }
}

/** Where Ingredients opens: a page named by the Buy tab, or the menu. */
function startPage(go?: string): Page {
  const p = ['bought', 'history', 'shop', 'list', 'low', 'receipts', 'pos'].find((x) => x === go);
  return p ? ({ p } as Page) : { p: 'menu' };
}

/** Ingredients: what is running low, ordering, and checking deliveries in. */
export function IngredientsScreen({ go }: { go?: string } = {}) {
  const [page, setPage] = useState<Page>(startPage(go));
  const menu = () => setPage({ p: 'menu' });
  useInnerBack(page.p === 'menu' ? null : () => setPage(upFrom(page)));
  switch (page.p) {
    case 'bought':
      return <BoughtScreen onBack={menu} />;
    case 'shop':
      return <ShoppingPage onBack={menu} />;
    case 'history':
      return <MoneyScreen kind="in" onBack={menu} />;
    case 'list':
      return <IngredientListScreen onBack={menu} />;
    case 'low':
      return <Low onBack={menu} onOrder={(item) => setPage({ p: 'order', item })} onLevels={(item) => setPage({ p: 'levels', item })} onRule={(id) => setPage({ p: 'rule', id })} />;
    case 'order':
      return <OrderIt item={page.item} onBack={() => setPage({ p: 'low' })} />;
    case 'levels':
      return <Levels item={page.item} onBack={() => setPage({ p: 'low' })} />;
    case 'receipts':
      return <Receipts onBack={menu} onOpen={(receipt) => setPage({ p: 'checkin', receipt })} />;
    case 'rule':
      return <GenericForm model="stock.warehouse.orderpoint" recordId={page.id} title="Reorder rule" noun="Rule" sections={REORDER_SECTIONS} uniqueField="product_min_qty" testID="rule-form" onBack={() => setPage({ p: 'low' })} />;
    case 'pos':
      return <PurchaseOrders onBack={menu} onOpen={(id) => setPage({ p: 'po', id })} />;
    case 'po':
      if (page.lines && page.id)
        return <PoLines id={page.id} onBack={() => setPage({ p: 'po', id: page.id })} />;
      return (
        <GenericForm
          model="purchase.order"
          recordId={page.id ?? null}
          title="Purchase order"
          noun="Order"
          sections={PURCHASE_SECTIONS}
          required={['partner_id']}
          uniqueField="partner_ref"
          testID="po-form"
          onBack={() => setPage({ p: 'pos' })}
          extraTabs={[{ id: 'lines', label: 'Lines', render: () => <Button label="Edit the order lines" onPress={() => setPage({ p: 'po', id: page.id, lines: true })} testID="po-lines" /> }]}
        />
      );
    case 'checkin':
      return <CheckIn receipt={page.receipt} onBack={() => setPage({ p: 'receipts' })} />;
  }
  return (
    <Screen title="Ingredients" testID="ingredients-screen">
      <Row title="Bought ingredients" detail="Shopped? Write down what you bought and paid. It goes into stock" onPress={() => setPage({ p: 'bought' })} testID="ing-bought" />
      <Row title="Shopping list" detail="What planned batches need, and what is running low, by supplier" onPress={() => setPage({ p: 'shop' })} testID="ing-shop" />
      <Row title="Purchase history" detail="Every purchase and bill: date, store, total, paid or not" onPress={() => setPage({ p: 'history' })} testID="ing-history" />
      <Row title="Ingredient list" detail="See, add and change ingredients, their cost and vendors" onPress={() => setPage({ p: 'list' })} testID="ing-list" />
      <Row title="Running low" detail="What to order, and the levels that mean low" onPress={() => setPage({ p: 'low' })} testID="ing-low" />
      <Body muted>Ordering ahead, then receiving later:</Body>
      <Row title="Purchase orders" detail="See, add and change orders to vendors" onPress={() => setPage({ p: 'pos' })} testID="ing-pos" />
      <Row title="Check in a delivery" detail="Record what arrived, with batch numbers and use-by dates" onPress={() => setPage({ p: 'receipts' })} testID="ing-receipts" />
    </Screen>
  );
}

function ShoppingPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [recipes, setRecipes] = useState<Awaited<ReturnType<typeof loadRecipes>> | null>(null);
  useEffect(() => {
    if (!client || offline) {
      setRecipes([]);
      return;
    }
    loadRecipes(client).then(setRecipes).catch(() => setRecipes([]));
  }, [client, offline]);
  if (!recipes) return <Screen title="Shopping list"><Body muted>Loading…</Body></Screen>;
  return <PlanScreen recipes={recipes} start="shop" onBack={onBack} />;
}

function PoLines({ id, onBack }: { id: number; onBack: () => void }) {
  const { client } = useOdoo();
  const [state, setState] = useState('');
  useEffect(() => {
    if (!client) return;
    client.call('purchase.order', 'read', [[id]], { fields: ['state'] }).then((r) => setState(String((r as { state?: string }[])[0]?.state ?? ''))).catch(() => undefined);
  }, [client, id]);
  return (
    <LinesScreen
      title="Order lines"
      onBack={onBack}
      spec={PO_LINES}
      domain={[['order_id', '=', id]]}
      base={{ order_id: id }}
      label="Order"
      addLabel="Add a line"
      canEdit={state === '' || state === 'draft' || state === 'sent' || state === 'purchase'}
      lockedNote="This order is finished or cancelled. Change it in Odoo."
      afterPick={unitAfterProduct('product_uom_id')}
    />
  );
}

function PurchaseOrders({ onBack, onOpen }: { onBack: () => void; onOpen: (id?: number) => void }) {
  const { client, offline } = useOdoo();
  const [list, setList] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    loadPurchaseOrders(client)
      .then(setList)
      .catch((e) => setError(`Couldn’t read orders from Odoo. ${why(e)}`));
  }, [client, offline]);
  return (
    <Screen title="Purchase orders" testID="pos-screen">
      <Button label="New order" onPress={() => onOpen()} testID="new-po" />
      {offline ? <Offline onBack={onBack} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {list?.map((o) => (
        <Row key={o.id} title={o.name} detail={`${o.vendor}${o.date ? ` · ${o.date}` : ''}`} value={poStateLabel(o.state)} onPress={() => onOpen(o.id)} testID={`po-${o.id}`} />
      ))}
      {list && !list.length ? <Body muted>No orders yet.</Body> : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function Offline({ onBack }: { onBack: () => void }) {
  return (
    <>
      <Body muted>No signal. This comes from Odoo, so it shows when the phone is back online.</Body>
      <Button label="Back" kind="plain" onPress={onBack} />
    </>
  );
}

function Low({ onBack, onOrder, onLevels, onRule }: { onBack: () => void; onOrder: (i: LowItem) => void; onLevels: (i?: LowItem) => void; onRule: (id: number) => void }) {
  const { client, offline } = useOdoo();
  const [items, setItems] = useState<LowItem[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    loadRules(client, true)
      .then(setItems)
      .catch((e) => setError(`Couldn’t read stock levels from Odoo. ${why(e)}`));
  }, [client, offline]);
  return (
    <Screen title="Running low" testID="low-screen">
      {offline ? <Offline onBack={onBack} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items && !items.length ? <Body muted>Nothing is under its level. Set levels to get warnings.</Body> : null}
      {items?.map((i) => (
        <Card key={i.ruleId} testID={`low-${i.ruleId}`}>
          <Row title={i.name} detail={`Low at ${fmtQty(i.min)}, full at ${fmtQty(i.max)} ${i.unit}`.trim()} value={`${fmtQty(i.onHand)} left`} />
          <Button label="Order more" onPress={() => onOrder(i)} testID={`order-${i.ruleId}`} />
          <Button label="Change levels" kind="plain" onPress={() => onLevels(i)} />
          <Button label="All rule settings" kind="plain" onPress={() => onRule(i.ruleId)} testID={`rule-all-${i.ruleId}`} />
        </Card>
      ))}
      <Button label="Set levels for a product" kind="plain" onPress={() => onLevels()} testID="add-level" />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function Levels({ item, onBack }: { item?: LowItem; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ id: number; name: string }[]>([]);
  const [product, setProduct] = useState<{ id: number; name: string } | null>(item ? { id: item.productId, name: item.name } : null);
  const [min, setMin] = useState(item ? String(item.min) : '');
  const [max, setMax] = useState(item ? String(item.max) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client || offline || product) return;
    const t = setTimeout(() => {
      searchProducts(client, text)
        .then(setFound)
        .catch((e) => setError(why(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, product]);

  if (!product)
    return (
      <Screen title="Set levels" testID="levels-screen">
        <Field label="Find a product" value={text} onChangeText={setText} testID="levels-search" />
        {found.map((p) => (
          <Row key={p.id} title={p.name} onPress={() => setProduct(p)} testID={`levels-product-${p.id}`} />
        ))}
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Back" kind="plain" onPress={onBack} />
      </Screen>
    );
  const ok = Number.isFinite(toNum(min)) && Number.isFinite(toNum(max)) && min !== '' && max !== '' && toNum(max) >= toNum(min);
  return (
    <Screen title={product.name} testID="levels-form">
      <Field label="Low at (order when it falls to this)" value={min} onChangeText={setMin} keyboardType="decimal-pad" testID="level-min" />
      <Field label="Full at (order up to this)" value={max} onChangeText={setMax} keyboardType="decimal-pad" testID="level-max" />
      {min !== '' && max !== '' && !ok ? <ErrorText>Full has to be at least as much as low.</ErrorText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Save levels"
        disabled={!ok}
        busy={busy}
        testID="save-levels"
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            await save(setLevelsChange(product.name, product.id, toNum(min), toNum(max), item?.ruleId ?? null));
            onBack();
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

function OrderIt({ item, onBack }: { item: LowItem; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [usual, setUsual] = useState<Supplier[]>([]);
  const [text, setText] = useState('');
  const [found, setFound] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [qty, setQty] = useState(fmtQty(item.suggest));
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client || offline) return;
    usualSuppliers(client, item.productId).then(setUsual).catch(() => undefined);
  }, [client, offline, item.productId]);
  useEffect(() => {
    if (!client || offline || supplier) return;
    const t = setTimeout(() => {
      searchSuppliers(client, text)
        .then(setFound)
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, supplier]);

  const q = toNum(qty);
  const okQty = Number.isFinite(q) && q > 0;
  if (offline)
    return (
      <Screen title="Order" testID="order-screen">
        <Offline onBack={onBack} />
      </Screen>
    );

  if (!supplier)
    return (
      <Screen title={`Order ${item.name}`} testID="order-screen">
        {usual.length ? <Body>Usual suppliers</Body> : null}
        {usual.map((s) => (
          <Row key={s.id} title={s.name} onPress={() => setSupplier(s)} testID={`usual-${s.id}`} />
        ))}
        <Field label="Find a supplier" value={text} onChangeText={setText} testID="supplier-search" />
        {found.map((s) => (
          <Row key={s.id} title={s.name} onPress={() => setSupplier(s)} testID={`supplier-${s.id}`} />
        ))}
        {adding ? (
          <Card title="New supplier">
            <Field label="Name" value={newName} onChangeText={setNewName} autoCapitalize="words" testID="new-supplier-name" />
            <Field label="Phone (optional)" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
            <Field label="Email (optional)" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" />
            <Button
              label="Save supplier"
              disabled={!newName.trim()}
              testID="save-supplier"
              onPress={async () => {
                setError('');
                try {
                  const r = await save(newSupplierChange(newName, newPhone, newEmail));
                  if (r.status === 'saved' && typeof r.result === 'number') setSupplier({ id: r.result, name: newName.trim() });
                  else if (r.status === 'saved') {
                    const again = await searchSuppliers(client!, newName.trim());
                    const hit = again.find((x) => x.name === newName.trim());
                    if (hit) setSupplier(hit);
                  } else setError('A new supplier needs signal. Try again when you are online.');
                } catch (e) {
                  setError(`Odoo said no: ${why(e)}`);
                }
              }}
            />
          </Card>
        ) : (
          <Button label="Add a new supplier" kind="plain" onPress={() => setAdding(true)} testID="add-supplier" />
        )}
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Back" kind="plain" onPress={onBack} />
      </Screen>
    );

  return (
    <Screen title={`Order ${item.name}`} testID="order-form">
      <Row title="Supplier" value={supplier.name} onPress={() => setSupplier(null)} />
      <Field label={`How much${item.unit ? ` (${item.unit})` : ''}`} value={qty} onChangeText={setQty} keyboardType="decimal-pad" testID="order-qty" />
      <Body muted>Odoo works out the price from the supplier’s price list.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Place order"
        disabled={!okQty || !!note}
        busy={busy}
        testID="place-order"
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            const r = await save(placeOrderChange(supplier, [{ productId: item.productId, name: item.name, qty: q }]));
            setNote(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Order placed in Odoo. Send it to the supplier yourself.');
            setTimeout(onBack, 1500);
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

function Receipts({ onBack, onOpen }: { onBack: () => void; onOpen: (r: Receipt) => void }) {
  const { client, offline } = useOdoo();
  const [list, setList] = useState<Receipt[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    loadReceipts(client)
      .then(setList)
      .catch((e) => setError(`Couldn’t read deliveries from Odoo. ${why(e)}`));
  }, [client, offline]);
  return (
    <Screen title="Check in a delivery" testID="receipts-screen">
      {offline ? <Offline onBack={onBack} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {list && !list.length ? <Body muted>No deliveries are expected.</Body> : null}
      {list?.map((r) => (
        <Row key={r.id} title={r.supplier || r.name} detail={`${r.origin || r.name}`} onPress={() => onOpen(r)} testID={`receipt-${r.id}`} />
      ))}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function CheckIn({ receipt, onBack }: { receipt: Receipt; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [lines, setLines] = useState<ReceiptLine[] | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [lot, setLot] = useState<Record<number, string>>({});
  const [useBy, setUseBy] = useState<Record<number, string>>({});
  const [price, setPrice] = useState<Record<number, string>>({});
  const [total, setTotal] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client || offline) return;
    loadReceiptLines(client, receipt.id)
      .then((l) => {
        setLines(l);
        setQty(Object.fromEntries(l.map((x) => [x.moveId, fmtQty(x.ordered)])));
        setPrice(Object.fromEntries(l.filter((x) => x.price !== null).map((x) => [x.moveId, fmtQty(x.price ?? 0)])));
        setTotal(Object.fromEntries(l.filter((x) => x.price !== null).map((x) => [x.moveId, fmtQty(Math.round((x.price ?? 0) * x.ordered * 100) / 100)])));
      })
      .catch((e) => setError(`Couldn’t read this delivery from Odoo. ${why(e)}`));
  }, [client, offline, receipt.id]);

  const arrived: Arrived[] = (lines ?? []).map((line) => ({ line, qty: toNum(qty[line.moveId] ?? '0'), lot: (lot[line.moveId] ?? '').trim(), useBy: (useBy[line.moveId] ?? '').trim(), ...(line.orderLineId !== null && (price[line.moveId] ?? '') !== '' ? { price: toNum(price[line.moveId] ?? '') } : {}) }));
  const bad = arrived.some((a) => !Number.isFinite(a.qty) || a.qty < 0 || (a.price !== undefined && (!Number.isFinite(a.price) || a.price < 0)) || (a.useBy && !isDate(a.useBy)) || (a.line.tracked && a.qty > 0 && !a.lot));
  return (
    <Screen title={receipt.supplier || receipt.name} testID="checkin-screen">
      {offline ? <Offline onBack={onBack} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {lines?.map((l) => (
        <Card key={l.moveId} title={l.name}>
          <Field label={`How many arrived (ordered ${fmtQty(l.ordered)})`} value={qty[l.moveId] ?? ''} onChangeText={(v) => setQty({ ...qty, [l.moveId]: v })} keyboardType="decimal-pad" testID={`arrived-${l.moveId}`} />
          {l.orderLineId !== null ? (
            <>
              <Field
                label="Price each (what you paid)"
                value={price[l.moveId] ?? ''}
                onChangeText={(v) => {
                  setPrice({ ...price, [l.moveId]: v });
                  const n = toNum(qty[l.moveId] ?? '0');
                  const p = toNum(v);
                  setTotal({ ...total, [l.moveId]: Number.isFinite(n) && Number.isFinite(p) ? fmtQty(Math.round(n * p * 100) / 100) : '' });
                }}
                keyboardType="decimal-pad"
                testID={`arrived-price-${l.moveId}`}
              />
              <Field
                label="Total paid for this line"
                value={total[l.moveId] ?? ''}
                onChangeText={(v) => {
                  setTotal({ ...total, [l.moveId]: v });
                  const n = toNum(qty[l.moveId] ?? '0');
                  const t = toNum(v);
                  if (n > 0 && Number.isFinite(t)) setPrice({ ...price, [l.moveId]: fmtQty(Math.round((t / n) * 10000) / 10000) });
                }}
                keyboardType="decimal-pad"
                testID={`arrived-total-${l.moveId}`}
              />
            </>
          ) : null}
          {l.tracked ? (
            <>
              <Field label="Supplier’s batch number" value={lot[l.moveId] ?? ''} onChangeText={(v) => setLot({ ...lot, [l.moveId]: v })} autoCapitalize="characters" testID={`arrived-lot-${l.moveId}`} />
              <Field label="Use by (year-month-day, optional)" value={useBy[l.moveId] ?? ''} onChangeText={(v) => setUseBy({ ...useBy, [l.moveId]: v })} placeholder="2027-01-31" testID={`arrived-useby-${l.moveId}`} />
            </>
          ) : null}
        </Card>
      ))}
      {bad ? <ErrorText>Check the amounts. Batch products need a batch number, and dates look like 2027-01-31.</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Check in"
        disabled={!lines || bad || !!note}
        busy={busy}
        testID="check-in"
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            let queued = false;
            for (const ch of checkInChanges(receipt, arrived.filter((a) => a.qty > 0))) if ((await save(ch)).status === 'queued') queued = true;
            setNote(queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Checked in.');
            setTimeout(onBack, 1200);
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

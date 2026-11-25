import { useInnerBack } from '../lib/innerBack';
import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen, SwitchRow } from '../components/ui';
import {
  addVendorChange,
  editIngredientChange,
  editVendorChange,
  Ingredient,
  IngredientRow,
  loadCategories,
  loadIngredient,
  loadIngredients,
  loadPurchaseTaxes,
  loadUnits,
  Named,
  newIngredientChange,
  removeVendorChange,
  VendorLine,
} from '../lib/ingredientList';
import { categoryCostMethod } from '../lib/costing';
import { searchSuppliers } from '../lib/ingredients';
import { ProductForm } from './ProductForm';
import { fmtQty } from '../lib/production';
import type { NewChange } from '../lib/queue';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toNum = (t: string) => Number(t.replace(',', '.'));
const okMoney = (t: string) => t.trim() !== '' && Number.isFinite(toNum(t)) && toNum(t) >= 0;
const money = (n: number) => n.toFixed(2);

/** Picks one of a short list (a category or a unit of measure). */
export function Choose({ title, items, onPick, onBack }: { title: string; items: Named[]; onPick: (n: Named) => void; onBack: () => void }) {
  return (
    <Screen title={title} testID="choose-screen">
      {items.map((i) => (
        <Row key={i.id} title={i.name} onPress={() => onPick(i)} testID={`choose-${i.id}`} />
      ))}
      {!items.length ? <Body muted>Odoo has none to pick from.</Body> : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/** The ingredient list: products Odoo can buy, in a category. Open one to change it, or add a new one. */
export function IngredientListScreen({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [cats, setCats] = useState<Named[]>([]);
  const [cat, setCat] = useState<Named | null | undefined>(undefined);
  const [choosing, setChoosing] = useState(false);
  const [text, setText] = useState('');
  const [list, setList] = useState<IngredientRow[]>([]);
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  useInnerBack(open !== null ? () => { setOpen(null); setTick((n) => n + 1); } : choosing ? () => setChoosing(false) : null);

  useEffect(() => {
    if (!client || offline) return;
    loadCategories(client)
      .then((cs) => {
        setCats(cs);
        // Start on the category Odoo calls raw material, if it has one; the person can change it.
        setCat((cur) => (cur === undefined ? cs.find((c) => /raw material/i.test(c.name)) ?? null : cur));
      })
      .catch(() => setCat((cur) => (cur === undefined ? null : cur)));
  }, [client, offline]);

  useEffect(() => {
    if (!client || offline || cat === undefined) return;
    const t = setTimeout(() => {
      loadIngredients(client, cat?.id ?? null, text)
        .then(setList)
        .catch((e) => setError(`Couldn’t read ingredients from Odoo. ${why(e)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, cat, text, tick]);

  if (choosing)
    return (
      <Choose
        title="Category"
        items={[{ id: 0, name: 'All categories' }, ...cats]}
        onPick={(n) => {
          setCat(n.id ? n : null);
          setChoosing(false);
        }}
        onBack={() => setChoosing(false)}
      />
    );
  if (open !== null)
    return (
      <IngredientForm
        id={open === 'new' ? null : open}
        defaultCategory={cat ?? null}
        onBack={() => {
          setOpen(null);
          setTick((n) => n + 1);
        }}
      />
    );

  return (
    <Screen title="Ingredient list" testID="ingredient-list-screen">
      {offline ? <Body muted>No signal. The list comes from Odoo, so it shows when the phone is back online.</Body> : null}
      <Button label="Add an ingredient" onPress={() => setOpen('new')} testID="new-ingredient" />
      <Row title="Category" value={cat ? cat.name : 'All'} onPress={() => setChoosing(true)} testID="ingredient-category" />
      <Field label="Search by name" value={text} onChangeText={setText} testID="ingredient-search" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {list.map((i) => (
        <Row key={i.id} title={i.name} detail={`${i.variants > 1 ? `${i.variants} variants · ` : ''}Cost ${money(i.cost)}`} value={`${fmtQty(i.onHand)} ${i.unit}`.trim()} onPress={() => setOpen(i.id)} testID={`ingredient-${i.id}`} />
      ))}
      {cat !== undefined && !list.length && !error ? <Body muted>No ingredients here yet.</Body> : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

export function IngredientForm({ id, defaultCategory, onBack, onCreated }: { id: number | null; defaultCategory: Named | null; onBack: () => void; onCreated?: (name: string) => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [ing, setIng] = useState<Ingredient | null>(null);
  const [cats, setCats] = useState<Named[]>([]);
  const [units, setUnits] = useState<Named[]>([]);
  const [taxes, setTaxes] = useState<Named[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Named | null>(defaultCategory);
  const [unit, setUnit] = useState<Named | null>(null);
  const [cost, setCost] = useState('0');
  const [taxIds, setTaxIds] = useState<number[]>([]);
  const [reference, setReference] = useState('');
  const [barcode, setBarcode] = useState('');
  const [picking, setPicking] = useState<'category' | 'unit' | 'all' | null>(null);
  const [vendor, setVendor] = useState<VendorLine | 'new' | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [avg, setAvg] = useState(false);
  const catId = category?.id ?? 0;
  useEffect(() => {
    if (!client || offline || !id || !catId) {
      setAvg(false);
      return;
    }
    categoryCostMethod(client, catId).then((m) => setAvg(m === 'average'));
  }, [client, offline, id, catId]);
  useInnerBack(picking ? () => setPicking(null) : vendor ? () => setVendor(null) : null);

  const load = useCallback(async () => {
    if (!client || offline) return;
    try {
      const [cs, us, ts] = await Promise.all([loadCategories(client), loadUnits(client), loadPurchaseTaxes(client)]);
      setCats(cs);
      setUnits(us);
      setTaxes(ts);
      if (id) {
        const d = await loadIngredient(client, id);
        if (d) {
          setIng(d);
          setName(d.name);
          setCategory(d.categoryId ? { id: d.categoryId, name: d.category } : null);
          setCost(String(d.cost));
          setTaxIds(d.taxIds);
          setReference(d.reference);
          setBarcode(d.barcode);
        }
      } else {
        const raw = cs.find((c) => /raw material/i.test(c.name));
        if (raw) setCategory((prev) => prev ?? raw);
      }
    } catch (e) {
      setError(`Couldn’t read from Odoo. ${why(e)}`);
    }
  }, [client, offline, id]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (change: Parameters<typeof save>[0]) => {
    setError('');
    try {
      const r = await save(change);
      setNote(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
      await load();
      return true;
    } catch (e) {
      setError(`Odoo said no: ${why(e)}`);
      return false;
    }
  };

  if (picking === 'category')
    return (
      <Choose
        title="Category"
        items={cats}
        onPick={(n) => {
          setCategory(n);
          setPicking(null);
        }}
        onBack={() => setPicking(null)}
      />
    );
  if (picking === 'unit')
    return (
      <Choose
        title="Unit of measure"
        items={units}
        onPick={(n) => {
          setUnit(n);
          setPicking(null);
        }}
        onBack={() => setPicking(null)}
      />
    );
  if (picking === 'all' && id)
    return <ProductForm templateId={id} onBack={() => setPicking(null)} />;
  if (vendor && ing)
    return (
      <VendorForm
        ingredient={ing}
        line={vendor === 'new' ? null : vendor}
        onSave={async (change) => {
          if (await run(change)) setVendor(null);
        }}
        onBack={() => setVendor(null)}
      />
    );

  const values = { name, categoryId: category?.id ?? null, cost: toNum(cost), taxIds, reference, barcode, costLocked: avg };
  const ready = name.trim().length > 0 && okMoney(cost) && (id ? !!ing : true);
  return (
    <Screen title={id ? name || 'Ingredient' : 'New ingredient'} testID="ingredient-form">
      {offline && id ? <Body muted>No signal, so this ingredient can’t be opened yet.</Body> : null}
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" testID="ingredient-name" />
      <Row title="Category" value={category?.name ?? 'None'} onPress={() => setPicking('category')} testID="ingredient-pick-category" />
      {id ? (
        <Row title="Unit of measure" value={ing?.unit ?? ''} detail="Set in Odoo" />
      ) : (
        <Row title="Unit of measure" value={unit?.name ?? 'Choose'} onPress={() => setPicking('unit')} testID="ingredient-pick-unit" />
      )}
      <Field label="Cost" value={cost} onChangeText={setCost} keyboardType="decimal-pad" editable={!avg} testID="ingredient-cost" />
      {avg ? <Body muted>Odoo works this out from what you pay for deliveries and batches (Average Cost). It can’t be typed here.</Body> : null}
      {!avg && cost !== '' && !okMoney(cost) ? <ErrorText>Type the cost as a number, like 2.41.</ErrorText> : null}
      <Card title="Purchase taxes (from Odoo)">
        {taxes.map((t) => (
          <SwitchRow key={t.id} title={t.name} value={taxIds.includes(t.id)} onChange={(v) => setTaxIds(v ? [...taxIds, t.id] : taxIds.filter((x) => x !== t.id))} testID={`tax-${t.id}`} />
        ))}
        {!taxes.length ? <Body muted>No purchase taxes found in Odoo.</Body> : null}
      </Card>
      <Field label="Reference (optional)" value={reference} onChangeText={setReference} testID="ingredient-ref" />
      <Field label="Barcode (optional)" value={barcode} onChangeText={setBarcode} testID="ingredient-barcode" />
      {id && ing ? (
        <>
          <Row title="Stock is counted" value={ing.tracked ? 'Yes' : 'No'} detail={ing.tracked ? `${fmtQty(ing.onHand)} ${ing.unit} on hand` : 'Switch on Track Inventory under All product details.'} />
          <Button label="All product details (stock tracking, batches, expiry and more)" kind="plain" onPress={() => setPicking('all')} testID="ingredient-all" />
        </>
      ) : (
        <Body muted>Save the ingredient first. Then open All product details to switch on Track Inventory and batch tracking.</Body>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Save"
        disabled={!ready}
        busy={busy}
        testID="save-ingredient"
        onPress={async () => {
          setBusy(true);
          const ok = await run(id ? editIngredientChange(id, values) : newIngredientChange(values, unit?.id ?? null));
          setBusy(false);
          if (ok && !id) {
            onCreated?.(name.trim());
            setTimeout(onBack, 900);
          }
        }}
      />
      {id && ing ? (
        <Card title="Vendors">
          {ing.vendors.map((v) => (
            <Row key={v.id} title={v.vendor} detail={`Minimum ${fmtQty(v.minQty)} · ${v.days} days`} value={money(v.price)} onPress={() => setVendor(v)} testID={`vendor-${v.id}`} />
          ))}
          {!ing.vendors.length ? <Body muted>No vendors yet.</Body> : null}
          <Button label="Add a vendor" kind="plain" onPress={() => setVendor('new')} testID="add-vendor" />
        </Card>
      ) : null}
      <Button label="Back to the list" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function VendorForm({ ingredient, line, onSave, onBack }: { ingredient: Ingredient; line: VendorLine | null; onSave: (c: NewChange) => void; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [found, setFound] = useState<Named[]>([]);
  const [partner, setPartner] = useState<Named | null>(line ? { id: line.partnerId, name: line.vendor } : null);
  const [price, setPrice] = useState(line ? String(line.price) : '');
  const [minQty, setMinQty] = useState(line ? String(line.minQty) : '1');
  const [days, setDays] = useState(line ? String(line.days) : '0');

  useEffect(() => {
    if (!client || offline || partner) return;
    const t = setTimeout(() => {
      searchSuppliers(client, text)
        .then(setFound)
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, partner]);

  if (!partner)
    return (
      <Screen title="Pick a vendor" testID="vendor-pick-screen">
        <Field label="Find a vendor" value={text} onChangeText={setText} testID="vendor-search" />
        {found.map((s) => (
          <Row key={s.id} title={s.name} onPress={() => setPartner(s)} testID={`vendor-pick-${s.id}`} />
        ))}
        <Button label="Back" kind="plain" onPress={onBack} />
      </Screen>
    );
  const ok = okMoney(price) && okMoney(minQty) && Number.isInteger(toNum(days)) && toNum(days) >= 0;
  const v = { partnerId: partner.id, vendor: partner.name, price: toNum(price), minQty: toNum(minQty), days: toNum(days) };
  return (
    <Screen title={`${partner.name}`} testID="vendor-form">
      <Field label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" testID="vendor-price" />
      <Field label="Minimum amount" value={minQty} onChangeText={setMinQty} keyboardType="decimal-pad" testID="vendor-min" />
      <Field label="Days to deliver" value={days} onChangeText={setDays} keyboardType="number-pad" testID="vendor-days" />
      {!ok ? <Body muted>Fill in the price, minimum and days.</Body> : null}
      <Button label="Save" disabled={!ok} testID="save-vendor" onPress={() => onSave(line ? editVendorChange(line, ingredient.name, v) : addVendorChange(ingredient.id, ingredient.name, v))} />
      {line ? <Button label="Remove this vendor" kind="danger" onPress={() => onSave(removeVendorChange(line, ingredient.name))} testID="remove-vendor" /> : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

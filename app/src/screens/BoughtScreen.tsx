import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Row, Screen, SectionLabel, useUi } from '../components/ui';
import { useBrand } from '../lib/useBrand';
import { boughtChanges, Choice, Journal, loadChoices, loadJournals, lastPricePaid, searchSuppliers, Supplier } from '../lib/ingredients';
import { useInnerBack } from '../lib/innerBack';
import type { Rel } from '../lib/odooForm';
import { addDays, fmtQty, isDate, shelfLifeDays, ymd } from '../lib/production';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { RelationPicker } from './FormFields';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toNum = (t: string) => Number(t.replace(',', '.'));
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

const SUPPLIERS_KEY = 'bought/suppliers';
const CHOICES_KEY = 'bought/choices';
const JOURNAL_KEY = 'bought/journal';

/** The last lists read from Odoo, so a shop with no signal can still pick from them. */
async function cached<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
const remember = (key: string, list: unknown[]) => AsyncStorage.setItem(key, JSON.stringify(list)).catch(() => undefined);

interface Line {
  key: number;
  choice: Choice;
  qty: string;
  price: string;
  total: string;
  lot: string;
  useBy: string;
  /** A unit picked for this line instead of the ingredient's own. */
  uom: Rel | null;
}

type Page = 'main' | 'supplier' | 'ingredient' | 'unit' | 'edit' | 'check';

/**
 * Bought ingredients: one screen for a shopping trip. Who from, what was
 * bought and what was paid. Saving makes the order in Odoo, confirms it,
 * receives it and makes a vendor bill marked paid, from the offline queue.
 */
export function BoughtScreen({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [view, setView] = useState<Page>('main');
  const [editKey, setEditKey] = useState<number | null>(null);
  const [picked, setPicked] = useState<Choice[]>([]);
  const ui = useUi();
  const { colors } = useBrand();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState(ymd(new Date()));
  const [lines, setLines] = useState<Line[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [journal, setJournal] = useState<number | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [all, setAll] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useInnerBack(view !== 'main' ? () => setView(view === 'unit' ? 'edit' : 'main') : null);

  // Ways to pay, and the last one used.
  useEffect(() => {
    if (!client || offline) return;
    loadJournals(client).then(async (js) => {
      setJournals(js);
      const last = Number(await AsyncStorage.getItem(JOURNAL_KEY).catch(() => null));
      setJournal((j) => (j !== undefined ? j : js.some((x) => x.id === last) ? last : js[0]?.id ?? null));
    });
  }, [client, offline]);

  // Suppliers: from Odoo when online (and remembered), from the last list when not.
  useEffect(() => {
    if (view !== 'supplier') return;
    let live = true;
    const t = setTimeout(async () => {
      if (client && !offline) {
        try {
          const found = await searchSuppliers(client, text);
          if (live) setSuppliers(found);
          if (!text.trim()) remember(SUPPLIERS_KEY, found);
          return;
        } catch {
          // fall through to the remembered list
        }
      }
      const old = await cached<Supplier>(SUPPLIERS_KEY);
      if (live) setSuppliers(old.filter((s) => s.name.toLowerCase().includes(text.trim().toLowerCase())));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [view, text, client, offline]);

  // Ingredients, the same way.
  useEffect(() => {
    if (view !== 'ingredient') return;
    let live = true;
    const t = setTimeout(async () => {
      if (client && !offline) {
        try {
          const found = await loadChoices(client, text, all);
          if (live) setChoices(found);
          if (!text.trim() && !all) remember(CHOICES_KEY, found);
          return;
        } catch {
          // fall through
        }
      }
      const old = await cached<Choice>(CHOICES_KEY);
      if (live) setChoices(old.filter((s) => s.name.toLowerCase().includes(text.trim().toLowerCase())));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [view, text, all, client, offline]);

  const addLines = async (list: Choice[]) => {
    const made: Line[] = [];
    for (const c of list) {
      const key = Date.now() + lines.length + made.length;
      let price = '';
      let useBy = '';
      if (client && !offline) {
        const p = await lastPricePaid(client, c.id);
        if (p !== null) price = fmtQty(p);
        if (c.tracked) {
          const days = await shelfLifeDays(client, c.id);
          if (days) useBy = addDays(new Date(), days);
        }
      }
      made.push({ key, choice: c, qty: '1', price, total: price ? price : '', lot: '', useBy, uom: null });
    }
    setLines((ls) => [...ls, ...made]);
    setPicked([]);
    setText('');
    setView('main');
  };
  const money = (l: Line) => fmtQty(round((toNum(l.qty) || 0) * (toNum(l.price) || 0), 2));
  const change = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setQty = (l: Line, v: string) => {
    const q = toNum(v);
    const p = toNum(l.price);
    change(l.key, { qty: v, total: Number.isFinite(q) && Number.isFinite(p) && l.price !== '' ? fmtQty(round(q * p, 2)) : l.total });
  };
  const setPrice = (l: Line, v: string) => {
    const q = toNum(l.qty);
    const p = toNum(v);
    change(l.key, { price: v, total: Number.isFinite(q) && Number.isFinite(p) && v !== '' ? fmtQty(round(q * p, 2)) : '' });
  };
  const setTotal = (l: Line, v: string) => {
    const q = toNum(l.qty);
    const t = toNum(v);
    change(l.key, { total: v, ...(q > 0 && Number.isFinite(t) && v !== '' ? { price: fmtQty(round(t / q, 4)) } : {}) });
  };

  const billing = journals.length > 0;
  const problems: string[] = [];
  if (!supplier) problems.push('Pick who you bought from.');
  if (!lines.length) problems.push('Add what you bought.');
  if (!isDate(date)) problems.push('Type the date as 2026-11-25.');
  for (const l of lines) {
    const q = toNum(l.qty);
    const p = toNum(l.price);
    if (!(q > 0)) problems.push(`${l.choice.name}: how many?`);
    if (l.price === '' || !Number.isFinite(p) || p < 0) problems.push(`${l.choice.name}: what did you pay?`);
    if (l.choice.tracked && !l.lot.trim()) problems.push(`${l.choice.name}: a batch number is needed.`);
    if (l.useBy && !isDate(l.useBy)) problems.push(`${l.choice.name}: use-by dates look like 2027-01-31.`);
  }

  if (view === 'unit' && editKey !== null) {
    const l = lines.find((x) => x.key === editKey);
    return <RelationPicker def={{ name: 'uom', label: 'Unit', kind: 'one', relation: 'uom.uom' }} selected={l?.uom ?? null} onChange={(v) => change(editKey, { uom: v as Rel | null })} onBack={() => setView('edit')} />;
  }

  if (view === 'supplier')
    return (
      <Screen title="Bought from" testID="bought-supplier">
        <Field label="Find a store or supplier" value={text} onChangeText={setText} testID="bought-supplier-search" />
        {offline ? <Body muted>No signal. These are the ones from the last time you were online.</Body> : null}
        {suppliers.length ? (
          <Card>
            {suppliers.map((s) => (
              <Row key={s.id} title={s.name} onPress={() => { setSupplier(s); setText(''); setView('main'); }} testID={`bought-supplier-${s.id}`} />
            ))}
          </Card>
        ) : null}
        {!suppliers.length ? <Body muted>Nothing found. Add a new supplier from Ordering ahead, then it shows here.</Body> : null}
        <Button label="Back" kind="plain" onPress={() => setView('main')} />
      </Screen>
    );

  if (view === 'ingredient')
    return (
      <Screen title="What did you buy?" testID="bought-ingredient">
        <Field label="Find an ingredient" value={text} onChangeText={setText} testID="bought-ingredient-search" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[{ id: false, label: 'Ingredients' }, { id: true, label: 'All products' }].map((o) => (
            <Pressable key={o.label} onPress={() => setAll(o.id)} accessibilityRole="button" accessibilityLabel={o.label} testID={o.id ? 'bought-all' : 'bought-ingredients-only'} style={[ui.segItem, all === o.id && ui.segOn]}>
              <Text style={[ui.segText, all === o.id && ui.segTextOn]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        {offline ? <Body muted>No signal. These are the ones from the last time you were online.</Body> : null}
        {choices.length ? (
          <Card>
            {choices.map((c) => {
              const on = picked.some((x) => x.id === c.id);
              return (
                <Row
                  key={c.id}
                  title={c.name}
                  detail={c.unit}
                  onPress={() => setPicked((p) => (on ? p.filter((x) => x.id !== c.id) : [...p, c]))}
                  right={<Text style={{ fontSize: 20, fontWeight: '800', color: on ? colors.accent : colors.line }}>{on ? '✓' : '○'}</Text>}
                  testID={`bought-pick-${c.id}`}
                />
              );
            })}
          </Card>
        ) : (
          <Body muted>Nothing found.</Body>
        )}
        <Button label={picked.length ? `Add ${picked.length} ${picked.length === 1 ? 'item' : 'items'}` : 'Add'} disabled={!picked.length} onPress={() => addLines(picked)} testID="bought-add-picked" />
        <Button label="Back" kind="plain" onPress={() => setView('main')} />
      </Screen>
    );

  if (view === 'edit') {
    const l = lines.find((x) => x.key === editKey);
    if (!l) return null;
    return (
      <Screen title={l.choice.name} testID="bought-edit">
        <Card>
          <Field label={`How many (${l.uom?.name || l.choice.unit || 'units'})`} value={l.qty} onChangeText={(v) => setQty(l, v)} keyboardType="decimal-pad" testID={`bought-qty-${l.key}`} />
          <Field label="Price each" value={l.price} onChangeText={(v) => setPrice(l, v)} keyboardType="decimal-pad" testID={`bought-price-${l.key}`} />
          <Field label="Total paid for this line" value={l.total} onChangeText={(v) => setTotal(l, v)} keyboardType="decimal-pad" testID={`bought-total-${l.key}`} />
          {l.choice.tracked ? (
            <>
              <Field label="Batch number" value={l.lot} onChangeText={(v) => change(l.key, { lot: v })} autoCapitalize="characters" testID={`bought-lot-${l.key}`} />
              <Field label="Use by (year-month-day, optional)" value={l.useBy} onChangeText={(v) => change(l.key, { useBy: v })} placeholder="2027-01-31" testID={`bought-useby-${l.key}`} />
            </>
          ) : null}
          {!offline ? <Row title="Unit" value={l.uom?.name || l.choice.unit || 'own'} onPress={() => setView('unit')} testID={`bought-unit-${l.key}`} /> : null}
        </Card>
        <Button label="Done" onPress={() => setView('main')} testID="bought-done" />
        <Pressable onPress={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); setView('main'); }} accessibilityRole="button" accessibilityLabel="Remove" testID={`bought-remove-${l.key}`} style={{ alignItems: 'center', padding: 12 }}>
          <Text style={{ color: colors.stop, fontSize: 16, fontWeight: '800' }}>Remove this item</Text>
        </Pressable>
      </Screen>
    );
  }

  const total = round(lines.reduce((a, l) => a + (toNum(l.qty) || 0) * (toNum(l.price) || 0), 0), 2);

  if (view === 'check')
    return (
      <Screen title="Check and save" testID="bought-check">
        <Card>
          <Row title="Bought from" value={supplier?.name ?? ''} />
          <Row title="Date" value={date} />
        </Card>
        <Card>
          {lines.map((l) => (
            <Row key={l.key} title={l.choice.name} detail={`${l.qty} ${l.uom?.name || l.choice.unit} at ${l.price} each`} value={money(l)} testID={`bought-check-${l.key}`} />
          ))}
          <Row title="Total as typed" value={fmtQty(total)} testID="bought-total" />
        </Card>
        {billing ? (
          <Card title="How was it paid?">
            {journals.map((j) => (
              <Row key={j.id} title={j.name} value={journal === j.id ? '✓' : ''} onPress={() => setJournal(j.id)} testID={`bought-pay-${j.id}`} />
            ))}
            <Row title="Not paid yet" value={journal === null ? '✓' : ''} onPress={() => setJournal(null)} testID="bought-pay-none" />
            <Body muted>Odoo makes the bill and marks it paid. Taxes and costs are worked out by Odoo.</Body>
          </Card>
        ) : (
          <Body muted>{offline ? 'No signal, so the way to pay can’t be read. The bill is left for Odoo.' : 'Odoo has no Accounting app, so no bill is made. The delivery is still received and the cost is updated.'}</Body>
        )}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {note ? <Body>{note}</Body> : null}
        <Button
          label="Save purchase"
          disabled={problems.length > 0 || done}
          busy={busy}
          testID="bought-save"
          onPress={async () => {
            if (!supplier) return;
            setBusy(true);
            setError('');
            const changes = boughtChanges(
              supplier,
              lines.map((l) => ({ productId: l.choice.id, name: l.choice.name, qty: toNum(l.qty), price: toNum(l.price), ...(l.uom ? { uomId: l.uom.id } : {}), lot: l.lot.trim(), useBy: l.useBy.trim() })),
              { billing, journalId: billing ? (journal === undefined ? null : journal) : null, date },
            );
            let at = 0;
            let queued = false;
            try {
              for (const ch of changes) {
                if ((await save(ch)).status === 'queued') queued = true;
                at++;
              }
              if (journal) AsyncStorage.setItem(JOURNAL_KEY, String(journal)).catch(() => undefined);
              setDone(true);
              setNote(queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : billing ? 'Done. Received in Odoo and the bill is made.' : 'Done. Received in Odoo.');
              setTimeout(onBack, 1500);
            } catch (e) {
              setError(at === 0 ? `Odoo said no: ${why(e)}` : `The order is saved in Odoo, but the next step failed: ${why(e)}. Finish it from Ordering ahead, Check in a delivery.`);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button label="Back" kind="plain" onPress={() => setView('main')} />
      </Screen>
    );

  const today = ymd(new Date());
  const hair = { height: 1, backgroundColor: colors.line };
  return (
    <Screen title="Bought ingredients" testID="bought-screen">
      <Card>
        <Row title="From" value={supplier?.name ?? 'Pick'} onPress={() => setView('supplier')} testID="bought-pick-supplier" />
        <View style={hair} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          <Text style={ui.rowTitle}>Date{date === today ? ' (today)' : ''}</Text>
          <TextInput value={date} onChangeText={setDate} style={[ui.rowValue, { minWidth: 120, paddingVertical: 6 }]} accessibilityLabel="Date" testID="bought-date" autoCorrect={false} />
        </View>
      </Card>
      <SectionLabel>What you bought</SectionLabel>
      <Card>
        {lines.map((l, i) => (
          <View key={l.key}>
            {i > 0 ? <View style={hair} /> : null}
            <Pressable onPress={() => { setEditKey(l.key); setView('edit'); }} accessibilityRole="button" accessibilityLabel={`Edit ${l.choice.name}`} testID={`bought-line-${l.key}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={ui.rowTitle} numberOfLines={1}>{l.choice.name}</Text>
                <Text style={ui.muted} numberOfLines={1}>{`${l.qty} × ${l.uom?.name || l.choice.unit || 'unit'}${l.price ? ` · ${l.price} each` : ''}`}</Text>
              </View>
              <Text style={[ui.rowTitle, { fontVariant: ['tabular-nums'] }]}>{l.price ? money(l) : '?'}</Text>
              <Text style={ui.rowValue}>›</Text>
            </Pressable>
          </View>
        ))}
        {lines.length ? <View style={hair} /> : null}
        <Pressable onPress={() => setView('ingredient')} accessibilityRole="button" accessibilityLabel="Add an item" testID="bought-add" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.accent, fontSize: 17, fontWeight: '800' }}>+ Add an item</Text>
        </Pressable>
        {lines.length ? (
          <>
            <View style={hair} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={ui.rowTitle}>Total</Text>
              <Text style={ui.rowTitle} testID="bought-running-total">{fmtQty(total)}</Text>
            </View>
          </>
        ) : null}
      </Card>
      {problems.length ? <Body muted>{problems[0]}{problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}</Body> : null}
      <Button label="Check and save" disabled={problems.length > 0} onPress={() => setView('check')} testID="bought-next" />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

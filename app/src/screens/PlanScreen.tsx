import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen, Segments, SwitchRow } from '../components/ui';
import { loadNeedRows, loadPlanned, loadShoppingList, NeedRow, planBatchChange, planNeeds, PlanLine, ShopRow } from '../lib/plan';
import { fmtQty, Recipe, startBatchChange } from '../lib/production';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ticksKey = (db: string) => `shopping/ticks/${db}`;

/** Plan batches (what is needed, on hand, on order) and the Shopping list that follows from it. */
export function PlanScreen({ recipes, start, onBack }: { recipes: Recipe[]; start: 'plan' | 'shop'; onBack: () => void }) {
  const [tab, setTab] = useState<'plan' | 'shop'>(start);
  return tab === 'plan' ? <Plan recipes={recipes} tab={tab} setTab={setTab} onBack={onBack} /> : <Shopping recipes={recipes} tab={tab} setTab={setTab} onBack={onBack} />;
}

type TabProps = { recipes: Recipe[]; tab: 'plan' | 'shop'; setTab: (t: 'plan' | 'shop') => void; onBack: () => void };
const TABS = [
  { id: 'plan' as const, label: 'Plan batches' },
  { id: 'shop' as const, label: 'Shopping list' },
];

function Plan({ recipes, tab, setTab, onBack }: TabProps) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [plan, setPlan] = useState<PlanLine[]>([]);
  const [adding, setAdding] = useState<Recipe | null>(null);
  const [qty, setQty] = useState('');
  const [rows, setRows] = useState<NeedRow[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const needs = useMemo(() => planNeeds(plan), [plan]);

  useEffect(() => {
    if (!client || offline || !needs.length) {
      setRows([]);
      return;
    }
    loadNeedRows(client, needs).then(setRows).catch((e) => setError(`Couldn’t read stock. ${why(e)}`));
  }, [client, offline, needs]);

  const run = async (make: (p: PlanLine) => ReturnType<typeof planBatchChange>, done: string) => {
    setBusy(true);
    setError('');
    try {
      let queued = false;
      for (const p of plan) if ((await save(make(p))).status === 'queued') queued = true;
      setPlan([]);
      setNote(queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : done);
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (adding)
    return (
      <Screen title={adding.name} testID="plan-add">
        <Field label={`How many ${adding.unit || 'to make'}`} value={qty} onChangeText={setQty} keyboardType="decimal-pad" testID="plan-qty" />
        <Button
          label="Add to the plan"
          disabled={!(Number(qty.replace(',', '.')) > 0)}
          onPress={() => {
            setPlan([...plan, { recipe: adding, qty: Number(qty.replace(',', '.')) }]);
            setAdding(null);
            setQty('');
          }}
          testID="plan-add-ok"
        />
        <Button label="Back" kind="plain" onPress={() => setAdding(null)} />
      </Screen>
    );

  const short = rows.filter((r) => r.short > 0);
  return (
    <Screen title="Plan batches" testID="plan-screen">
      <Segments options={TABS} value={tab} onChange={setTab} testID="plan-tabs" />
      {note ? <Body>{note}</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card title="Batches in this plan">
        {!plan.length ? <Body muted>Nothing yet. Pick a recipe below.</Body> : null}
        {plan.map((p, i) => (
          <Row key={i} title={`${fmtQty(p.qty)} ${p.recipe.name}`} detail="Tap to take it out" onPress={() => setPlan(plan.filter((_, j) => j !== i))} testID={`plan-line-${i}`} />
        ))}
      </Card>
      {plan.length && !offline ? (
        <Card title={short.length ? 'Short for this plan' : 'What it needs'} testID="plan-needs">
          {rows.map((r) => (
            <Row key={r.productId} title={r.name} detail={`Needs ${fmtQty(r.needed)} · have ${fmtQty(r.have)} · on order ${fmtQty(r.onOrder)}${r.packaging ? ' · packaging' : ''}`} value={r.short > 0 ? `Buy ${fmtQty(r.short)} ${r.unit}`.trim() : 'OK'} testID={`need-${r.productId}`} />
          ))}
        </Card>
      ) : null}
      {plan.length ? (
        <>
          <Button label="Save as planned batches" onPress={() => run((p) => planBatchChange(p.recipe, p.qty), 'Saved as planned batches in Odoo.')} busy={busy} testID="plan-save" />
          <Button label="Start them all now" kind="plain" onPress={() => run((p) => startBatchChange(p.recipe, p.qty), 'Started in Odoo.')} busy={busy} testID="plan-start" />
        </>
      ) : null}
      <Card title="Add a batch">
        {recipes.map((r) => (
          <Row key={r.id} title={r.name} detail={`Recipe makes ${fmtQty(r.makes)} ${r.unit}`.trim()} onPress={() => setAdding(r)} testID={`plan-recipe-${r.id}`} />
        ))}
        {!recipes.length ? <Body muted>No recipes yet.</Body> : null}
      </Card>
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function Shopping({ recipes, tab, setTab, onBack }: TabProps) {
  const { client, db, offline } = useOdoo();
  const [list, setList] = useState<ShopRow[] | null>(null);
  const [ticked, setTicked] = useState<number[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!client || offline) return;
    (async () => {
      const planned = await loadPlanned(client, recipes);
      const rows = await loadNeedRows(client, planNeeds(planned));
      setList(await loadShoppingList(client, rows));
    })().catch((e) => setError(`Couldn’t build the list from Odoo. ${why(e)}`));
  }, [client, offline, recipes]);

  useEffect(() => {
    if (!db) return;
    AsyncStorage.getItem(ticksKey(db)).then((raw) => raw && setTicked(JSON.parse(raw) as number[])).catch(() => undefined);
  }, [db]);

  const tick = (id: number, on: boolean) => {
    const next = on ? [...ticked, id] : ticked.filter((x) => x !== id);
    setTicked(next);
    if (db) AsyncStorage.setItem(ticksKey(db), JSON.stringify(next)).catch(() => undefined);
  };

  const groups = [...new Set((list ?? []).map((r) => r.supplier))];
  return (
    <Screen title="Shopping list" testID="shop-screen">
      <Segments options={TABS} value={tab} onChange={setTab} testID="plan-tabs" />
      {offline ? <Body muted>No signal. The list is made from Odoo, so it shows when the phone is back online.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {list && !list.length ? <Body muted>Nothing to buy: the planned batches have what they need and nothing is running low.</Body> : null}
      {groups.map((g) => (
        <Card key={g || 'none'} title={g || 'No usual supplier'}>
          {list!.filter((r) => r.supplier === g).map((r) => (
            <SwitchRow key={r.productId} title={`${r.name}: ${fmtQty(r.buy)} ${r.unit}`.trim()} detail={r.why} value={ticked.includes(r.productId)} onChange={(v) => tick(r.productId, v)} testID={`shop-${r.productId}`} />
          ))}
        </Card>
      ))}
      <Body muted>Ticks stay on this phone. When you buy, use Bought ingredients under Ingredients.</Body>
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

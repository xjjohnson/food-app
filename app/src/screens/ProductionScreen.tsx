import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, Chip, ErrorText, Field, Row, Screen } from '../components/ui';
import { PRODUCTION_SECTIONS } from '../lib/forms';
import { GenericForm } from './GenericForm';
import {
  addDays,
  Batch,
  BatchDetail,
  finishBatchChanges,
  findLot,
  fmtQty,
  isDate,
  loadBatchDetail,
  loadBatches,
  loadFreeStock,
  loadRecipes,
  Recipe,
  shelfLifeDays,
  shortages,
  shortIngredients,
  needed,
  startBatchChange,
  stateLabel,
  suggestBatchNumber,
} from '../lib/production';
import { RecipesScreen } from './RecipesScreen';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Copy {
  open: Batch[];
  done: Batch[];
  recipes: Recipe[];
}

const copyKey = (db: string) => `production/v1/${db}`;

type View_ = { page: 'list' } | { page: 'recipes' } | { page: 'start' } | { page: 'batch'; id: number };

/** Production: today's batches, start a batch, finish it with a batch number and use-by date. */
export function ProductionScreen() {
  const { client, db, offline } = useOdoo();
  const [view, setView] = useState<View_>({ page: 'list' });
  const [data, setData] = useState<Copy | null>(null);
  const [fromPhone, setFromPhone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!db) return;
    setError('');
    if (client && !offline) {
      setBusy(true);
      try {
        const [b, recipes] = await Promise.all([loadBatches(client), loadRecipes(client)]);
        const fresh = { ...b, recipes };
        setData(fresh);
        setFromPhone(false);
        // A copy for when there is no signal. Odoo stays the source of truth.
        await AsyncStorage.setItem(copyKey(db), JSON.stringify(fresh));
        return;
      } catch (e) {
        setError(`Couldn’t read from Odoo. ${why(e)}`);
      } finally {
        setBusy(false);
      }
    }
    try {
      const raw = await AsyncStorage.getItem(copyKey(db));
      if (raw) {
        setData(JSON.parse(raw) as Copy);
        setFromPhone(true);
      }
    } catch {
      // No copy: the screen says so.
    }
  }, [client, db, offline]);

  useEffect(() => {
    load();
  }, [load]);

  if (view.page === 'recipes') return <RecipesScreen onBack={() => { setView({ page: 'list' }); load(); }} />;
  if (view.page === 'start')
    return <StartBatch recipes={data?.recipes ?? []} onBack={() => setView({ page: 'list' })} onSaved={() => { setView({ page: 'list' }); load(); }} />;
  if (view.page === 'batch') {
    const known = [...(data?.open ?? []), ...(data?.done ?? [])].find((b) => b.id === view.id);
    return <BatchPage id={view.id} known={known} onBack={() => { setView({ page: 'list' }); load(); }} />;
  }

  return (
    <Screen title="Production" testID="production-screen">
      <Button label="Start a batch" onPress={() => setView({ page: 'start' })} disabled={!data?.recipes.length} testID="start-batch" />
      {fromPhone ? <Body muted>No signal. Showing what the phone saw last. Anything you save waits and goes to Odoo when signal is back.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {data && !data.recipes.length ? <Body muted>Odoo has no recipes yet. Add one in Odoo: Manufacturing, Products, Bills of Materials.</Body> : null}
      <Card title="Batches in progress">
        {!data ? <Body muted>{busy ? 'Loading…' : 'Nothing to show yet. Connect to Odoo to load batches.'}</Body> : null}
        {data && !data.open.length ? <Body muted>No batches in progress.</Body> : null}
        {data?.open.map((b) => (
          <Row key={b.id} title={`${fmtQty(b.qty)} ${b.product}`} detail={`${b.name} · ${stateLabel(b.state)}`} onPress={() => setView({ page: 'batch', id: b.id })} testID={`batch-${b.id}`} />
        ))}
      </Card>
      {data?.done.length ? (
        <Card title="Finished lately">
          {data.done.map((b) => (
            <Row key={b.id} title={`${fmtQty(b.qty)} ${b.product}`} detail={b.name} onPress={() => setView({ page: 'batch', id: b.id })} testID={`batch-${b.id}`} />
          ))}
        </Card>
      ) : null}
      <Row title="Recipes" detail="Change a recipe or make a new one" onPress={() => setView({ page: 'recipes' })} testID="open-recipes" />
      <Button label="Refresh" kind="plain" onPress={load} busy={busy} />
    </Screen>
  );
}

function StartBatch({ recipes, onBack, onSaved }: { recipes: Recipe[]; onBack: () => void; onSaved: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [qtyText, setQtyText] = useState('');
  const [free, setFree] = useState<Record<number, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const qty = Number(qtyText.replace(',', '.'));
  const okQty = Number.isFinite(qty) && qty > 0;

  const pick = async (r: Recipe) => {
    setRecipe(r);
    setQtyText(fmtQty(r.makes));
    setFree(null);
    if (client && !offline) {
      try {
        setFree(await loadFreeStock(client, r.lines.map((l) => l.productId)));
      } catch {
        // Not knowing stock is not a reason to stop the batch.
      }
    }
  };

  if (!recipe)
    return (
      <Screen title="Start a batch" testID="start-screen">
        <Body>Pick what you are making.</Body>
        {recipes.map((r) => (
          <Row key={r.id} title={r.name} detail={`Recipe makes ${fmtQty(r.makes)} ${r.unit}`.trim()} onPress={() => pick(r)} testID={`recipe-${r.id}`} />
        ))}
        <Button label="Back" kind="plain" onPress={onBack} />
      </Screen>
    );

  const short = okQty && free ? shortages(recipe, qty, free) : [];
  return (
    <Screen title={recipe.name} testID="start-screen">
      <Field label={`How many ${recipe.unit || 'to make'}`} value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" testID="batch-qty" />
      <Card title="Ingredients for this batch">
        {okQty ? needed(recipe, qty).map((l) => <Row key={l.productId} title={l.name} value={fmtQty(l.qty)} />) : <Body muted>Type how many to see the ingredients.</Body>}
      </Card>
      {short.length ? (
        <Card title="Not enough in stock" testID="short-warning">
          {short.map((s) => (
            <Body key={s.name}>{`${s.name}: need ${fmtQty(s.needed)}, have ${fmtQty(s.have)}`}</Body>
          ))}
          <Body muted>You can still start the batch. Odoo keeps it waiting for the missing ingredients.</Body>
        </Card>
      ) : null}
      {!free && okQty ? <Body muted>Stock levels aren’t loaded, so the app can’t check for shortages.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Start batch"
        disabled={!okQty || !!note}
        busy={busy}
        testID="confirm-start"
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            const r = await save(startBatchChange(recipe, qty));
            if (r.status === 'queued') {
              setNote('Saved on the phone. It goes to Odoo when signal is back.');
              setTimeout(onSaved, 1500);
            } else onSaved();
          } catch (e) {
            setError(`Odoo said no: ${why(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button label="Back" kind="plain" onPress={() => setRecipe(null)} />
    </Screen>
  );
}

function BatchPage({ id, known, onBack }: { id: number; known?: Batch; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [d, setD] = useState<BatchDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lot, setLot] = useState('');
  const [useBy, setUseBy] = useState('');
  const [days, setDays] = useState<number | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    if (!client || offline) return;
    try {
      const detail = await loadBatchDetail(client, id);
      setD(detail);
      if (detail) {
        setLot((x) => x || suggestBatchNumber(detail.name));
        const n = await shelfLifeDays(client, detail.productId);
        setDays(n);
        if (n) setUseBy((x) => x || addDays(new Date(), n));
      }
    } catch (e) {
      setError(`Couldn’t read this batch from Odoo. ${why(e)}`);
    }
  }, [client, offline, id]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = d ?? (known ? { ...known, ingredients: [], lots: [], canRecordLot: true } : null);
  if (!shown)
    return (
      <Screen title="Batch" testID="batch-screen">
        <Body muted>{offline ? 'No signal, so this batch can’t be opened yet.' : 'Loading…'}</Body>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Back" kind="plain" onPress={onBack} />
      </Screen>
    );

  if (all) return <GenericForm model="mrp.production" recordId={id} title="Batch" noun="Batch" sections={PRODUCTION_SECTIONS} uniqueField="origin" testID="batch-all-form" onBack={() => { setAll(false); load(); }} />;

  const short = d ? shortIngredients(d) : [];
  const canFinish = shown.state === 'confirmed' || shown.state === 'progress' || shown.state === 'to_close';
  const okDate = isDate(useBy);
  const ready = canFinish && !!d && d.canRecordLot && lot.trim().length > 0 && okDate && !note;

  return (
    <Screen title={`${fmtQty(shown.qty)} ${shown.product}`} testID="batch-screen">
      <Chip label={`${shown.name} · ${stateLabel(shown.state)}`} testID="batch-state" />
      {!offline ? <Button label="All batch details" kind="plain" onPress={() => setAll(true)} testID="batch-all" /> : null}
      {offline ? <Body muted>No signal. The ingredient list shows when the phone is back online.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {short.length ? (
        <Card title="Short on ingredients" testID="batch-short">
          {short.map((i) => (
            <Body key={i.id}>{`${i.name}: need ${fmtQty(i.needed)}`}</Body>
          ))}
        </Card>
      ) : null}
      {d ? (
        <Card title="Ingredients">
          {d.ingredients.length ? d.ingredients.map((i) => <Row key={i.id} title={i.name} value={fmtQty(i.needed)} />) : <Body muted>No ingredients on this batch.</Body>}
        </Card>
      ) : null}
      {shown.state === 'done' && d ? (
        <Card title="Batch number and use-by date">
          {d.lots.length ? d.lots.map((l) => <Row key={l.id} title={l.name} value={l.useBy || 'no date'} testID="finished-lot" />) : <Body muted>No batch number was recorded.</Body>}
        </Card>
      ) : null}
      {shown.state === 'draft' ? <Body muted>This batch is planned in Odoo but not started. Start it in Odoo, or make a new one here.</Body> : null}
      {canFinish && d ? (
        <Card title="Finish this batch">
          {!d.canRecordLot ? <ErrorText>This Odoo can’t record batch numbers on a batch. Turn on Lots and Serial Numbers in Odoo Inventory settings, then try again.</ErrorText> : null}
          <Field label="Batch number" value={lot} onChangeText={setLot} autoCapitalize="characters" testID="lot-name" />
          <Field label="Use by (year-month-day)" value={useBy} onChangeText={setUseBy} placeholder="2026-12-25" keyboardType="numbers-and-punctuation" testID="use-by" />
          {days === null ? <Body muted>This product has no shelf life in Odoo, so type the date. You can set it in Odoo on the product, Inventory tab.</Body> : null}
          {days ? <Body muted>{`Suggested from the product’s shelf life of ${days} days. Change it if you need to.`}</Body> : null}
          {useBy && !okDate ? <ErrorText>Use the form 2026-12-25.</ErrorText> : null}
          {note ? <Body>{note}</Body> : null}
          <Button
            label="Finish batch"
            disabled={!ready}
            busy={busy}
            testID="finish-batch"
            onPress={async () => {
              if (!client) return;
              setBusy(true);
              setError('');
              try {
                const name = lot.trim();
                const existing = await findLot(client, shown.productId, name);
                let queued = false;
                for (const change of finishBatchChanges(shown, name, useBy, shown.qty, existing)) {
                  const r = await save(change);
                  if (r.status === 'queued') queued = true;
                }
                if (queued) {
                  setNote('Saved on the phone. It goes to Odoo when signal is back.');
                  setTimeout(onBack, 1500);
                } else onBack();
              } catch (e) {
                setError(`Odoo said no: ${why(e)}`);
              } finally {
                setBusy(false);
              }
            }}
          />
        </Card>
      ) : null}
      <View />
      <Button label="Back to batches" kind="plain" onPress={onBack} />
    </Screen>
  );
}

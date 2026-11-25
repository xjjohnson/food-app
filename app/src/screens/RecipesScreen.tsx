import { useInnerBack } from '../lib/innerBack';
import { View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen, Segments } from '../components/ui';
import { loadUnits } from '../lib/ingredientList';
import { fmtQty, loadRecipes, Recipe as RecipeRow } from '../lib/production';
import { blankRecipe, BomType, loadRecipe, loadVariants, moveLine, newKey, newRecipeChange, productInfo, Recipe, recipeChanges, RecipeLine, recipeProblems, Unit } from '../lib/recipe';
import { ProductRow, searchProducts } from '../lib/stock';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { Choose } from './IngredientListScreen';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A small product picker: type, then tap a result. */
function ProductPicker({ title, onPick, onBack, markRecipes }: { title: string; onPick: (p: ProductRow) => void; onBack: () => void; markRecipes?: boolean }) {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [found, setFound] = useState<ProductRow[]>([]);
  useEffect(() => {
    if (!client || offline) return;
    const t = setTimeout(() => {
      searchProducts(client, text, markRecipes)
        .then(setFound)
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, markRecipes]);
  const some = found.some((p) => p.hasRecipe);
  return (
    <Screen title={title} testID="picker-screen">
      {offline ? <Body muted>No signal. Picking a product needs Odoo.</Body> : <Field label="Find a product" value={text} onChangeText={setText} testID="picker-search" />}
      {found.map((p, i) => (
        <View key={p.id}>
          {markRecipes && some && i === 0 && p.hasRecipe ? <Body muted>Already has a recipe</Body> : null}
          {markRecipes && p.hasRecipe === false && (i === 0 || found[i - 1]!.hasRecipe) ? <Body muted>{some ? 'No recipe yet' : 'No recipe yet. Pick what to make.'}</Body> : null}
          <Row title={p.name} detail={markRecipes && p.hasRecipe ? 'Has a recipe' : undefined} onPress={() => onPick(p)} testID={`pick-${p.id}`} />
        </View>
      ))}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/** Recipes: the list, and the full recipe form (also used to make a new one). */
export function RecipesScreen({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [list, setList] = useState<RecipeRow[] | null>(null);
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!client || offline) return;
    try {
      setList(await loadRecipes(client));
    } catch (e) {
      setError(`Couldn’t read recipes from Odoo. ${why(e)}`);
    }
  }, [client, offline]);
  useEffect(() => {
    load();
  }, [load]);
  useInnerBack(open !== null ? () => { setOpen(null); load(); } : null);

  if (open !== null)
    return (
      <RecipeForm
        id={open === 'new' ? null : open}
        onBack={() => {
          setOpen(null);
          load();
        }}
      />
    );
  return (
    <Screen title="Recipes" testID="recipes-screen">
      {offline ? <Body muted>No signal. Recipes come from Odoo, so they show when the phone is back online.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="New recipe" onPress={() => setOpen('new')} disabled={offline} testID="new-recipe" />
      {list?.map((r) => (
        <Row key={r.id} title={r.name} detail={`Makes ${fmtQty(r.makes)} ${r.unit} · ${r.lines.length} ingredients`.replace('  ', ' ')} onPress={() => setOpen(r.id)} testID={`recipe-edit-${r.id}`} />
      ))}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

type Section = 'lines' | 'byproducts';
type Picking = null | { k: 'product' } | { k: 'variant' } | { k: 'unit' } | { k: 'lineUnit'; section: Section; key: string } | { k: 'add'; section: Section };

function RecipeForm({ id, onBack }: { id: number | null; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [before, setBefore] = useState<Recipe | null>(null);
  const [draft, setDraft] = useState<Recipe>(blankRecipe());
  const [units, setUnits] = useState<Unit[]>([]);
  const [variants, setVariants] = useState<Unit[]>([]);
  const [picking, setPicking] = useState<Picking>(id ? null : { k: 'product' });
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useInnerBack(picking && draft.templateId ? () => setPicking(null) : null);

  const load = useCallback(async () => {
    if (!client || offline) return;
    try {
      setUnits(await loadUnits(client));
      if (id) {
        const r = await loadRecipe(client, id);
        if (r) {
          setBefore(r);
          setDraft(r);
          setVariants(await loadVariants(client, r.templateId));
        }
      }
    } catch (e) {
      setError(`Couldn’t read this recipe. ${why(e)}`);
    }
  }, [client, offline, id]);
  useEffect(() => {
    load();
  }, [load]);

  const set = (patch: Partial<Recipe>) => setDraft((d) => ({ ...d, ...patch }));
  const setLine = (section: Section, key: string, patch: Partial<RecipeLine>) => setDraft((d) => ({ ...d, [section]: d[section].map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const changes = before ? recipeChanges(before, draft) : [];
  const problems = recipeProblems(draft);

  if (picking?.k === 'product')
    return (
      <ProductPicker
        title="What does it make?"
        markRecipes
        onBack={() => (draft.templateId ? setPicking(null) : onBack())}
        onPick={async (p) => {
          if (!client) return;
          const info = await productInfo(client, p.id);
          set({ templateId: info.templateId, templateName: info.templateName, variantId: p.id, variantName: info.name, unitId: info.unit.id, unit: info.unit.name });
          setVariants(await loadVariants(client, info.templateId));
          setPicking(null);
        }}
      />
    );
  if (picking?.k === 'add')
    return (
      <ProductPicker
        title={picking.section === 'lines' ? 'Add an ingredient' : 'Add a by-product'}
        onBack={() => setPicking(null)}
        onPick={async (p) => {
          if (!client) return;
          const info = await productInfo(client, p.id);
          const line: RecipeLine = { key: newKey(), id: null, productId: p.id, name: p.name, qty: '', unitId: info.unit.id, unit: info.unit.name, ...(picking.section === 'byproducts' ? { costShare: '' } : {}) };
          setDraft((d) => ({ ...d, [picking.section]: [...d[picking.section], line] }));
          setPicking(null);
        }}
      />
    );
  if (picking?.k === 'variant')
    return (
      <Choose
        title="Product variant"
        items={[{ id: 0, name: 'Any variant' }, ...variants]}
        onPick={(v) => {
          set({ variantId: v.id, variantName: v.id ? v.name : '' });
          setPicking(null);
        }}
        onBack={() => setPicking(null)}
      />
    );
  if (picking?.k === 'unit' || picking?.k === 'lineUnit') {
    const target = picking;
    return (
      <Choose
        title="Unit"
        items={units}
        onPick={(u) => {
          if (target.k === 'unit') set({ unitId: u.id, unit: u.name });
          else setLine(target.section, target.key, { unitId: u.id, unit: u.name });
          setPicking(null);
        }}
        onBack={() => setPicking(null)}
      />
    );
  }

  if (id && !before)
    return (
      <Screen title="Recipe" testID="recipe-editor">
        {error ? <ErrorText>{error}</ErrorText> : <Body muted>{offline ? 'No signal, so this recipe can’t be opened yet.' : 'Loading…'}</Body>}
        <Button label="Back" kind="plain" onPress={onBack} />
      </Screen>
    );

  const lineCards = (section: Section) =>
    draft[section].map((l, i) => (
      <Card key={l.key} testID={`${section}-${i}`}>
        <Body>{l.name}</Body>
        <Field label="Amount" value={l.qty} onChangeText={(v) => setLine(section, l.key, { qty: v })} keyboardType="decimal-pad" testID={`line-qty-${l.id ?? l.key}`} />
        <Row title="Unit" value={l.unit || 'Choose'} onPress={() => setPicking({ k: 'lineUnit', section, key: l.key })} testID={`line-unit-${l.id ?? l.key}`} />
        {section === 'byproducts' ? <Field label="Share of the cost, percent" value={l.costShare ?? ''} onChangeText={(v) => setLine(section, l.key, { costShare: v })} keyboardType="decimal-pad" testID={`line-share-${l.id ?? l.key}`} /> : null}
        {section === 'lines' ? (
          <>
            <Button label="Move up" kind="plain" disabled={i === 0} onPress={() => setDraft((d) => ({ ...d, lines: moveLine(d.lines, i, -1) }))} testID={`up-${l.id ?? l.key}`} />
            <Button label="Move down" kind="plain" disabled={i === draft.lines.length - 1} onPress={() => setDraft((d) => ({ ...d, lines: moveLine(d.lines, i, 1) }))} testID={`down-${l.id ?? l.key}`} />
          </>
        ) : null}
        <Button label="Remove" kind="danger" onPress={() => setDraft((d) => ({ ...d, [section]: d[section].filter((x) => x.key !== l.key) }))} testID={`remove-line-${l.id ?? l.key}`} />
      </Card>
    ));

  const canSave = !problems.length && !note && (id ? changes.length > 0 : true);
  return (
    <Screen title={draft.variantName || draft.templateName || 'New recipe'} testID="recipe-editor">
      <Row title="Product" value={draft.templateName || 'Choose'} onPress={id ? undefined : () => setPicking({ k: 'product' })} testID="recipe-product" />
      {variants.length > 1 || draft.variantId ? <Row title="Product variant" value={draft.variantName || 'Any variant'} onPress={() => setPicking({ k: 'variant' })} testID="recipe-variant" /> : null}
      <Field label="Makes" value={draft.makes} onChangeText={(v) => set({ makes: v })} keyboardType="decimal-pad" testID="recipe-makes" />
      <Row title="Unit it makes" value={draft.unit || 'Choose'} onPress={() => setPicking({ k: 'unit' })} testID="recipe-unit" />
      <Field label="Reference (optional)" value={draft.code} onChangeText={(v) => set({ code: v })} testID="recipe-code" />
      <Body>Type of recipe</Body>
      <Segments<BomType> options={[{ id: 'normal', label: 'Made here' }, { id: 'phantom', label: 'Kit' }]} value={draft.type} onChange={(t) => set({ type: t })} testID="recipe-type" />
      <Card title="Ingredients">
        {lineCards('lines')}
        {!draft.lines.length ? <Body muted>No ingredients yet.</Body> : null}
        <Button label="Add an ingredient" kind="plain" onPress={() => setPicking({ k: 'add', section: 'lines' })} testID="pick-ingredient" />
      </Card>
      <Card title="By-products">
        {lineCards('byproducts')}
        {!draft.byproducts.length ? <Body muted>None.</Body> : null}
        <Button label="Add a by-product" kind="plain" onPress={() => setPicking({ k: 'add', section: 'byproducts' })} testID="pick-byproduct" />
      </Card>
      {problems.map((p) => (
        <Body key={p} muted>
          {p}
        </Body>
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Body muted>Batches already started keep the amounts they had.</Body>
      <Button
        label={id ? (changes.length ? `Save ${changes.length} change${changes.length > 1 ? 's' : ''}` : 'Nothing changed') : 'Save recipe'}
        disabled={!canSave}
        busy={busy}
        testID="save-recipe"
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            let queued = false;
            for (const ch of before ? changes : [newRecipeChange(draft)]) if ((await save(ch)).status === 'queued') queued = true;
            setNote(queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
            setTimeout(onBack, 1000);
          } catch (e) {
            setError(`Odoo said no: ${why(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      {before && changes.length ? <Button label="Discard my changes" kind="plain" onPress={() => setDraft(before)} testID="discard-recipe" /> : null}
      <Button label="Back to recipes" kind="plain" onPress={onBack} />
    </Screen>
  );
}

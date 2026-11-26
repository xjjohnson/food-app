import { useInnerBack, useLeaveAtBase } from '../lib/innerBack';
import { TestsPage, VersionBox } from './MakingPages';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, LookScope, Row, Screen, Segments, SwitchRow } from '../components/ui';
import { IngredientForm } from './IngredientListScreen';
import { ProductForm } from './ProductForm';
import { loadUnits } from '../lib/ingredientList';
import { fmtQty, loadRecipes, Recipe as RecipeRow } from '../lib/production';
import { KitRow, loadKits } from '../lib/recipe';
import { blankRecipe, BomType, loadRecipe, loadVariants, moveLine, newKey, newRecipeChange, productInfo, Recipe, recipeChanges, RecipeLine, recipeProblems, Unit } from '../lib/recipe';
import { ProductRow, searchProducts } from '../lib/stock';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useRoles } from '../lib/useRoles';
import { Choose } from './IngredientListScreen';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * A small product picker: type, then tap a result. For ingredients (`raw`) it
 * lists raw materials only, with a switch for every product and a button to
 * add an ingredient that isn't there yet.
 */
function ProductPicker({ title, onPick, onBack, markRecipes, raw }: { title: string; onPick: (p: ProductRow) => void; onBack: () => void; markRecipes?: boolean; raw?: boolean }) {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [found, setFound] = useState<ProductRow[]>([]);
  const [everything, setEverything] = useState(false);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState('');
  useInnerBack(adding ? () => setAdding(false) : null);
  useEffect(() => {
    if (!client || offline) return;
    const t = setTimeout(() => {
      searchProducts(client, text, markRecipes, !!raw && !everything)
        .then(setFound)
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, markRecipes, raw, everything]);
  const some = found.some((p) => p.hasRecipe);

  if (adding)
    return (
      <IngredientForm
        id={null}
        defaultCategory={null}
        onCreated={setCreated}
        onBack={async () => {
          setAdding(false);
          if (!client || !created) return;
          // The new ingredient is picked for the recipe when Odoo has it.
          const hits = await searchProducts(client, created, false, true).catch(() => []);
          const exact = hits.filter((h) => h.name === created);
          if (exact.length === 1) onPick(exact[0]!);
          else setText(created);
        }}
      />
    );

  return (
    <Screen title={title} testID="picker-screen">
      {offline ? <Body muted>No signal. Picking a product needs Odoo.</Body> : <Field label="Find a product" value={text} onChangeText={setText} testID="picker-search" />}
      {raw ? <Button label="Add a new ingredient" kind="plain" onPress={() => setAdding(true)} disabled={offline} testID="picker-add-new" /> : null}
      {raw ? <SwitchRow title="Show all products" detail={everything ? 'Finished products too' : 'Raw materials only'} value={everything} onChange={setEverything} testID="picker-all" /> : null}
      {found.map((p, i) => (
        <View key={p.id}>
          {markRecipes && some && i === 0 && p.hasRecipe ? <Body muted>Already has a recipe</Body> : null}
          {markRecipes && p.hasRecipe === false && (i === 0 || found[i - 1]!.hasRecipe) ? <Body muted>{some ? 'No recipe yet' : 'No recipe yet. Pick what to make.'}</Body> : null}
          <Row title={p.name} detail={markRecipes && p.hasRecipe ? 'Has a recipe' : undefined} onPress={() => onPick(p)} testID={`pick-${p.id}`} />
        </View>
      ))}
      {raw && !found.length && !offline ? <Body muted>No raw materials found. Add a new ingredient, or show all products.</Body> : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/** The recipe box. Recipe pages have the cookbook look. `openId` opens one recipe straight away. */
export function RecipesScreen({ onBack, openId }: { onBack: () => void; openId?: number }) {
  return (
    <LookScope look="cookbook">
      <RecipesInner onBack={onBack} openId={openId} />
    </LookScope>
  );
}

function RecipesInner({ onBack, openId }: { onBack: () => void; openId?: number }) {
  const { client, offline } = useOdoo();
  const [list, setList] = useState<RecipeRow[] | null>(null);
  const [open, setOpen] = useState<number | 'new' | 'newkit' | null>(openId ?? null);
  const [product, setProduct] = useState<number | null>(null);
  const [view, setView] = useState<'recipes' | 'kits'>('recipes');
  const [tests, setTests] = useState(false);
  const { roles } = useRoles();
  const [kits, setKits] = useState<KitRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!client || offline) return;
    try {
      setList(await loadRecipes(client));
      setKits(await loadKits(client).catch(() => []));
    } catch (e) {
      setError(`Couldn’t read recipes from Odoo. ${why(e)}`);
    }
  }, [client, offline]);
  useEffect(() => {
    load();
  }, [load]);
  useLeaveAtBase(openId !== undefined, open === null && product === null && !tests);
  useInnerBack(product !== null ? () => setProduct(null) : tests ? () => setTests(false) : open !== null ? () => { setOpen(null); load(); } : null);

  if (product !== null) return <ProductForm templateId={product} onBack={() => setProduct(null)} onRecipe={() => setProduct(null)} />;
  if (tests) return <TestsPage onBack={() => setTests(false)} />;
  if (open !== null)
    return (
      <RecipeForm
        id={open === 'new' || open === 'newkit' ? null : open}
        kit={open === 'newkit'}
        onProduct={setProduct}
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
      <Segments<'recipes' | 'kits'> options={[{ id: 'recipes', label: 'Recipes' }, { id: 'kits', label: 'Gift boxes' }]} value={view} onChange={setView} testID="recipes-view" />
      {view === 'kits' ? (
        <>
          <Body muted>A gift box is a kit: selling one uses up its parts, so nothing is stocked ahead.</Body>
          <Button label="New gift box" onPress={() => setOpen('newkit')} disabled={offline} testID="new-kit" />
          {kits?.map((k) => (
            <Row key={k.id} title={k.name} detail={k.parts.join(', ') || 'Empty'} onPress={() => setOpen(k.id)} testID={`kit-edit-${k.id}`} />
          ))}
          {kits && !kits.length ? <Body muted>No gift boxes yet.</Body> : null}
        </>
      ) : (
        <>
      <Button label="New recipe" onPress={() => setOpen('new')} disabled={offline} testID="new-recipe" />
      {roles.owner ? <Button label="Recipe tests" kind="plain" onPress={() => setTests(true)} testID="open-tests" /> : null}
      {list?.map((r) => (
        <Row key={r.id} title={r.name} detail={`Makes ${fmtQty(r.makes)} ${r.unit} · ${r.lines.length} ingredients`.replace('  ', ' ')} onPress={() => setOpen(r.id)} testID={`recipe-edit-${r.id}`} />
      ))}
        </>
      )}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

type Section = 'lines' | 'byproducts';
type Picking = null | { k: 'product' } | { k: 'variant' } | { k: 'unit' } | { k: 'lineUnit'; section: Section; key: string } | { k: 'add'; section: Section };

function RecipeForm({ id, kit, onBack, onProduct }: { id: number | null; kit?: boolean; onBack: () => void; onProduct?: (templateId: number) => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [before, setBefore] = useState<Recipe | null>(null);
  const [draft, setDraft] = useState<Recipe>(kit ? { ...blankRecipe(), type: 'phantom' } : blankRecipe());
  const [units, setUnits] = useState<Unit[]>([]);
  const [variants, setVariants] = useState<Unit[]>([]);
  const [picking, setPicking] = useState<Picking>(id ? null : { k: 'product' });
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [versioning, setVersioning] = useState(false);
  const { roles: formRoles } = useRoles();
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
        raw={picking.section === 'lines'}
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

  if (versioning && before && id) return <VersionBox recipe={{ id, name: draft.variantName || draft.templateName }} onBack={() => setVersioning(false)} onDone={onBack} />;
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
      {id && draft.templateId && onProduct ? <Row title="Product page" detail="Price, photos, stock and shop switches" onPress={() => onProduct(draft.templateId)} testID="recipe-product-page" /> : null}
      {id && !kit ? <Button label="Cook a batch" onPress={() => router.push(`/area/production?go=start:${id}`)} testID="recipe-cook" /> : null}
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
      {id && before && formRoles.owner && !kit ? <Button label="Save as new version" kind="plain" onPress={() => setVersioning(true)} testID="new-version" /> : null}
      <Button label="Back to recipes" kind="plain" onPress={onBack} />
    </Screen>
  );
}

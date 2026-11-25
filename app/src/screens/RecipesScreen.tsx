import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen } from '../components/ui';
import { addLineChange, loadRecipeDetail, newRecipeChange, RecipeDetail, removeLineChange, setLineQtyChange, setRecipeMakesChange } from '../lib/edit';
import { fmtQty, loadRecipes, Recipe } from '../lib/production';
import { ProductRow, searchProducts } from '../lib/stock';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toNum = (t: string) => Number(t.replace(',', '.'));
const okNum = (t: string) => t.trim() !== '' && Number.isFinite(toNum(t)) && toNum(t) > 0;

/** A small product picker: type, then tap a result. */
function ProductPicker({ title, onPick, onBack }: { title: string; onPick: (p: ProductRow) => void; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [found, setFound] = useState<ProductRow[]>([]);
  useEffect(() => {
    if (!client || offline) return;
    const t = setTimeout(() => {
      searchProducts(client, text)
        .then(setFound)
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text]);
  return (
    <Screen title={title} testID="picker-screen">
      {offline ? <Body muted>No signal. Picking a product needs Odoo.</Body> : <Field label="Find a product" value={text} onChangeText={setText} testID="picker-search" />}
      {found.map((p) => (
        <Row key={p.id} title={p.name} onPress={() => onPick(p)} testID={`pick-${p.id}`} />
      ))}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/** Recipes: change how many one makes, change or add or remove ingredients, or make a new recipe. */
export function RecipesScreen({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [list, setList] = useState<Recipe[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
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

  if (open !== null)
    return (
      <RecipeEditor
        id={open}
        onBack={() => {
          setOpen(null);
          load();
        }}
      />
    );
  if (creating)
    return (
      <NewRecipe
        onBack={() => {
          setCreating(false);
          load();
        }}
      />
    );
  return (
    <Screen title="Recipes" testID="recipes-screen">
      {offline ? <Body muted>No signal. Recipes come from Odoo, so they show when the phone is back online.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="New recipe" onPress={() => setCreating(true)} disabled={offline} testID="new-recipe" />
      {list?.map((r) => (
        <Row key={r.id} title={r.name} detail={`Makes ${fmtQty(r.makes)} ${r.unit} · ${r.lines.length} ingredients`.replace('  ', ' ')} onPress={() => setOpen(r.id)} testID={`recipe-edit-${r.id}`} />
      ))}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function RecipeEditor({ id, onBack }: { id: number; onBack: () => void }) {
  const { client } = useOdoo();
  const { save } = useQueue();
  const [r, setR] = useState<RecipeDetail | null>(null);
  const [makes, setMakes] = useState('');
  const [qty, setQty] = useState<Record<number, string>>({});
  const [adding, setAdding] = useState<{ id: number; name: string } | null>(null);
  const [addQty, setAddQty] = useState('');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const d = await loadRecipeDetail(client, id);
      setR(d);
      if (d) {
        setMakes(fmtQty(d.makes));
        setQty(Object.fromEntries(d.lines.map((l) => [l.id, fmtQty(l.qty)])));
      }
    } catch (e) {
      setError(`Couldn’t read this recipe. ${why(e)}`);
    }
  }, [client, id]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (change: Parameters<typeof save>[0], done?: string) => {
    setError('');
    try {
      const out = await save(change);
      setNote(out.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : done ?? 'Saved in Odoo.');
      await load();
    } catch (e) {
      setError(`Odoo said no: ${why(e)}`);
    }
  };

  if (picking)
    return (
      <ProductPicker
        title="Add an ingredient"
        onBack={() => setPicking(false)}
        onPick={(p) => {
          setAdding(p);
          setAddQty('');
          setPicking(false);
        }}
      />
    );
  if (!r)
    return (
      <Screen title="Recipe" testID="recipe-editor">
        {error ? <ErrorText>{error}</ErrorText> : <Body muted>Loading…</Body>}
        <Button label="Back" kind="plain" onPress={onBack} />
      </Screen>
    );
  return (
    <Screen title={r.name} testID="recipe-editor">
      <Field label={`Makes how many ${r.unit}`.trim()} value={makes} onChangeText={setMakes} keyboardType="decimal-pad" testID="recipe-makes" />
      <Button label="Save amount" kind="plain" disabled={!okNum(makes) || toNum(makes) === r.makes} onPress={() => run(setRecipeMakesChange(r, toNum(makes)))} testID="save-makes" />
      <Card title="Ingredients">
        {r.lines.map((l) => (
          <Card key={l.id}>
            <Field label={l.name} value={qty[l.id] ?? ''} onChangeText={(v) => setQty({ ...qty, [l.id]: v })} keyboardType="decimal-pad" testID={`line-qty-${l.id}`} />
            <Button label="Save" kind="plain" disabled={!okNum(qty[l.id] ?? '') || toNum(qty[l.id]!) === l.qty} onPress={() => run(setLineQtyChange(r, l, toNum(qty[l.id]!)))} testID={`save-line-${l.id}`} />
            <Button label="Remove" kind="danger" onPress={() => run(removeLineChange(r, l))} testID={`remove-line-${l.id}`} />
          </Card>
        ))}
        {!r.lines.length ? <Body muted>No ingredients yet.</Body> : null}
      </Card>
      {adding ? (
        <Card title={`Add ${adding.name}`}>
          <Field label="How much" value={addQty} onChangeText={setAddQty} keyboardType="decimal-pad" testID="add-line-qty" />
          <Button
            label="Add to recipe"
            disabled={!okNum(addQty)}
            testID="add-line"
            onPress={async () => {
              await run(addLineChange(r, adding.id, adding.name, toNum(addQty)));
              setAdding(null);
            }}
          />
        </Card>
      ) : (
        <Button label="Add an ingredient" kind="plain" onPress={() => setPicking(true)} testID="pick-ingredient" />
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Body muted>Batches already started keep the amounts they had.</Body>
      <Button label="Back to recipes" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function NewRecipe({ onBack }: { onBack: () => void }) {
  const { client } = useOdoo();
  const { save } = useQueue();
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [makes, setMakes] = useState('');
  const [lines, setLines] = useState<{ productId: number; name: string; qty: string }[]>([]);
  const [picking, setPicking] = useState<'product' | 'line' | null>('product');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (picking)
    return (
      <ProductPicker
        title={picking === 'product' ? 'What does it make?' : 'Add an ingredient'}
        onBack={() => (product ? setPicking(null) : onBack())}
        onPick={(p) => {
          if (picking === 'product') setProduct(p);
          else setLines([...lines, { productId: p.id, name: p.name, qty: '' }]);
          setPicking(null);
        }}
      />
    );
  const ready = !!product && okNum(makes) && lines.length > 0 && lines.every((l) => okNum(l.qty));
  return (
    <Screen title={`New recipe: ${product?.name ?? ''}`} testID="new-recipe-screen">
      <Field label="Makes how many" value={makes} onChangeText={setMakes} keyboardType="decimal-pad" testID="new-makes" />
      {lines.map((l, i) => (
        <Field key={`${l.productId}-${i}`} label={`${l.name}: how much`} value={l.qty} onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: v } : x)))} keyboardType="decimal-pad" testID={`new-line-${i}`} />
      ))}
      <Button label="Add an ingredient" kind="plain" onPress={() => setPicking('line')} testID="new-add-ingredient" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Save recipe"
        disabled={!ready}
        busy={busy}
        testID="save-recipe"
        onPress={async () => {
          if (!client || !product) return;
          setBusy(true);
          setError('');
          try {
            await save(await newRecipeChange(client, product.id, product.name, toNum(makes), lines.map((l) => ({ productId: l.productId, qty: toNum(l.qty) }))));
            onBack();
          } catch (e) {
            setError(`Odoo said no: ${why(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button label="Cancel" kind="plain" onPress={onBack} />
    </Screen>
  );
}

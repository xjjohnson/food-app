import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Body, Button, Card, Field, LookScope, Row, Screen, Segments } from '../components/ui';
import { fmtQty, loadBatches, loadRecipes, qtyWords, Batch, Recipe, stateWithOdoo } from '../lib/production';
import { groupJars, JarRow, loadExpiring, loadInStock } from '../lib/stock';
import { tabAreas } from '../lib/tabs';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

type Seg = 'recipes' | 'batches' | 'jars';
type Stage = 'planned' | 'cooking' | 'ready' | 'done';
const STAGES: { id: Stage; label: string; states: string[] }[] = [
  { id: 'planned', label: 'Planned', states: ['draft', 'confirmed'] },
  { id: 'cooking', label: 'Cooking', states: ['progress'] },
  { id: 'ready', label: 'Ready to finish', states: ['to_close'] },
  { id: 'done', label: 'Finished', states: ['done'] },
];

/** The Make tab: the batches first, then the recipe box (cookbook look), then the jars in stock. */
export function MakeScreen() {
  const { client, offline } = useOdoo();
  const { roles } = useRoles();
  const areas = tabAreas('make', roles);
  const has = (id: string) => areas.some((a) => a.id === id);
  const first: Seg = has('production') ? 'batches' : 'jars';
  const [seg, setSeg] = useState<Seg>(first);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [jars, setJars] = useState<JarRow[] | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [jarText, setJarText] = useState('');
  const [stage, setStage] = useState<Stage | null>(null);

  // Read again every time the tab comes back into view, so a batch just started is there.
  useFocusEffect(
    useCallback(() => {
      if (!client || offline) return;
      if (has('production')) {
        loadRecipes(client).then(setRecipes).catch(() => setRecipes([]));
        loadBatches(client).then((b) => setBatches([...b.open, ...b.done])).catch(() => setBatches([]));
      }
      if (has('stock')) {
        Promise.all([loadInStock(client, '', 'made'), loadExpiring(client, 14).catch(() => [])])
          .then(([rows, soon]) => {
            const days = new Map<string, number>();
            for (const l of soon) if (!days.has(l.product) || l.days < days.get(l.product)!) days.set(l.product, l.days);
            const marked = rows.map((r) => ({ ...r, soon: days.get(r.name) }));
            setJars(marked);
          })
          .catch(() => setJars([]));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, offline, roles]),
  );

  // Ingredients are not jars: leave out anything a recipe uses as an ingredient.
  const ingredientIds = new Set((recipes ?? []).flatMap((r) => r.lines.map((l) => l.productId)));
  const shownJars = jars ? groupJars(jars, { ingredientIds, showEmpty, text: jarText }) : null;
  const inStage = (id: Stage) => (batches ?? []).filter((b) => STAGES.find((s) => s.id === id)!.states.includes(b.state));
  // The board opens on the first stage that has a batch.
  const activeStage: Stage = stage ?? STAGES.find((s) => inStage(s.id).length > 0)?.id ?? 'planned';

  const options: { id: Seg; label: string }[] = [];
  if (has('production')) options.push({ id: 'batches', label: 'Batches' }, { id: 'recipes', label: 'Recipes' });
  if (has('stock')) options.push({ id: 'jars', label: 'Jars in stock' });

  return (
    <Screen title="Make" back={false} testID="tab-screen-make">
      {options.length > 1 ? <Segments<Seg> options={options} value={seg} onChange={setSeg} testID="make-seg" /> : null}
      {seg === 'batches' && has('production') ? (
        <>
          <Button label="Start a batch" onPress={() => router.push('/area/production?go=start')} testID="make-start-batch" />
          <Card title="Batches" testID="make-batches">
            <Segments<Stage> options={STAGES.map((s) => ({ id: s.id, label: `${s.label} (${inStage(s.id).length})` }))} value={activeStage} onChange={setStage} testID="make-stages" />
            {inStage(activeStage).map((b) => (
              <Row key={b.id} title={`${fmtQty(b.qty)} ${b.product}`} detail={`${b.name} · ${stateWithOdoo(b.state)}`} onPress={() => router.push(`/area/production?go=batch:${b.id}`)} testID={`make-batch-${b.id}`} />
            ))}
            {batches && !inStage(activeStage).length ? <Body muted>{batches.length ? 'Nothing in this stage.' : 'No batches yet. Tap Start a batch.'}</Body> : null}
          </Card>
          <Row title="Plan batches and shopping list" detail="What the next batches need, what you have, what to buy" onPress={() => router.push('/area/production?go=plan')} testID="make-plan" />
          <Row title="This week" detail="Planned batches by day. Move one to another day" onPress={() => router.push('/area/production?go=week')} testID="make-week" />
          {has('safety') ? <Row title="Food safety" detail="Kitchen checks, tasting log, shelf-life checks, rules" onPress={() => router.push('/area/safety')} testID="area-safety" /> : null}
        </>
      ) : null}
      {seg === 'recipes' && has('production') ? (
        <LookScope look="cookbook">
          <Card title="Recipe box" testID="recipe-box">
            {offline ? <Body muted>No signal. Recipes show when the phone is back online.</Body> : null}
            {recipes?.map((r) => (
              <Row key={r.id} title={r.name} detail={`Makes ${qtyWords(r.makes, r.unit)} · ${r.lines.length} ingredients`} onPress={() => router.push(`/area/production?go=recipe:${r.id}`)} testID={`make-recipe-${r.id}`} />
            ))}
            {recipes && !recipes.length ? <Body muted>No recipes yet.</Body> : null}
            <Button label="New recipe" kind="plain" onPress={() => router.push('/area/production?go=recipes')} testID="make-new-recipe" />
          </Card>
        </LookScope>
      ) : null}
      {seg === 'jars' && has('stock') ? (
        <>
          <Card title="Jars in stock" testID="make-jars">
            {offline ? <Body muted>No signal. Stock shows when the phone is back online.</Body> : null}
            {jars && jars.length > 8 ? <Field label="Find a jar" value={jarText} onChangeText={setJarText} testID="make-jar-search" /> : null}
            {shownJars?.map((g) => (
              <Row
                key={g.key}
                title={g.name}
                detail={[g.sizes.length > 1 || g.sizes[0]?.size ? g.sizes.map((x) => `${x.size || 'each'}: ${fmtQty(x.onHand)}`).join(' · ') : '', g.soon === undefined ? '' : g.soon < 0 ? 'Use-by date has passed' : `Use-by in ${g.soon} days`].filter(Boolean).join(' · ') || undefined}
                value={`${fmtQty(g.total)} in stock`}
                onPress={() => router.push('/lookup')}
                testID={`make-jar-${g.sizes[0]?.id}`}
              />
            ))}
            {jars && !shownJars?.length ? <Body muted>{jars.length ? 'Nothing in stock. Turn on Show out of stock to see everything.' : 'Nothing counted yet. Finish a batch or count stock.'}</Body> : null}
            {jars?.length ? <Button label={showEmpty ? 'Hide out of stock' : 'Show out of stock'} kind="plain" onPress={() => setShowEmpty(!showEmpty)} testID="make-jar-empty" /> : null}
          </Card>
          <Row title="Count, throw out, find a batch" detail="Counts, expiring soon, waste, batch lookup" onPress={() => router.push('/area/stock')} testID="area-stock" />
        </>
      ) : null}
    </Screen>
  );
}

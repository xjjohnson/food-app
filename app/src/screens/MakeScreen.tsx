import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Body, Button, Card, LookScope, Row, Screen, Segments } from '../components/ui';
import { fmtQty, loadBatches, loadRecipes, Batch, Recipe, stateLabel } from '../lib/production';
import { tabAreas } from '../lib/tabs';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

type Seg = 'recipes' | 'batches' | 'jars';
type Stage = 'planned' | 'cooking' | 'ready';
const STAGES: { id: Stage; label: string; states: string[] }[] = [
  { id: 'planned', label: 'Planned', states: ['draft'] },
  { id: 'cooking', label: 'Cooking', states: ['confirmed', 'progress'] },
  { id: 'ready', label: 'Ready to finish', states: ['to_close'] },
];

/** The Make tab: the recipe box (cookbook look), the batches, and the jars in stock. */
export function MakeScreen() {
  const { client, offline } = useOdoo();
  const { roles } = useRoles();
  const areas = tabAreas('make', roles);
  const has = (id: string) => areas.some((a) => a.id === id);
  const first: Seg = has('production') ? 'recipes' : 'jars';
  const [seg, setSeg] = useState<Seg>(first);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  useEffect(() => {
    if (!client || offline || !has('production')) return;
    loadRecipes(client).then(setRecipes).catch(() => setRecipes([]));
    loadBatches(client).then((b) => setBatches(b.open)).catch(() => setBatches([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, offline, roles]);

  const inStage = (id: Stage) => (batches ?? []).filter((b) => STAGES.find((s) => s.id === id)!.states.includes(b.state));
  // The board opens on the first stage that has a batch.
  const activeStage: Stage = stage ?? STAGES.find((s) => inStage(s.id).length > 0)?.id ?? 'planned';

  const options: { id: Seg; label: string }[] = [];
  if (has('production')) options.push({ id: 'recipes', label: 'Recipes' }, { id: 'batches', label: 'Batches' });
  if (has('stock')) options.push({ id: 'jars', label: 'Jars in stock' });

  return (
    <Screen title="Make" back={false} testID="tab-screen-make">
      {options.length > 1 ? <Segments<Seg> options={options} value={seg} onChange={setSeg} testID="make-seg" /> : null}
      {seg === 'recipes' && has('production') ? (
        <LookScope look="cookbook">
          <Card title="Recipe box" testID="recipe-box">
            {offline ? <Body muted>No signal. Recipes show when the phone is back online.</Body> : null}
            {recipes?.map((r) => (
              <Row key={r.id} title={r.name} detail={`Makes ${fmtQty(r.makes)} ${r.unit} · ${r.lines.length} ingredients`.replace('  ', ' ')} onPress={() => router.push(`/area/production?go=recipe:${r.id}`)} testID={`make-recipe-${r.id}`} />
            ))}
            {recipes && !recipes.length ? <Body muted>No recipes yet.</Body> : null}
            <Button label="New recipe" kind="plain" onPress={() => router.push('/area/production?go=recipes')} testID="make-new-recipe" />
          </Card>
        </LookScope>
      ) : null}
      {seg === 'batches' && has('production') ? (
        <Card title="Batches" testID="make-batches">
          <Segments<Stage> options={STAGES.map((s) => ({ id: s.id, label: `${s.label} (${inStage(s.id).length})` }))} value={activeStage} onChange={setStage} testID="make-stages" />
          {inStage(activeStage).map((b) => (
            <Row key={b.id} title={`${fmtQty(b.qty)} ${b.product}`} detail={`${b.name} · ${stateLabel(b.state)}`} onPress={() => router.push(`/area/production?go=batch:${b.id}`)} testID={`make-batch-${b.id}`} />
          ))}
          {batches && !inStage(activeStage).length ? <Body muted>{batches.length ? 'Nothing in this stage.' : 'Nothing cooking right now.'}</Body> : null}
          <Button label="Start a batch" onPress={() => router.push('/area/production?go=start')} testID="make-start-batch" />
          <Row title="Plan, week and more" detail="Planner, this week, finished batches" onPress={() => router.push('/area/production')} testID="area-production" />
        </Card>
      ) : null}
      {seg === 'jars' && has('stock') ? (
        <Card title="Jars in stock">
          <Row title="Stock" detail="Counts, expiring soon, find a batch" onPress={() => router.push('/area/stock')} testID="area-stock" />
        </Card>
      ) : null}
      <Card>
        <Row title="Find a product" detail="Price, photo and stock by batch" onPress={() => router.push('/lookup')} testID="open-lookup" />
      </Card>
      {has('safety') ? (
        <Card title="Food safety">
          <Row title="Safety and records" detail="Kitchen checks, tasting log, shelf-life checks, rules" onPress={() => router.push('/area/safety')} testID="area-safety" />
        </Card>
      ) : null}
    </Screen>
  );
}

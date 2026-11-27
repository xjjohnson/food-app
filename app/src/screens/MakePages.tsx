import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Field, Row, Screen, Segments, useUi } from '../components/ui';
import type { Palette } from '../lib/palette';
import { batchStep, fmtQty, groupRecipes, loadBatches, loadRecipes, qtyWords, Batch, Recipe, stateLabel } from '../lib/production';
import { groupJars, JarRow, loadExpiring, loadInStock } from '../lib/stock';
import { useOdoo } from '../lib/useOdoo';
import { useStyles } from '../lib/useBrand';

type Stage = 'planned' | 'cooking' | 'ready' | 'done';
const STAGES: { id: Stage; label: string; states: string[] }[] = [
  { id: 'planned', label: 'Planned', states: ['draft', 'confirmed'] },
  { id: 'cooking', label: 'Cooking', states: ['progress'] },
  { id: 'ready', label: 'To finish', states: ['to_close'] },
  { id: 'done', label: 'Finished', states: ['done'] },
];
const stageOf = (state: string): Stage => STAGES.find((s) => s.states.includes(state))?.id ?? 'planned';

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stats: { flexDirection: 'row', gap: 8 },
    stat: { flex: 1, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.line, paddingVertical: 12, alignItems: 'center' },
    statNum: { fontSize: 26, fontWeight: '800', color: c.text },
    statLabel: { fontSize: 14, color: c.muted },
    bcard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 14, gap: 8 },
    bhead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    btitle: { flex: 1, gap: 2 },
    tag: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: c.tint },
    tagText: { fontSize: 13, fontWeight: '800', color: c.text },
    track: { height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' },
    fill: { height: 6, backgroundColor: c.accent },
    group: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.line, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 4 },
    gtitle: { fontSize: 18, fontWeight: '800', color: c.text },
    gtop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.tint },
    chipOff: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: c.line },
    chipText: { fontSize: 14, color: c.text },
    chipTextOff: { color: c.muted },
    more: { fontSize: 16, fontWeight: '800', color: c.accent, paddingVertical: 10 },
  });

/** Planned, cooking and to-finish counts for the Make home. */
export function MakeStats({ batches, testID }: { batches: Batch[] | null; testID?: string }) {
  const s = useStyles(makeStyles);
  const n = (id: Stage) => (batches ?? []).filter((b) => stageOf(b.state) === id).length;
  return (
    <View style={s.stats} testID={testID}>
      {(['planned', 'cooking', 'ready'] as Stage[]).map((id) => (
        <View key={id} style={s.stat} testID={`${testID}-${id}`}>
          <Text style={s.statNum}>{batches ? n(id) : '–'}</Text>
          <Text style={s.statLabel}>{STAGES.find((x) => x.id === id)!.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Batches: stage tabs with counts, a card per batch with how far along it is. */
export function MakeBatchesScreen() {
  const { client, offline } = useOdoo();
  const s = useStyles(makeStyles);
  const ui = useUi();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!client || offline) return;
      loadBatches(client).then((b) => setBatches([...b.open, ...b.done])).catch(() => setBatches([]));
    }, [client, offline]),
  );
  const inStage = (id: Stage) => (batches ?? []).filter((b) => stageOf(b.state) === id);
  // The board opens on the first stage that has a batch.
  const active: Stage = stage ?? STAGES.find((x) => inStage(x.id).length > 0)?.id ?? 'planned';
  return (
    <Screen title="Batches" testID="make-batches-screen">
      <Button label="Start a batch" onPress={() => router.push('/area/production?go=start')} testID="make-start-batch" />
      <View testID="make-batches">
        <Segments<Stage> options={STAGES.map((x) => ({ id: x.id, label: `${x.label} (${inStage(x.id).length})` }))} value={active} onChange={setStage} testID="make-stages" />
      </View>
      {inStage(active).map((b) => (
        <Pressable key={b.id} style={s.bcard} onPress={() => router.push(`/area/production?go=batch:${b.id}`)} accessibilityRole="button" testID={`make-batch-${b.id}`}>
          <View style={s.bhead}>
            <View style={s.btitle}>
              <Text style={ui.rowTitle}>{`${fmtQty(b.qty)} ${b.product}`}</Text>
              <Text style={ui.muted}>{b.name}</Text>
            </View>
            <View style={s.tag}>
              <Text style={s.tagText}>{stateLabel(b.state)}</Text>
            </View>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.round(((batchStep(b.state) + (b.state === 'progress' ? 0.5 : 0)) / 3) * 100)}%` }]} />
          </View>
        </Pressable>
      ))}
      {batches && !inStage(active).length ? <Body muted>{batches.length ? 'Nothing in this stage.' : 'No batches yet. Tap Start a batch.'}</Body> : null}
    </Screen>
  );
}

/** Recipes: one card per product, its sizes listed inside, so names stop repeating. */
export function MakeRecipesScreen() {
  const { client, offline } = useOdoo();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [text, setText] = useState('');
  useFocusEffect(
    useCallback(() => {
      if (!client || offline) return;
      loadRecipes(client).then(setRecipes).catch(() => setRecipes([]));
    }, [client, offline]),
  );
  const groups = recipes ? groupRecipes(recipes, text) : null;
  return (
    <Screen title="Recipes" testID="make-recipes-screen">
      <>
        {offline ? <Body muted>No signal. Recipes show when the phone is back online.</Body> : null}
        {recipes && recipes.length > 8 ? <Field label="Find a recipe" value={text} onChangeText={setText} testID="make-recipe-search" /> : null}
        <View style={{ gap: 12 }} testID="recipe-box">
          {groups?.map((g) => (
            <Card key={g.name} title={g.name}>
              {g.recipes.map(({ recipe: r, size }) => (
                <Row key={r.id} title={size || 'One size'} detail={`Makes ${qtyWords(r.makes, r.unit)} · ${r.lines.length} ingredients`} onPress={() => router.push(`/area/production?go=recipe:${r.id}`)} testID={`make-recipe-${r.id}`} />
              ))}
            </Card>
          ))}
        </View>
        {recipes && !recipes.length ? <Body muted>No recipes yet.</Body> : null}
        <Button label="New recipe" kind="plain" onPress={() => router.push('/area/production?go=recipes')} testID="make-new-recipe" />
      </>
    </Screen>
  );
}

/** Jars in stock: one card per product, sizes as chips, empty sizes faded, low stock flagged. */
export function MakeJarsScreen() {
  const { client, offline } = useOdoo();
  const s = useStyles(makeStyles);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [jars, setJars] = useState<JarRow[] | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [text, setText] = useState('');
  useFocusEffect(
    useCallback(() => {
      if (!client || offline) return;
      loadRecipes(client).then(setRecipes).catch(() => setRecipes([]));
      Promise.all([loadInStock(client, '', 'made'), loadExpiring(client, 14).catch(() => [])])
        .then(([rows, soon]) => {
          const days = new Map<string, number>();
          for (const l of soon) if (!days.has(l.product) || l.days < days.get(l.product)!) days.set(l.product, l.days);
          setJars(rows.map((r) => ({ ...r, soon: days.get(r.name) })));
        })
        .catch(() => setJars([]));
    }, [client, offline]),
  );
  // Ingredients are not jars: leave out anything a recipe uses as an ingredient.
  const ingredientIds = new Set((recipes ?? []).flatMap((r) => r.lines.map((l) => l.productId)));
  const shown = jars ? groupJars(jars, { ingredientIds, showEmpty, text }) : null;
  return (
    <Screen title="Jars in stock" testID="make-jars-screen">
      {offline ? <Body muted>No signal. Stock shows when the phone is back online.</Body> : null}
      {jars && jars.length > 8 ? <Field label="Find a jar" value={text} onChangeText={setText} testID="make-jar-search" /> : null}
      <View style={{ gap: 12 }} testID="make-jars">
        {shown?.map((g) => (
          <View key={g.key} style={s.group} testID={`make-jar-${g.sizes[0]?.id}`}>
            <View style={s.gtop}>
              <Text style={[s.gtitle, { flex: 1 }]}>{g.name}</Text>
              <View style={s.chip}>
                <Text style={s.chipText}>{`${fmtQty(g.total)} in stock`}</Text>
              </View>
            </View>
            <View style={s.chips}>
              {g.sizes.map((x) => (
                <View key={x.id} style={[s.chip, x.onHand <= 0 && s.chipOff]}>
                  <Text style={[s.chipText, x.onHand <= 0 && s.chipTextOff]}>{`${x.size || 'each'}: ${fmtQty(x.onHand)}`}</Text>
                </View>
              ))}
            </View>
            {g.soon !== undefined ? <Text style={s.chipText}>{g.soon < 0 ? 'Use-by date has passed' : `Use-by in ${g.soon} days`}</Text> : null}
            <Pressable onPress={() => router.push('/area/production?go=start')} accessibilityRole="button" testID={`make-more-${g.sizes[0]?.id}`}>
              <Text style={s.more}>Make more ›</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {jars && !shown?.length ? <Body muted>{jars.length ? 'Nothing in stock. Turn on Show out of stock to see everything.' : 'Nothing counted yet. Finish a batch or count stock.'}</Body> : null}
      {jars?.length ? <Button label={showEmpty ? 'Hide out of stock' : 'Show out of stock'} kind="plain" onPress={() => setShowEmpty(!showEmpty)} testID="make-jar-empty" /> : null}
      <Row title="Count, throw out, find a batch" detail="Counts, expiring soon, waste, batch lookup" onPress={() => router.push('/area/stock')} testID="area-stock" />
    </Screen>
  );
}

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Button, Row, Screen, SectionLabel } from '../components/ui';
import { MakeStats } from './MakePages';
import { loadBatches, loadRecipes, Batch, Recipe } from '../lib/production';
import { groupJars, JarRow, loadInStock } from '../lib/stock';
import { tabAreas } from '../lib/tabs';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

/** The Make tab: a kitchen home. What is cooking, a Start button, and a door to Batches, Recipes and Jars in stock. */
export function MakeScreen() {
  const { client, offline } = useOdoo();
  const { roles } = useRoles();
  const areas = tabAreas('make', roles);
  const has = (id: string) => areas.some((a) => a.id === id);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [jarRows, setJarRows] = useState<JarRow[] | null>(null);

  // Read again every time the tab comes back into view, so a batch just started is counted.
  useFocusEffect(
    useCallback(() => {
      if (!client || offline) return;
      if (has('production')) {
        loadRecipes(client).then(setRecipes).catch(() => setRecipes([]));
        loadBatches(client).then((b) => setBatches([...b.open, ...b.done])).catch(() => setBatches([]));
      }
      if (has('stock')) {
        loadInStock(client, '', 'made').then((r) => setJarRows(r.map((x) => ({ ...x })))).catch(() => setJarRows([]));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, offline, roles]),
  );

  // Ingredients are not jars: leave out anything a recipe uses as an ingredient.
  const ingredientIds = new Set((recipes ?? []).flatMap((r) => r.lines.map((l) => l.productId)));
  const shown = jarRows ? groupJars(jarRows, { ingredientIds }) : null;
  const jarCount = shown ? { jars: shown.reduce((n, g) => n + g.total, 0), products: shown.length } : null;
  const done = (batches ?? []).filter((b) => b.state === 'done').length;
  const products = new Set((recipes ?? []).map((r) => r.name.replace(/\s*\([^()]*\)\s*$/, ''))).size;

  return (
    <Screen title="Make" back={false} testID="tab-screen-make">
      {has('production') ? <Button label="Start a batch" onPress={() => router.push('/area/production?go=start')} testID="make-start-batch" /> : null}
      {has('production') ? <MakeStats batches={batches} testID="make-stats" /> : null}
      <SectionLabel>Open</SectionLabel>
      {has('production') ? <Row title="Batches" detail={batches ? `${done} finished · see every stage` : 'See every stage'} onPress={() => router.push('/make/batches')} testID="make-open-batches" /> : null}
      {has('production') ? <Row title="Recipes" detail={recipes ? `${products} products · ${recipes.length} recipes` : 'Your recipe box'} onPress={() => router.push('/make/recipes')} testID="make-open-recipes" /> : null}
      {has('stock') ? <Row title="Jars in stock" detail={jarCount ? `${jarCount.jars} jars · ${jarCount.products} products` : 'What is on the shelf'} onPress={() => router.push('/make/jars')} testID="make-open-jars" /> : null}
      {has('production') ? (
        <>
          <SectionLabel>More tools</SectionLabel>
          <Row title="Plan batches and shopping list" detail="What the next batches need, what you have, what to buy" onPress={() => router.push('/area/production?go=plan')} testID="make-plan" />
          <Row title="This week" detail="Planned batches by day. Move one to another day" onPress={() => router.push('/area/production?go=week')} testID="make-week" />
        </>
      ) : null}
      {has('safety') ? <Row title="Food safety" detail="Kitchen checks, tasting log, shelf-life checks, rules" onPress={() => router.push('/area/safety')} testID="area-safety" /> : null}
    </Screen>
  );
}

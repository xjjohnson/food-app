import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Row, Screen, SectionLabel } from '../components/ui';
import { loadNeedRows, loadPlanned, loadShoppingList, planNeeds } from '../lib/plan';
import { loadRecipes } from '../lib/production';
import { canSee } from '../lib/roles';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

/** The Buy tab: record a purchase first, then Plan, Your lists and Look back. Purchase orders and Check in a delivery are not shown (rarely used); their pages still open from deep links. */
export function BuyScreen() {
  const { roles } = useRoles();
  const { client, offline } = useOdoo();
  const [shopCount, setShopCount] = useState(0);
  // The number of things on the shopping list, read again each time this tab comes into view.
  useFocusEffect(
    useCallback(() => {
      if (!client || offline) return;
      (async () => {
        const planned = await loadPlanned(client, await loadRecipes(client));
        setShopCount((await loadShoppingList(client, await loadNeedRows(client, planNeeds(planned)))).length);
      })().catch(() => undefined);
    }, [client, offline]),
  );
  const go = (g: string) => router.push(`/area/ingredients?go=${g}`);
  if (!canSee(roles, 'inventory')) return <Screen title="Buy" back={false} testID="tab-screen-buy"><View /></Screen>;
  return (
    <Screen title="Buy" back={false} testID="tab-screen-buy">
      <Button label="I bought something" onPress={() => go('bought')} testID="buy-bought" />
      <SectionLabel>Plan</SectionLabel>
      <Card>
        <Row title="Running low" detail="What to order, and the levels that mean low" onPress={() => go('low')} testID="buy-low" />
        <Row title="Shopping list" detail="What planned batches need, by supplier" badge={shopCount} onPress={() => go('shop')} testID="buy-shop" />
      </Card>
      <SectionLabel>Your lists</SectionLabel>
      <Card>
        <Row title="Ingredient list" detail="See, add and change ingredients, cost and vendors" onPress={() => go('list')} testID="buy-list" />
        <Row title="Suppliers" detail="Find, add or change a supplier" onPress={() => router.push('/contacts')} testID="buy-suppliers" />
      </Card>
      <SectionLabel>Look back</SectionLabel>
      <Card>
        <Row title="Purchase history" detail="Every purchase and bill: date, store, total, paid or not" onPress={() => go('history')} testID="buy-history" />
      </Card>
    </Screen>
  );
}

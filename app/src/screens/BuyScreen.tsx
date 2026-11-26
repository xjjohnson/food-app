import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Card, Row, Screen } from '../components/ui';
import { canSee } from '../lib/roles';
import { useRoles } from '../lib/useRoles';

/** The Buy tab: record a purchase first, then every ingredient page one tap away. */
export function BuyScreen() {
  const { roles } = useRoles();
  const go = (g: string) => router.push(`/area/ingredients?go=${g}`);
  if (!canSee(roles, 'inventory')) return <Screen title="Buy" back={false} testID="tab-screen-buy"><View /></Screen>;
  return (
    <Screen title="Buy" back={false} testID="tab-screen-buy">
      <Button label="I bought something" onPress={() => go('bought')} testID="buy-bought" />
      <Card title="Ingredients">
        <Row title="Running low" detail="What to order, and the levels that mean low" onPress={() => go('low')} testID="buy-low" />
        <Row title="Shopping list" detail="What planned batches need, by supplier" onPress={() => go('shop')} testID="buy-shop" />
        <Row title="Ingredient list" detail="See, add and change ingredients, cost and vendors" onPress={() => go('list')} testID="buy-list" />
      </Card>
      <Card title="Orders and deliveries">
        <Row title="Purchase orders" detail="See, add and change orders to vendors" onPress={() => go('pos')} testID="buy-pos" />
        <Row title="Check in a delivery" detail="Record what arrived, with batch numbers and use-by dates" onPress={() => go('receipts')} testID="buy-receipts" />
        <Row title="Purchase history" detail="Every purchase and bill: date, store, total, paid or not" onPress={() => go('history')} testID="buy-history" />
      </Card>
      <Card>
        <Row title="Everything in Ingredients" detail="Prices, units and more" onPress={() => router.push('/area/ingredients')} testID="area-ingredients" />
        <Row title="Suppliers" detail="Find, add or change a supplier" onPress={() => router.push('/contacts')} testID="buy-suppliers" />
      </Card>
    </Screen>
  );
}

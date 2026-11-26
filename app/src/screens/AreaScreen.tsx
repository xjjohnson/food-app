import { Body, Card, Screen } from '../components/ui';
import { areaById } from '../lib/areas';
import { canSee } from '../lib/roles';
import { useRoles } from '../lib/useRoles';
import { OrdersScreen } from './OrdersScreen';
import { MarketScreen } from './MarketScreen';
import { IngredientsScreen } from './IngredientsScreen';
import { MoneyScreen } from './MoneyScreen';
import { SafetyScreen } from './SafetyScreen';
import { StockScreen } from './StockScreen';
import { ProductionScreen } from './ProductionScreen';

/** Holds an area's place until its feature is built. */
export function AreaScreen({ id }: { id: string }) {
  const area = areaById(id);
  const { roles } = useRoles();
  if (!area || !canSee(roles, area.role))
    return (
      <Screen title="Not here">
        <Body>This area isn’t part of your role.</Body>
      </Screen>
    );
  if (area.id === 'production') return <ProductionScreen />;
  if (area.id === 'orders') return <OrdersScreen />;
  if (area.id === 'stock') return <StockScreen />;
  if (area.id === 'ingredients') return <IngredientsScreen />;
  if (area.id === 'invoices') return <MoneyScreen kind="out" />;
  if (area.id === 'safety') return <SafetyScreen />;
  if (area.id === 'market') return <MarketScreen />;
  return (
    <Screen title={area.title} testID={`area-screen-${area.id}`}>
      <Card title="Coming next">
        <Body>{area.detail}.</Body>
        <Body muted>{`This part of the app is built in ${area.comingIn} of the plan. It will arrive as an update.`}</Body>
      </Card>
    </Screen>
  );
}

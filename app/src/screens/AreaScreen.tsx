import { Body, Card, Screen } from '../components/ui';
import { areaById } from '../lib/areas';
import { canSee } from '../lib/roles';
import { useRoles } from '../lib/useRoles';
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
  return (
    <Screen title={area.title} testID={`area-screen-${area.id}`}>
      <Card title="Coming next">
        <Body>{area.detail}.</Body>
        <Body muted>{`This part of the app is built in ${area.comingIn} of the plan. It will arrive as an update.`}</Body>
      </Card>
    </Screen>
  );
}

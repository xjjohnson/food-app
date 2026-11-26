import { router } from 'expo-router';
import { Card, Row, Screen } from '../components/ui';
import { tabAreas, TABS, TabId } from '../lib/tabs';
import { useRoles } from '../lib/useRoles';

/** A work tab (Make, Buy, Sell): the areas this person may open, each one a row. */
export function TabMenu({ tab }: { tab: Exclude<TabId, 'index' | 'more' | 'make'> }) {
  const { roles } = useRoles();
  const t = TABS.find((x) => x.id === tab)!;
  const areas = tabAreas(tab, roles);
  return (
    <Screen title={t.title} back={false} testID={`tab-screen-${tab}`}>
      <Card>
        {areas.map((a) => (
          <Row key={a.id} title={a.title} detail={a.detail} onPress={() => router.push(`/area/${a.id}`)} testID={`area-${a.id}`} />
        ))}
        {tab === 'sell' ? <Row title="Customers and suppliers" detail="Find, add or change a contact" onPress={() => router.push('/contacts')} testID="open-contacts" /> : null}
      </Card>
    </Screen>
  );
}

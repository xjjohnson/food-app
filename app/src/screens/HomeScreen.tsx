import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, Row, Screen, useUi } from '../components/ui';
import { hasAnyRole, roleNames } from '../lib/roles';
import { loadToday, TodayItem } from '../lib/today';
import { useBrand } from '../lib/useBrand';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

/** The Today tab: what needs doing now. The areas live in the Make, Buy and Sell tabs. */
export function HomeScreen() {
  const { client, offline } = useOdoo();
  const { roles, mine, loading } = useRoles();
  const { name } = useBrand();
  const s = useUi();
  const first = client?.session.name.split(' ')[0] ?? '';
  const [today, setToday] = useState<TodayItem[]>([]);
  useEffect(() => {
    if (!client || offline || !hasAnyRole(roles)) return;
    loadToday(client, roles)
      .then(setToday)
      .catch(() => undefined);
  }, [client, offline, roles]);

  return (
    <Screen title={name} back={false} testID="home-screen" right={<Button label="Search" kind="plain" onPress={() => router.push('/search')} testID="open-search-top" />}>
      <View style={{ gap: 6 }}>
        <Text style={s.cardTitle}>{first ? `Hi ${first}` : 'Hi'}</Text>
        {hasAnyRole(roles) ? <Chip label={roleNames(roles)} testID="my-roles" /> : null}
      </View>

      {!hasAnyRole(roles) && !loading ? (
        <Card title="No role yet" testID="no-role">
          <Body>
            {mine && !mine.hasEmployee
              ? 'Your Odoo login has no Employee record, so the app can’t see your role. Ask the owner to link you to an Employee in Odoo and give you a role.'
              : 'Ask the owner to give you a role in the app’s Management area (or as a Tag on your Employee in Odoo). Then pull this screen down or reopen the app.'}
          </Body>
        </Card>
      ) : null}

      {today.length ? (
        <Card title="Today" testID="today-card">
          {today.map((t) => (
            <Row key={t.id} title={t.title} value={String(t.count)} onPress={() => router.push(t.area === 'tasks' ? '/tasks' : `/area/${t.area}`)} testID={`today-${t.id}`} />
          ))}
        </Card>
      ) : null}

      {hasAnyRole(roles) ? <Row title="Tasks" detail="Jobs to do, and special dates" onPress={() => router.push('/tasks')} testID="open-tasks" /> : null}

    </Screen>
  );
}

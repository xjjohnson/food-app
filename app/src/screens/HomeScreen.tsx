import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, Row, Screen, useUi } from '../components/ui';
import { AREAS, areasForRoles } from '../lib/areas';
import { canSee, hasAnyRole, roleNames } from '../lib/roles';
import { loadToday, TodayItem } from '../lib/today';
import { useBrand } from '../lib/useBrand';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

/** The home screen: the areas this person's roles open, and the owner's management area. */
export function HomeScreen() {
  const { client, offline } = useOdoo();
  const { roles, mine, loading } = useRoles();
  const { name } = useBrand();
  const s = useUi();
  const areas = areasForRoles(AREAS.filter((a) => canSee(roles, a.role)), roles);
  const first = client?.session.name.split(' ')[0] ?? '';
  const [today, setToday] = useState<TodayItem[]>([]);
  useEffect(() => {
    if (!client || offline || !hasAnyRole(roles)) return;
    loadToday(client, roles)
      .then(setToday)
      .catch(() => undefined);
  }, [client, offline, roles]);

  return (
    <Screen title={name} back={false} testID="home-screen" right={<Button label="Settings" kind="plain" onPress={() => router.push('/settings')} testID="open-settings" />}>
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

      {hasAnyRole(roles) ? <Row title="Search everything" detail="Products, customers, batches and orders in one box" onPress={() => router.push('/search')} testID="open-search" /> : null}

      {hasAnyRole(roles) ? <Row title="Find a product" detail="Price, photo and stock by batch" onPress={() => router.push('/lookup')} testID="open-lookup" /> : null}

      {hasAnyRole(roles) ? <Row title="Customers and suppliers" detail="Find, add or change a contact" onPress={() => router.push('/contacts')} testID="open-contacts" /> : null}

      {areas.length ? (
        <Card title="Your work">
          {areas.map((a) => (
            <Row key={a.id} title={a.title} detail={a.detail} onPress={() => router.push(`/area/${a.id}`)} testID={`area-${a.id}`} />
          ))}
        </Card>
      ) : null}

      {roles.owner ? (
        <Card title="Owner">
          <Row title="Management" detail="People and roles, the company brand, setup" onPress={() => router.push('/management')} testID="open-management" />
          <Row title="Developer" detail="Test database, connection check, testing tools" onPress={() => router.push('/developer')} testID="open-developer-home" />
        </Card>
      ) : null}
    </Screen>
  );
}

import { router } from 'expo-router';
import { Card, Row, Screen } from '../components/ui';
import { useRoles } from '../lib/useRoles';

/** More: search, contacts and settings for everyone; the owner's money, shop and setup (hidden from other roles). */
export function MoreScreen() {
  const { roles } = useRoles();
  return (
    <Screen title="More" back={false} testID="more-screen">
      <Card>
        <Row title="Settings" detail="Look, updates and sign out" onPress={() => router.push('/settings')} testID="open-settings" />
      </Card>
      {roles.owner ? (
        <Card title="Owner">
          <Row title="Money and reports" detail="Sales, profit, bills due, tax, expenses, accountant packet" onPress={() => router.push('/reports')} testID="open-reports" />
          <Row title="Online shop" detail="Shop switches, new orders, specials, delivery, newsletter" onPress={() => router.push('/shop')} testID="open-shop" />
          <Row title="Management" detail="People and roles, the company brand, setup" onPress={() => router.push('/management')} testID="open-management" />
          <Row title="Developer" detail="Test database, connection check, testing tools" onPress={() => router.push('/developer')} testID="open-developer-home" />
        </Card>
      ) : null}
    </Screen>
  );
}

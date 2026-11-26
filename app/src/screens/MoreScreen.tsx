import { router } from 'expo-router';
import { Card, Row, Screen } from '../components/ui';
import { hasAnyRole } from '../lib/roles';
import { useRoles } from '../lib/useRoles';

/** More: search, contacts and settings for everyone; the owner's money, shop and setup (hidden from other roles). */
export function MoreScreen() {
  const { roles } = useRoles();
  const any = hasAnyRole(roles);
  return (
    <Screen title="More" back={false} testID="more-screen">
      <Card>
        {any ? <Row title="Search everything" detail="Products, customers, batches and orders in one box" onPress={() => router.push('/search')} testID="open-search" /> : null}
        {any ? <Row title="Customers and suppliers" detail="Find, add or change a contact" onPress={() => router.push('/contacts')} testID="open-contacts-more" /> : null}
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

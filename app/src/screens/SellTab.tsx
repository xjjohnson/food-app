import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Button, Row, Screen, SectionLabel, Segments, StatusButtons } from '../components/ui';
import { CustomerStatus, loadCustomerStatus, loadOrderStatus, OrderStatus } from '../lib/sellStatus';
import { tabAreas } from '../lib/tabs';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

type Seg = 'orders' | 'customers' | 'market';

/** The Sell tab: Orders, Customers and Market. Colored status buttons on top (counts from Odoo), then cards. */
export function SellTab() {
  const { roles } = useRoles();
  const { client, offline } = useOdoo();
  const has = (id: string) => tabAreas('sell', roles).some((a) => a.id === id);
  const options: { id: Seg; label: string }[] = [];
  if (has('orders') || has('sell') || has('invoices')) options.push({ id: 'orders', label: 'Orders' });
  options.push({ id: 'customers', label: 'Customers' });
  if (has('market')) options.push({ id: 'market', label: 'Market' });
  const [seg, setSeg] = useState<Seg>(options[0]!.id);
  const [orders, setOrders] = useState<OrderStatus | null>(null);
  const [people, setPeople] = useState<CustomerStatus | null>(null);
  const open = (area: string, go?: string) => router.push(`/area/${area}${go ? `?go=${go}` : ''}` as never);

  // The counts are read again each time this tab comes into view.
  useFocusEffect(
    useCallback(() => {
      if (!client || offline) return;
      if (has('orders')) loadOrderStatus(client).then(setOrders).catch(() => undefined);
      if (has('invoices')) loadCustomerStatus(client).then(setPeople).catch(() => undefined);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, offline, roles]),
  );

  return (
    <Screen title="Sell" back={false} testID="tab-screen-sell">
      {options.length > 1 ? <Segments<Seg> options={options} value={seg} onChange={setSeg} testID="sell-seg" /> : null}
      {seg === 'orders' ? (
        <>
          {has('orders') ? (
            <StatusButtons
              testID="order-status"
              items={[
                { label: 'Packed', count: orders ? orders.packed : null, tone: 'good', onPress: () => open('orders', 'board'), testID: 'status-packed' },
                { label: 'To pack', count: orders ? orders.toPack : null, tone: 'warn', onPress: () => open('orders', 'board'), testID: 'status-topack' },
                { label: 'Late', count: orders ? orders.late : null, tone: 'bad', onPress: () => open('orders', 'board'), testID: 'status-late' },
              ]}
            />
          ) : null}
          <SectionLabel>Today</SectionLabel>
          {has('orders') ? <Row title="Delivery board" detail="To pack, packed and delivered, with the route" onPress={() => open('orders', 'board')} testID="sell-board" /> : null}
          {has('orders') ? <Row title="Website orders" detail="Pack orders, oldest batch first, delivered or picked up" onPress={() => open('orders')} testID="area-orders" /> : null}
          {has('sell') ? (
            <>
              <SectionLabel>Sell</SectionLabel>
              <Row title="New quote" detail="Customer, products, delivery date and terms" onPress={() => open('sell', 'quote')} testID="sell-quote" />
              <Row title="Wholesale order" detail="Cases and payment terms like Net 30" onPress={() => open('sell', 'wholesale')} testID="sell-wholesale-tab" />
              <Row title="Quotes and open orders" detail="Open, confirm, share, invoice" onPress={() => open('sell', 'list')} testID="sell-list-tab" />
              <Row title="Repeat orders" detail="Who usually orders, and who is due" onPress={() => open('sell', 'repeat')} testID="sell-repeat-tab" />
            </>
          ) : null}
          {has('invoices') ? (
            <>
              <SectionLabel>Money</SectionLabel>
              <Row title="Invoices" detail="Who owes you, who has paid" onPress={() => open('invoices')} testID="area-invoices" />
            </>
          ) : null}
        </>
      ) : null}
      {seg === 'customers' ? (
        <>
          {has('invoices') ? (
            <StatusButtons
              testID="customer-status"
              items={[
                { label: 'Customers', count: people ? people.customers : null, tone: 'good', onPress: () => router.push('/contacts'), testID: 'status-customers' },
                { label: 'Owe you', count: people ? people.owe : null, tone: 'warn', onPress: () => open('invoices'), testID: 'status-owe' },
                { label: 'Overdue', count: people ? people.overdue : null, tone: 'bad', onPress: () => open('invoices'), testID: 'status-overdue' },
              ]}
            />
          ) : null}
          <Row title="Customers and suppliers" detail="Find, add or change a contact" onPress={() => router.push('/contacts')} testID="open-contacts" />
        </>
      ) : null}
      {seg === 'market' && has('market') ? (
        <View style={{ gap: 12 }} testID="market-tiles">
          <Button label="Open register" onPress={() => open('market')} testID="area-market" />
          <SectionLabel>Before and after</SectionLabel>
          <Row title="Day sheet" detail="What sold, what is in stock" onPress={() => open('market', 'sheet')} testID="market-tile-sheet" />
          <Row title="Check out and in" detail="What you took and brought back" onPress={() => open('market', 'take')} testID="market-tile-take" />
          <Row title="Price sheet" detail="Big list to share" onPress={() => open('market', 'price')} testID="market-tile-price" />
          <SectionLabel>Money</SectionLabel>
          <Row title="Cash drawer" detail="Count bills and coins" onPress={() => open('market', 'drawer')} testID="market-tile-drawer" />
          <Row title="Day totals" detail="Cash App and Venmo" onPress={() => open('market', 'totals')} testID="market-tile-totals" />
          <Row title="Results" detail="Sales after closing" onPress={() => open('market', 'results')} testID="market-tile-results" />
        </View>
      ) : null}
    </Screen>
  );
}

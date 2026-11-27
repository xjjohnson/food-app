import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { DeliveryBoardScreen } from './DeliveryBoardScreen';
import { Row, Screen, SectionLabel, StatusButtons } from '../components/ui';
import { CustomerStatus, loadCustomerStatus, loadOrderStatus, OrderStatus } from '../lib/sellStatus';
import { tabAreas } from '../lib/tabs';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

/** The Sell tab: one sales page (the Sold board sits inline; Market is a row under Sell). Colored status buttons on top (counts from Odoo), then cards. */
export function SellTab() {
  const { roles } = useRoles();
  const { client, offline } = useOdoo();
  const has = (id: string) => tabAreas('sell', roles).some((a) => a.id === id);
  const [orders, setOrders] = useState<OrderStatus | null>(null);
  const [people, setPeople] = useState<CustomerStatus | null>(null);
  // The colored buttons point the inline board at a side; a new key reloads it there.
  const [pick, setPick] = useState<{ n: number; start?: string }>({ n: 0 });
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
      <>
          {has('orders') ? (
            <StatusButtons
              testID="order-status"
              items={[
                { label: 'Packed', count: orders ? orders.packed : null, tone: 'good', onPress: () => setPick((p) => ({ n: p.n + 1, start: 'packed' })), testID: 'status-packed' },
                { label: 'To pack', count: orders ? orders.toPack : null, tone: 'warn', onPress: () => setPick((p) => ({ n: p.n + 1, start: 'pack' })), testID: 'status-topack' },
                { label: 'Late', count: orders ? orders.late : null, tone: 'bad', onPress: () => setPick((p) => ({ n: p.n + 1, start: 'late' })), testID: 'status-late' },
              ]}
            />
          ) : null}
          {has('orders') ? (
            <>
              <SectionLabel>Sold</SectionLabel>
              <DeliveryBoardScreen key={pick.n} inline start={pick.start} onBack={() => undefined} onPack={(o) => open('orders', `pack:${o.id}`)} onWaiting={() => open('orders', 'waiting')} />
            </>
          ) : null}
          {has('market') || has('sell') ? <SectionLabel>Sell</SectionLabel> : null}
          {has('market') ? <Row title="Market" detail="Before, selling and after: the register, cash and results" onPress={() => open('market')} testID="area-market" /> : null}
          {has('sell') ? (
            <>
              <Row title="Quotes and open orders" detail="New quote, open, confirm, share, invoice" onPress={() => open('sell', 'list')} testID="sell-list-tab" />
            </>
          ) : null}
          {has('invoices') ? (
            <>
              <SectionLabel>Money</SectionLabel>
              <Row title="Invoices" detail={people ? `${people.owe} owed${people.overdue ? `, ${people.overdue} overdue` : ''}` : 'Who owes you, who has paid'} onPress={() => open('invoices')} testID="area-invoices" />
            </>
          ) : null}
      </>
    </Screen>
  );
}

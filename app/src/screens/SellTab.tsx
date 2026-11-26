import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BigTile, Card, Row, Screen, Segments } from '../components/ui';
import { tabAreas } from '../lib/tabs';
import { useRoles } from '../lib/useRoles';

type Seg = 'orders' | 'customers' | 'market';

/** The Sell tab: Orders, Delivery, Customers and Market (market day is big buttons, for standing up). */
export function SellTab() {
  const { roles } = useRoles();
  const has = (id: string) => tabAreas('sell', roles).some((a) => a.id === id);
  const options: { id: Seg; label: string }[] = [];
  if (has('orders') || has('sell') || has('invoices')) options.push({ id: 'orders', label: 'Orders' });
  options.push({ id: 'customers', label: 'Customers' });
  if (has('market')) options.push({ id: 'market', label: 'Market' });
  const [seg, setSeg] = useState<Seg>(options[0]!.id);
  const open = (area: string, go?: string) => router.push(`/area/${area}${go ? `?go=${go}` : ''}` as never);
  return (
    <Screen title="Sell" back={false} testID="tab-screen-sell">
      {options.length > 1 ? <Segments<Seg> options={options} value={seg} onChange={setSeg} testID="sell-seg" /> : null}
      {seg === 'orders' ? (
        <Card title="Orders">
          {has('orders') ? <Row title="Delivery board" detail="To pack, packed and delivered, with the route" onPress={() => open('orders', 'board')} testID="sell-board" /> : null}
          {has('orders') ? <Row title="Website orders" detail="Pack orders, oldest batch first, delivered or picked up" onPress={() => open('orders')} testID="area-orders" /> : null}
          {has('sell') ? <Row title="New quote" detail="Customer, products, delivery date and terms" onPress={() => open('sell', 'quote')} testID="sell-quote" /> : null}
          {has('sell') ? <Row title="Wholesale order" detail="Cases and payment terms like Net 30" onPress={() => open('sell', 'wholesale')} testID="sell-wholesale-tab" /> : null}
          {has('sell') ? <Row title="Quotes and open orders" detail="Open, confirm, share, invoice" onPress={() => open('sell', 'list')} testID="sell-list-tab" /> : null}
          {has('sell') ? <Row title="Repeat orders" detail="Who usually orders, and who is due" onPress={() => open('sell', 'repeat')} testID="sell-repeat-tab" /> : null}
          {has('invoices') ? <Row title="Invoices" detail="Who owes you, who has paid" onPress={() => open('invoices')} testID="area-invoices" /> : null}
        </Card>
      ) : null}
      {seg === 'customers' ? (
        <Card title="Customers">
          <Row title="Customers and suppliers" detail="Find, add or change a contact" onPress={() => router.push('/contacts')} testID="open-contacts" />
        </Card>
      ) : null}
      {seg === 'market' && has('market') ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} testID="market-tiles">
          <BigTile label="Open register" detail="Ring up sales" onPress={() => open('market')} testID="area-market" />
          <BigTile label="Day sheet" detail="What sold, what is in stock" onPress={() => open('market', 'sheet')} testID="market-tile-sheet" />
          <BigTile label="Check out and in" detail="What you took and brought back" onPress={() => open('market', 'take')} testID="market-tile-take" />
          <BigTile label="Price sheet" detail="Big list to share" onPress={() => open('market', 'price')} testID="market-tile-price" />
          <BigTile label="Cash drawer" detail="Count bills and coins" onPress={() => open('market', 'drawer')} testID="market-tile-drawer" />
          <BigTile label="Day totals" detail="Cash App and Venmo" onPress={() => open('market', 'totals')} testID="market-tile-totals" />
          <BigTile label="Results" detail="Sales after closing" onPress={() => open('market', 'results')} testID="market-tile-results" />
        </View>
      ) : null}
    </Screen>
  );
}

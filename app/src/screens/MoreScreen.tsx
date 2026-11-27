import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Row, Screen, useUi } from '../components/ui';
import { roleNames } from '../lib/roles';
import { CustomerStatus, loadCustomerStatus } from '../lib/sellStatus';
import { tabAreas } from '../lib/tabs';
import { useOdoo } from '../lib/useOdoo';
import { useBrand } from '../lib/useBrand';
import { useRoles } from '../lib/useRoles';

/** A big quick button under the header. */
function Quick({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const s = useUi();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={({ pressed }) => [s.card, { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', padding: 8 }, pressed && s.pressed]}>
      <Text style={s.rowTitle}>{label}</Text>
    </Pressable>
  );
}

/** More: your business at the top, quick buttons, and the owner-only items in their own box (hidden from other roles). */
export function MoreScreen() {
  const { roles } = useRoles();
  const { brand, name, colors } = useBrand();
  const s = useUi();
  const who = roleNames(roles) || 'No role yet';
  const { client, offline } = useOdoo();
  const [people, setPeople] = useState<CustomerStatus | null>(null);
  const money = tabAreas('sell', roles).some((a) => a.id === 'invoices');
  useFocusEffect(
    useCallback(() => {
      if (client && !offline && money) loadCustomerStatus(client).then(setPeople).catch(() => undefined);
    }, [client, offline, money]),
  );
  return (
    <Screen title="More" back={false} testID="more-screen">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.accent, borderRadius: 16, padding: 14 }} testID="more-header">
        {brand.logo ? (
          <Image source={{ uri: brand.logo }} style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#FFFFFF' }} resizeMode="contain" accessibilityLabel={`${name} logo`} />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.onAccent }} numberOfLines={2}>{name}</Text>
          <Text style={{ fontSize: 15, color: colors.onAccent }}>{who}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Quick label="Settings" onPress={() => router.push('/settings')} testID="open-settings" />
        {roles.owner ? <Quick label="Money" onPress={() => router.push('/reports')} testID="open-reports" /> : null}
        {roles.owner ? <Quick label="Shop" onPress={() => router.push('/shop')} testID="open-shop" /> : null}
      </View>
      <Row
        title="Customers"
        detail={people ? `${people.customers} customers, ${people.owe} owe you${people.overdue ? `, ${people.overdue} overdue` : ''}` : 'Find, add or change a customer or supplier'}
        onPress={() => router.push('/contacts')}
        testID="open-contacts"
      />
      {roles.owner ? (
        <View style={{ backgroundColor: colors.tint, borderRadius: 16, padding: 14, gap: 4 }} testID="owner-box">
          <Text style={s.label}>OWNER ONLY</Text>
          <Row title="Management" detail="People, brand, setup" onPress={() => router.push('/management')} testID="open-management" />
        </View>
      ) : null}
    </Screen>
  );
}

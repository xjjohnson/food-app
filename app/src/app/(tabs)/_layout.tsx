import { Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { TabBar } from '../../components/TabBar';
import { SignInScreen } from '../../screens/SignInScreen';
import { tabVisible, TabId } from '../../lib/tabs';
import { useBrand } from '../../lib/useBrand';
import { useOdoo } from '../../lib/useOdoo';
import { useRoles } from '../../lib/useRoles';

/** The signed-in app: five tabs along the bottom. A signed-out phone sees the sign-in screen instead. */
export default function TabsLayout() {
  const { status } = useOdoo();
  const { colors } = useBrand();
  const { roles } = useRoles();
  if (status === 'loading')
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }} testID="loading">
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  if (status !== 'signedIn') return <SignInScreen />;
  const hide = (id: TabId) => (tabVisible(id, roles) ? {} : { href: null });
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="buy" options={hide('buy')} />
      <Tabs.Screen name="make" options={hide('make')} />
      <Tabs.Screen name="sell" options={hide('sell')} />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

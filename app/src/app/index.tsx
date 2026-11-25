import { ActivityIndicator, View } from 'react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { useBrand } from '../lib/useBrand';
import { useOdoo } from '../lib/useOdoo';

export default function Index() {
  const { status } = useOdoo();
  const { colors } = useBrand();
  if (status === 'loading')
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }} testID="loading">
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  return status === 'signedIn' ? <HomeScreen /> : <SignInScreen />;
}

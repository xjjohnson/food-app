import { ErrorBoundaryProps, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { BackHandler, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Bands } from '../components/Bands';
import { Body, Button, Card, Screen } from '../components/ui';
import { applyAppearance, loadAppearance } from '../lib/appearance';
import { BUILD_INFO } from '../lib/appVersion';
import { runInnerBack } from '../lib/innerBack';
import { describeError, log } from '../lib/log';
import { restoreBeta } from '../lib/updateChannel';
import { BrandProvider, useBrand } from '../lib/useBrand';
import { OdooProvider } from '../lib/useOdoo';
import { QueueProvider } from '../lib/useQueue';
import { RolesProvider } from '../lib/useRoles';

// Errors nobody caught go to the log before React Native handles them.
const eu = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, f?: boolean) => void; setGlobalHandler(h: (e: unknown, f?: boolean) => void): void } }).ErrorUtils;
if (eu) {
  const previous = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => {
    try {
      log.error('crash', `${fatal ? 'App closed: ' : ''}${describeError(e, 12)}`);
    } catch {
      // Never let logging get in the way.
    }
    previous(e, fatal);
  });
}

function Shell() {
  const { colors } = useBrand();
  // The phone's back gesture closes an inner page first, like the Back button does.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => runInnerBack());
    return () => sub.remove();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      <Bands />
    </View>
  );
}

/**
 * The whole app: the Odoo sign-in, the company brand, the person's roles and
 * the offline queue, around a stack of screens. Routes live in this folder
 * and stay thin; what each screen draws is in src/screens/.
 */
export default function RootLayout() {
  useEffect(() => {
    log.load().then(() => log.info('app', `started · ${BUILD_INFO}`));
    loadAppearance().then(applyAppearance);
    restoreBeta(Updates).catch(() => undefined);
  }, []);
  return (
    <SafeAreaProvider>
      <OdooProvider>
        <BrandProvider>
          <RolesProvider>
            <QueueProvider>
              <Shell />
            </QueueProvider>
          </RolesProvider>
        </BrandProvider>
      </OdooProvider>
    </SafeAreaProvider>
  );
}

/** Shown instead of a screen that hit an error while drawing, rather than a blank page. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    log.error('crash', `Screen error: ${describeError(error, 12)}`);
  }, [error]);
  return (
    <Screen title="Something went wrong" back={false} testID="error-screen">
      <Card>
        <Body>The app hit an error on this screen. It’s in the log (Developer screen), so it can be fixed. Changes waiting to send are safe.</Body>
        <Button label="Try again" onPress={retry} />
        <Button label="Restart the app" kind="plain" onPress={() => Updates.reloadAsync().catch(() => undefined)} />
      </Card>
    </Screen>
  );
}

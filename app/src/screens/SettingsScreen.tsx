import { router } from 'expo-router';
import { useRef } from 'react';
import { Pressable, Text } from 'react-native';
import { Body, Button, Card, Row, Screen, useUi } from '../components/ui';
import { BUILD_INFO, SHORT_VERSION, UPDATE_CHANNEL } from '../lib/appVersion';
import { dbLabel } from '../lib/dbSwitch';
import { roleNames } from '../lib/roles';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useRoles } from '../lib/useRoles';

/** Who is signed in, their roles, the version, and signing out. Seven taps on the version open the Developer screen. */
export function SettingsScreen() {
  const { client, signOut, offline } = useOdoo();
  const { roles, mine, reload, loading } = useRoles();
  const { items } = useQueue();
  const s = useUi();
  const taps = useRef(0);

  return (
    <Screen title="Settings" testID="settings-screen">
      <Card title="You">
        <Row title="Name" value={client?.session.name ?? ''} />
        <Row title="Login" value={client?.session.login ?? ''} />
        <Row title="Database" value={client ? dbLabel(client.session) : ''} />
        <Row title="Roles" value={roleNames(roles) || 'None yet'} testID="settings-roles" />
        {mine?.admin ? <Body muted>You are an Odoo administrator, so you are always Owner.</Body> : null}
        <Button label="Read my roles again" kind="plain" busy={loading} disabled={offline} onPress={() => reload()} testID="reload-roles" />
      </Card>
      <Card title="App">
        <Pressable
          onPress={() => {
            taps.current += 1;
            if (taps.current >= 7) {
              taps.current = 0;
              router.push('/developer');
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Version"
          testID="version-line"
        >
          <Text style={s.rowTitle}>{SHORT_VERSION}</Text>
          <Text style={s.muted}>{BUILD_INFO}</Text>
          <Text style={s.muted}>{`Updates: ${UPDATE_CHANNEL ?? 'not in this build'}`}</Text>
        </Pressable>
      </Card>
      <Card title="Sign out">
        {items.length ? <Body>{`${items.length} ${items.length === 1 ? 'change hasn’t' : 'changes haven’t'} reached Odoo yet. They stay on this phone and send after you sign in again.`}</Body> : null}
        <Button
          label="Sign out"
          kind="danger"
          onPress={() => {
            signOut();
            router.replace('/');
          }}
          testID="sign-out"
        />
      </Card>
    </Screen>
  );
}

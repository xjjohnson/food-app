import { Alert } from 'react-native';
import { Body, Button, Card, ErrorText, Row, Screen } from '../components/ui';
import { useOdoo } from '../lib/useOdoo';
import { dbName, plainReason, stepsOf } from '../lib/queueCenter';
import { useRoles } from '../lib/useRoles';
import { useQueue } from '../lib/useQueue';

const when = (t: number) => new Date(t).toLocaleString();

/** Changes made on this phone that Odoo doesn't have yet, oldest first. */
export function WaitingScreen() {
  const { offline } = useOdoo();
  const { roles } = useRoles();
  const { items, sending, sendNow, retry, remove, last } = useQueue();
  return (
    <Screen title="Waiting to send" testID="waiting-screen">
      <Card>
        <Body>{items.length ? 'These were saved on this phone and go to Odoo, oldest first, as soon as there is signal.' : 'Nothing is waiting. Everything is in Odoo.'}</Body>
        {offline ? <Body muted>No signal right now. The app keeps trying every minute.</Body> : null}
        {last?.offline ? <Body muted>The last try couldn’t reach Odoo.</Body> : null}
        {items.length ? <Button label="Send now" busy={sending} onPress={() => sendNow()} testID="send-now" /> : null}
      </Card>
      {items.map((x) => (
        <Card key={x.id} testID={`queued-${x.id}`}>
          <Row title={x.label} detail={`Saved ${when(x.createdAt)} · for ${dbName(x.db)}${x.tries ? ` · tried ${x.tries} ${x.tries === 1 ? 'time' : 'times'}` : ''}`} />
          <Body muted>{`Steps: ${stepsOf(x).join(', then ')}`}</Body>
          {x.state === 'stuck' ? (
            <>
              <ErrorText>{`Why it failed: ${plainReason(x.error)}`}</ErrorText>
              <Body muted>Nothing after this is sent until it is sorted, so things reach Odoo in order. Fix it in Odoo and try again.</Body>
              <Button label="Try again" onPress={() => retry(x.id)} testID={`retry-${x.id}`} />
              {roles.owner ? (
              <Button
                  label="Remove without sending"
                  kind="danger"
                  onPress={() =>
                    Alert.alert('Remove this change?', `“${x.label}” will never reach Odoo.`, [
                      { text: 'Keep it', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => remove(x.id) },
                    ])
                  }
                  testID={`remove-${x.id}`}
                />
              ) : (
                <Body muted>Only the owner can remove it.</Body>
              )}
            </>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { dbKindChanged, useDbKind } from '../components/Bands';
import { Body, Button, Card, Chip, ErrorText, Field, Row, Screen, Segments, SwitchRow, useUi } from '../components/ui';
import { BUILD_INFO, RELEASE, UPDATE_CHANNEL } from '../lib/appVersion';
import { dbId, dbLabel, DbTarget, hasSavedSecret, KnownDb, knownDatabases, OWNER_KEY, secretFor, setDbKind, switchDatabase, switchWarning } from '../lib/dbSwitch';
import { deviceSnapshots } from '../lib/dbSnapshots';
import { onDevFlags, pretendOffline, rolePreview, setPretendOffline, setRolePreview, setWeakSignal, Signal, weakSignal } from '../lib/devFlags';
import { log, logText } from '../lib/log';
import { CheckReport, checkOdoo } from '../lib/odooCheck';
import { checkAndFetchOta } from '../lib/otaUpdate';
import { guessDb, OdooClient, OdooError } from '../lib/odoo';
import { latestNote } from '../lib/releaseNotes';
import { RoleId, ROLES } from '../lib/roles';
import { deviceSecrets } from '../lib/secrets';
import { doneCount, loadTicks, setTick, Ticks } from '../lib/testChecklist';
import { testNoteChange } from '../lib/testNote';
import { readBeta, setBeta } from '../lib/updateChannel';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useRoles } from '../lib/useRoles';

const why = (e: unknown) => (e instanceof OdooError || e instanceof Error ? e.message : String(e));

/* --------------------------------------------------------------- Database */

function DatabaseCard() {
  const odoo = useOdoo();
  const { client } = odoo;
  const { items } = useQueue();
  const kind = useDbKind();
  const [known, setKnown] = useState<KnownDb[]>([]);
  const [url, setUrl] = useState('');
  const [db, setDb] = useState('');
  const [login, setLogin] = useState(client?.session.login ?? odoo.saved?.login ?? '');
  const [secret, setSecret] = useState('');
  const [isTest, setIsTest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    knownDatabases(AsyncStorage).then(setKnown);
  }, [client]);

  const mark = async (k: 'live' | 'test' | null) => {
    if (!client) return;
    await setDbKind(AsyncStorage, client.session, k);
    dbKindChanged();
  };

  /** Signs in to the other database first, so a wrong key or name changes nothing; then swaps the phone's data over. */
  const go = useCallback(
    async (to: DbTarget, key: string, test: boolean) => {
      setBusy(true);
      setError('');
      setDone('');
      try {
        await OdooClient.signIn((u, i) => fetch(u, i), to, key);
        const owner = await AsyncStorage.getItem(OWNER_KEY);
        const from = client ? { url: client.session.url, db: client.session.db, login: client.session.login } : null;
        if (owner !== dbId(to)) await switchDatabase({ storage: AsyncStorage, snapshots: deviceSnapshots(), secrets: deviceSecrets() }, from, to, key);
        await setDbKind(AsyncStorage, to, test ? 'test' : null);
        const ok = await odoo.signIn(to, key);
        dbKindChanged();
        setSecret('');
        setDone(ok ? `Now on ${dbLabel(to)}.` : 'Switched, but signing in failed. Try signing in again.');
        log.info('app', `switched database to ${dbLabel(to)}${test ? ' (test copy)' : ''}`);
      } catch (e) {
        setError(why(e));
      } finally {
        setBusy(false);
      }
    },
    [client, odoo],
  );

  const confirmGo = (to: DbTarget, key: string, test: boolean) => {
    if (!client) return go(to, key, test);
    const waiting = items.length ? `${items.length} ${items.length === 1 ? 'change' : 'changes'}` : '';
    Alert.alert(`Switch to ${dbLabel(to)}?`, switchWarning(waiting, client.session, to), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch', onPress: () => go(to, key, test) },
    ]);
  };

  const others = known.filter((k) => !client || k.id !== dbId(client.session));

  return (
    <Card title="Database" testID="dev-database">
      {client ? (
        <>
          <Row title="Attached to" value={dbLabel(client.session)} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label={kind === 'test' ? 'Test copy' : kind === 'live' ? 'Live database' : 'Not marked'} testID="db-kind" />
          </View>
          <Segments
            options={[
              { id: 'test', label: 'Test copy' },
              { id: 'live', label: 'Live' },
              { id: 'none', label: 'Not marked' },
            ]}
            value={kind ?? 'none'}
            onChange={(v) => mark(v === 'none' ? null : v)}
            testID="mark-db"
          />
          <Body muted>A test copy shows the orange TEST DATABASE band on every screen, and unlocks the test note below.</Body>
        </>
      ) : (
        <Body>Not signed in. Fill in the form below to attach this phone to a database.</Body>
      )}

      {others.length ? <Text style={{ fontWeight: '700' }}>Switch back to</Text> : null}
      {others.map((k) => (
        <Row
          key={k.id}
          title={dbLabel(k)}
          detail={k.login}
          onPress={async () => {
            const key = (await hasSavedSecret(deviceSecrets(), k)) ? await deviceSecrets().get(secretFor(k.id)) : null;
            if (key) confirmGo(k, key, false);
            else {
              setUrl(k.url);
              setDb(k.db);
              setLogin(k.login);
              setError('Type the API key for that database below.');
            }
          }}
          testID={`known-${k.db}`}
        />
      ))}

      <Text style={{ fontWeight: '700' }}>{client ? 'Switch database' : 'Attach to a database'}</Text>
      <Field label="Odoo address" value={url} onChangeText={(t) => { setUrl(t); if (!db) setDb(guessDb(t)); }} placeholder="test.food.example.com" keyboardType="url" testID="dev-url" />
      <Field label="Database" value={db} onChangeText={setDb} testID="dev-db" />
      <Field label="Email" value={login} onChangeText={setLogin} keyboardType="email-address" testID="dev-login" />
      <Field label="API key" value={secret} onChangeText={setSecret} secureTextEntry testID="dev-secret" />
      <SwitchRow title="This is a test copy" value={isTest} onChange={setIsTest} testID="dev-is-test" />
      <Body muted>The phone keeps each database’s data apart. Nothing saved for one database is ever sent to another. The key is kept in the phone’s keystore only.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {done ? <Body>{done}</Body> : null}
      <Button label={client ? 'Switch' : 'Attach and sign in'} busy={busy} disabled={!url || !db || !login || !secret} onPress={() => confirmGo({ url, db, login }, secret, isTest)} testID="dev-switch" />
    </Card>
  );
}

/* ------------------------------------------------------- Connection check */

function CheckCard() {
  const { client, offline } = useOdoo();
  const { mine } = useRoles();
  const s = useUi();
  const [report, setReport] = useState<CheckReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!client) return null;
  return (
    <Card title="Connection check" testID="dev-check">
      <Body muted>Reads what this Odoo has. It never installs an app or switches a setting; anything missing is for you to turn on in Odoo.</Body>
      {report ? (
        <>
          <Row title="Odoo" value={report.server} />
          <Row title="You" value={report.user} />
          {mine ? <Row title="Roles read from" value={mine.hasEmployee ? 'Your Employee tags' : mine.admin ? 'Odoo administrator' : mine.employeesApp ? 'No Employee for this login' : 'Employees not readable'} /> : null}
          {report.lines.map((l) => (
            <Row key={l.label} title={`${l.ok ? '✓' : '✗'} ${l.label}`} detail={l.note} testID={`check-${l.label}`} />
          ))}
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Run the check"
        busy={busy}
        disabled={offline}
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            setReport(await checkOdoo(client));
          } catch (e) {
            setError(why(e));
          } finally {
            setBusy(false);
          }
        }}
        testID="run-check"
      />
      <Text style={s.muted}>{`Odoo ${client.session.serverVersion || 'version unknown'}`}</Text>
    </Card>
  );
}

/* -------------------------------------------------------- Testing switches */

function SwitchesCard() {
  const { mine } = useRoles();
  const [, tick] = useState(0);
  useEffect(() => onDevFlags(() => tick((n) => n + 1)), []);
  return (
    <Card title="Testing switches" testID="dev-switches">
      <Body muted>These change only what this phone does, and all switch off when the app restarts.</Body>
      <SwitchRow title="Pretend offline" detail="Every Odoo call fails as if there were no signal" value={pretendOffline()} onChange={setPretendOffline} testID="pretend-offline" />
      <Text style={{ fontWeight: '700' }}>Signal</Text>
      <Segments<Signal>
        options={[
          { id: 'normal', label: 'Normal' },
          { id: 'slow', label: 'Slow (5 s)' },
          { id: 'flaky', label: 'Drops 1 in 4' },
        ]}
        value={weakSignal()}
        onChange={setWeakSignal}
        testID="signal"
      />
      {mine?.roles.owner ? (
        <>
          <Text style={{ fontWeight: '700' }}>Look at the app as</Text>
          <Segments<RoleId | 'me'>
            options={[{ id: 'me', label: 'Me' }, ...ROLES.map((r) => ({ id: r.id, label: r.label }))]}
            value={rolePreview() ?? 'me'}
            onChange={(v) => setRolePreview(v === 'me' ? null : v)}
            testID="preview"
          />
        </>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------- Queue */

function QueueCard() {
  const { client } = useOdoo();
  const { items, sending, sendNow, save } = useQueue();
  const kind = useDbKind();
  const [msg, setMsg] = useState('');
  if (!client) return null;
  return (
    <Card title="Offline queue" testID="dev-queue">
      <Row title="Waiting to send" value={String(items.length)} testID="queue-count" />
      <Button label="Send now" kind="plain" busy={sending} disabled={!items.length} onPress={() => sendNow()} testID="dev-send-now" />
      {kind === 'test' ? (
        <>
          <Body muted>Adds a note on your own contact in Odoo through the queue. With Pretend offline on, it waits; turn it off and it sends by itself.</Body>
          <Button
            label="Send a test note"
            onPress={async () => {
              setMsg('');
              try {
                const r = await save(testNoteChange(client.session.partnerId));
                setMsg(r.status === 'saved' ? 'Sent to Odoo.' : 'No signal: kept in the queue.');
              } catch (e) {
                setMsg(`Odoo refused it: ${why(e)}`);
              }
            }}
            testID="test-note"
          />
        </>
      ) : (
        <Body muted>Mark this database as a test copy to send a test note.</Body>
      )}
      {msg ? <Body>{msg}</Body> : null}
    </Card>
  );
}

/* ----------------------------------------------------------------- Updates */

function UpdatesCard() {
  const [beta, setBetaOn] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    readBeta().then(setBetaOn);
  }, []);
  return (
    <Card title="Updates" testID="dev-updates">
      <Body muted>{BUILD_INFO}</Body>
      <Row title="Channel" value={UPDATE_CHANNEL ?? 'none in this build'} />
      <SwitchRow
        title="Beta updates"
        detail="Get every merged change right away. Off: only what Justin sends to everyone."
        value={beta}
        onChange={async (on) => {
          const ok = await setBeta(on, Updates);
          if (ok) {
            setBetaOn(on);
            setMsg('Saved. Close and reopen the app to switch channel.');
          } else setMsg('This build can’t switch channel (development build, or no update address yet).');
        }}
        testID="beta-switch"
      />
      <Button
        label="Check for an update now"
        kind="plain"
        onPress={async () => {
          const r = await checkAndFetchOta(Updates);
          setMsg(r === 'ready' ? 'An update downloaded. Use Restart at the bottom.' : r === 'current' ? 'This is the newest update.' : r === 'off' ? 'Updates are off in this build.' : 'Couldn’t check. Try again with signal.');
        }}
        testID="check-update"
      />
      {msg ? <Body>{msg}</Body> : null}
    </Card>
  );
}

/* -------------------------------------------------------- What to test */

function TestListCard() {
  const note = latestNote(RELEASE);
  const [ticks, setTicks] = useState<Ticks>({});
  useEffect(() => {
    loadTicks(RELEASE).then(setTicks);
  }, []);
  if (!note) return null;
  return (
    <Card title={`What to test in ${note.release}`} testID="dev-test-list">
      {note.changes.map((c) => (
        <Body key={c}>{c}</Body>
      ))}
      <Body muted>{`${doneCount(ticks, note.test.length)} of ${note.test.length} passed`}</Body>
      {note.test.map((t, i) => (
        <View key={t} style={{ gap: 6 }}>
          <Body>{`${ticks[i] === 'pass' ? '✓' : ticks[i] === 'problem' ? '✗' : '○'} ${t}`}</Body>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Works" kind={ticks[i] === 'pass' ? 'main' : 'plain'} onPress={() => setTick(RELEASE, i, 'pass').then(setTicks)} testID={`tick-pass-${i}`} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Problem" kind={ticks[i] === 'problem' ? 'danger' : 'plain'} onPress={() => setTick(RELEASE, i, 'problem').then(setTicks)} testID={`tick-problem-${i}`} />
            </View>
          </View>
        </View>
      ))}
    </Card>
  );
}

/* --------------------------------------------------------------------- Log */

function LogCard() {
  const [, tick] = useState(0);
  useEffect(() => log.subscribe(() => tick((n) => n + 1)), []);
  const [problems, setProblems] = useState(false);
  const all = log.all();
  const shownAll = problems ? all.filter((e) => e.level !== 'info') : all;
  const lines = shownAll.slice(-100).reverse();
  return (
    <Card title="Log" testID="dev-log">
      <Body muted>The screens opened, saves, and what Odoo answered, for the last 7 days. Quick reads that worked are left out. Keys and passwords are never written here.</Body>
      <SwitchRow title="Problems only" value={problems} onChange={setProblems} testID="log-problems" />
      <Button label={problems ? 'Share the problems' : 'Share the log'} kind="plain" onPress={() => Share.share({ message: logText(shownAll) }).catch(() => undefined)} testID="share-log" />
      {lines.map((e, i) => (
        <Body key={`${e.t}-${i}`} muted>{`${new Date(e.t).toLocaleTimeString()} ${e.level === 'info' ? '' : e.level.toUpperCase() + ' '}[${e.area}] ${e.msg}`}</Body>
      ))}
      <Button label="Clear the log" kind="plain" onPress={() => log.clear()} testID="clear-log" />
    </Card>
  );
}

/**
 * The test dashboard: which database the phone is on (and switching to the
 * test copy), a connection check, testing switches, the offline queue,
 * updates, the What to test list and the log. Reached from the sign-in
 * screen, from the owner's home screen, or by tapping the version on
 * Settings seven times.
 */
export function DeveloperScreen() {
  return (
    <Screen title="Developer" testID="developer-screen">
      <DatabaseCard />
      <CheckCard />
      <QueueCard />
      <SwitchesCard />
      <UpdatesCard />
      <TestListCard />
      <LogCard />
    </Screen>
  );
}

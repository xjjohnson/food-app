import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { loadSettings, settingChange, shelfLifeDefault, useByDays } from '../lib/appSettings';
import { useQueue } from '../lib/useQueue';
import { Image, View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Row, Screen, Segments, SwitchRow } from '../components/ui';
import { listPeople, Person, roleNames, ROLES, Roles, saveRoles } from '../lib/roles';
import { useBrand } from '../lib/useBrand';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

function PersonRoles({ person, onSaved }: { person: Person; onSaved: (p: Person) => void }) {
  const { client } = useOdoo();
  const [want, setWant] = useState<Roles>(person.roles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = ROLES.some((r) => want[r.id] !== person.roles[r.id]);
  return (
    <View style={{ gap: 4 }} testID={`person-${person.id}`}>
      {!person.login ? <Body muted>No Odoo login linked to this employee, so they can’t sign in to the app yet. Link a user on the Employee in Odoo.</Body> : null}
      {ROLES.map((r) => (
        <SwitchRow key={r.id} title={r.label} detail={r.detail} value={want[r.id]} onChange={(v) => setWant({ ...want, [r.id]: v })} testID={`role-${person.id}-${r.id}`} />
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Save roles in Odoo"
        disabled={!changed || !client}
        busy={busy}
        onPress={async () => {
          if (!client) return;
          setBusy(true);
          setError('');
          try {
            const roles = await saveRoles(client, person.id, want);
            onSaved({ ...person, roles });
          } catch (e) {
            setError(why(e));
          } finally {
            setBusy(false);
          }
        }}
        testID={`save-roles-${person.id}`}
      />
    </View>
  );
}

/** How many days ahead a use-by alert shows. Saved in Odoo so every phone uses the same number. */
function StockAlerts() {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    loadSettings(client).then((s) => setDays(String(useByDays(s))));
  }, [client, offline]);
  const n = Number(days);
  return (
    <Card title="Stock alerts" testID="alerts-card">
      <Field label="Show use-by alerts this many days ahead" value={days} onChangeText={setDays} keyboardType="number-pad" testID="alert-days" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Save"
        disabled={!(Number.isInteger(n) && n >= 1 && n <= 365)}
        testID="alert-save"
        onPress={async () => {
          setError('');
          try {
            const out = await save(settingChange('useByDays', String(n)));
            setNote(out.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
          } catch (e) {
            setError(`Odoo would not take that. ${e instanceof Error ? e.message : String(e)}`);
          }
        }}
      />
    </Card>
  );
}

/** The shelf life used to fill in a use-by date when a product has none in Odoo. */
function ShelfLifeDefault() {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    loadSettings(client).then((s) => setDays(String(shelfLifeDefault(s) ?? '')));
  }, [client, offline]);
  const n = Number(days);
  return (
    <Card title="Shelf life" testID="shelf-card">
      <Body muted>When a batch is finished, the use-by date starts as today plus the product’s shelf life in Odoo. If a product has none, it uses this many days instead.</Body>
      <Field label="Default shelf life in days" value={days} onChangeText={setDays} keyboardType="number-pad" testID="shelf-days" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Save"
        disabled={!(Number.isInteger(n) && n >= 1 && n <= 3650)}
        testID="shelf-save"
        onPress={async () => {
          setError('');
          try {
            const out = await save(settingChange('shelfLifeDays', String(n)));
            setNote(out.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
          } catch (e) {
            setError(`Odoo would not take that. ${e instanceof Error ? e.message : String(e)}`);
          }
        }}
      />
    </Card>
  );
}

/** The owner's area: who does what, the company brand, and setup. Hidden from everyone else. */
export function ManagementScreen() {
  const { client, offline } = useOdoo();
  const { roles, reload: reloadMine } = useRoles();
  const { brand, name, colors, refresh } = useBrand();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [part, setPart] = useState<'people' | 'setup' | 'odoo'>('people');

  const load = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    setError('');
    try {
      setPeople(await listPeople(client));
    } catch (e) {
      setError(`Couldn’t read the employees from Odoo. ${why(e)}`);
    } finally {
      setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    if (roles.owner && !offline) load();
  }, [roles.owner, offline, load]);

  if (!roles.owner)
    return (
      <Screen title="Management">
        <Body>Only the owner can open this.</Body>
      </Screen>
    );

  return (
    <Screen title="Management" testID="management-screen">
      <Segments
        value={part}
        onChange={setPart}
        options={[{ id: 'people', label: 'People' }, { id: 'setup', label: 'Setup' }, { id: 'odoo', label: 'Odoo' }]}
        testID="mgmt-part"
      />
      {part === 'people' ? (
      <Card title="People and roles">
        <Body muted>Roles decide which parts of the app each person sees. They are saved as Tags on each Employee in Odoo, so you can also change them there. What someone may change is still up to their Odoo access rights.</Body>
        {offline ? <Body muted>No signal: roles can be changed once the phone is back online.</Body> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {people?.map((p) => (
          <View key={p.id}>
            <Row title={p.name} detail={roleNames(p.roles) || 'No role'} value={open === p.id ? '▲' : '▼'} onPress={() => setOpen(open === p.id ? null : p.id)} testID={`open-person-${p.id}`} />
            {open === p.id ? (
              <PersonRoles
                person={p}
                onSaved={(np) => {
                  setPeople((list) => list?.map((x) => (x.id === np.id ? np : x)) ?? null);
                  if (np.login && np.login === client?.session.login) reloadMine();
                }}
              />
            ) : null}
          </View>
        ))}
        {people && !people.length ? <Body>No employees in Odoo yet. Add them in Odoo’s Employees app.</Body> : null}
        <Button label="Read again from Odoo" kind="plain" busy={busy} disabled={offline} onPress={load} testID="reload-people" />
      </Card>
      ) : null}

      {part === 'setup' ? (
      <>
      <Card title="Company brand" testID="brand-card">
        <Body muted>The app’s name, logo and colors come from your company in Odoo (Settings, Companies, and Configure Document Layout for the colors). Change them there; the app follows.</Body>
        <Row title="Name" value={name} />
        {brand.logo ? <Image source={{ uri: brand.logo }} style={{ width: 120, height: 60 }} resizeMode="contain" accessibilityLabel="Company logo" /> : <Row title="Logo" value="None in Odoo" />}
        <Row title="Main color" value={brand.primary || 'None in Odoo'} right={<View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: colors.head }} />} />
        <Row title="Second color" value={brand.secondary || 'None in Odoo'} right={<View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: colors.second }} />} />
        <Button label="Read the brand again" kind="plain" disabled={offline} onPress={() => refresh()} testID="refresh-brand" />
      </Card>

      <Card title="Mileage">
        <Row title="Mileage" detail="Odometer readings with Odoo’s free Fleet app" onPress={() => router.push('/mileage')} testID="open-mileage" />
      </Card>
      <Card title="Events and booths">
        <Row title="Events and booths" detail="Dates, place, bring-list and results" onPress={() => router.push('/events')} testID="open-events" />
      </Card>
      <Card title="Prices and seasons">
        <Row title="Prices and seasons" detail="Customer groups (price lists) and when products are in season" onPress={() => router.push('/prices')} testID="open-prices" />
      </Card>

      <StockAlerts />
      <ShelfLifeDefault />
      </>
      ) : null}

      {part === 'odoo' ? (
        <Card title="Odoo connection" testID="odoo-card">
          <Body muted>Check that Odoo is set up the way the app needs, and use the test database. The check only reads. It never changes Odoo.</Body>
          <Row title="Connection check and test database" detail="Developer screen" onPress={() => router.push('/developer')} testID="open-developer" />
        </Card>
      ) : null}
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { Body, Button, ErrorText, Field, Row, Screen } from '../components/ui';
import { loadSettings, settingChange } from '../lib/appSettings';
import { useInnerBack } from '../lib/innerBack';
import { seasonFromLine, seasonKey, seasonToLine, validDay, inSeason, daysUntilStart } from '../lib/season';
import { GROUP_RULES, GROUP_SECTIONS, Group, loadGroups } from '../lib/shop';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useRoles } from '../lib/useRoles';
import { GenericForm } from './GenericForm';
import { LinesScreen } from './SubRecordsEditor';
import { useProductSearch } from './StockExtras';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Page = { p: 'menu' } | { p: 'groups' } | { p: 'group'; id?: number; rules?: boolean } | { p: 'seasons' };

/** Prices and seasons, for the owner: customer groups (price lists) and the season of each product. */
export function PricesScreen() {
  const { roles } = useRoles();
  const [page, setPage] = useState<Page>({ p: 'menu' });
  const menu = () => setPage({ p: 'menu' });
  useInnerBack(page.p === 'menu' ? null : page.p === 'group' && page.rules ? () => setPage({ p: 'group', id: page.id }) : page.p === 'group' ? () => setPage({ p: 'groups' }) : menu);
  if (!roles.owner)
    return (
      <Screen title="Prices and seasons" testID="prices-screen">
        <Body>Only the owner can open this.</Body>
      </Screen>
    );
  if (page.p === 'groups') return <Groups onBack={menu} onOpen={(id) => setPage({ p: 'group', id })} />;
  if (page.p === 'group') {
    if (page.rules && page.id) return <LinesScreen title="Rules" onBack={() => setPage({ p: 'group', id: page.id })} spec={GROUP_RULES} domain={[['pricelist_id', '=', page.id]]} base={{ pricelist_id: page.id }} label="Customer group" addLabel="Add a rule" canEdit lockedNote="" />;
    return (
      <GenericForm
        model="product.pricelist"
        recordId={page.id ?? null}
        title="Customer group"
        noun="Group"
        sections={GROUP_SECTIONS}
        required={['name']}
        testID="group-form"
        onBack={() => setPage({ p: 'groups' })}
        extraTabs={page.id ? [{ id: 'rules', label: 'Rules', render: () => <Button label="Edit the price rules" onPress={() => setPage({ p: 'group', id: page.id, rules: true })} testID="group-rules" /> }] : undefined}
      />
    );
  }
  if (page.p === 'seasons') return <Seasons onBack={menu} />;
  return (
    <Screen title="Prices and seasons" testID="prices-screen">
      <Row title="Customer groups" detail="Price lists, like Wholesale. Set a customer’s group on their page" onPress={() => setPage({ p: 'groups' })} testID="prices-groups" />
      <Row title="Seasons" detail="When each product is in season" onPress={() => setPage({ p: 'seasons' })} testID="prices-seasons" />
    </Screen>
  );
}

function Groups({ onBack, onOpen }: { onBack: () => void; onOpen: (id?: number) => void }) {
  const { client, offline } = useOdoo();
  const [rows, setRows] = useState<Group[] | null>(null);
  const [off, setOff] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    client.hasGroup('product.group_product_pricelist').then((on) => {
      setOff(!on);
      if (on) loadGroups(client).then(setRows).catch((e) => setError(`Couldn’t read price lists. ${why(e)}`));
    }).catch(() => loadGroups(client).then(setRows).catch((e) => setError(why(e))));
  }, [client, offline]);
  return (
    <Screen title="Customer groups" testID="groups-page">
      {off ? <Body>Turn on Pricelists in Odoo first: Sales, Settings, Pricing. Then come back here.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows?.map((g) => (
        <Row key={g.id} title={g.name} detail={`${g.currency} · ${g.rules} rules`} onPress={() => onOpen(g.id)} testID={`group-${g.id}`} />
      ))}
      {!off ? <Button label="New customer group" onPress={() => onOpen(undefined)} testID="group-new" /> : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function Seasons({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [pick, setPick] = useState<{ id: number; name: string } | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [list, setList] = useState<{ id: number; name: string; line: string }[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const search = useProductSearch(!pick);
  const load = async () => {
    if (!client || offline) return;
    const s = await loadSettings(client);
    const ids = Object.keys(s).filter((k) => k.startsWith('season.')).map((k) => Number(k.slice(7))).filter(Boolean);
    const names = ids.length ? ((await client.call('product.product', 'read', [ids], { fields: ['display_name'] })) as { id: number; display_name?: string }[]) : [];
    setList(ids.map((id) => ({ id, name: String(names.find((n) => n.id === id)?.display_name ?? `Product ${id}`), line: s[seasonKey(id)] ?? '' })).filter((x) => seasonFromLine(x.line)));
  };
  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, offline]);
  useInnerBack(pick ? () => setPick(null) : null);
  if (pick)
    return (
      <Screen title={pick.name} testID="season-form">
        <Body muted>Type the first and last day of the season as month-day, like 10-01 and 12-31. It repeats every year.</Body>
        <Field label="Starts (month-day)" value={start} onChangeText={setStart} testID="season-start" />
        <Field label="Ends (month-day)" value={end} onChangeText={setEnd} testID="season-end" />
        {start && !validDay(start) ? <ErrorText>Use the form 10-01.</ErrorText> : null}
        {end && !validDay(end) ? <ErrorText>Use the form 12-31.</ErrorText> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {note ? <Body>{note}</Body> : null}
        <Button
          label="Save season"
          disabled={!validDay(start) || !validDay(end)}
          testID="season-save"
          onPress={async () => {
            try {
              await save(settingChange(seasonKey(pick.id), seasonToLine({ start, end })));
              setNote('Saved.');
              setPick(null);
              await load();
            } catch (e) {
              setError(`Odoo would not take that. ${why(e)}`);
            }
          }}
        />
        <Button label="Remove the season" kind="plain" onPress={async () => { await save(settingChange(seasonKey(pick.id), '')); setPick(null); await load(); }} testID="season-clear" />
        <Button label="Back" kind="plain" onPress={() => setPick(null)} />
      </Screen>
    );
  return (
    <Screen title="Seasons" testID="seasons-page">
      <Body muted>Today shows what is in season and what starts within 2 weeks. The shop switch stays yours: turn products on in Online shop.</Body>
      {list.map((x) => {
        const s = seasonFromLine(x.line)!;
        return <Row key={x.id} title={x.name} detail={`${s.start} to ${s.end}`} value={inSeason(s) ? 'In season' : `starts in ${daysUntilStart(s)} days`} onPress={() => { setPick({ id: x.id, name: x.name }); setStart(s.start); setEnd(s.end); }} testID={`season-${x.id}`} />;
      })}
      <Field label="Add a product" value={search.text} onChangeText={search.setText} testID="season-find" />
      {search.text ? search.found.map((p) => <Row key={p.id} title={p.name} onPress={() => { setPick({ id: p.id, name: p.name }); setStart(''); setEnd(''); search.setText(''); }} testID={`season-add-${p.id}`} />) : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

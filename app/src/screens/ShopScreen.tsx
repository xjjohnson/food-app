import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen, SwitchRow } from '../components/ui';
import { useInnerBack } from '../lib/innerBack';
import { CARRIER_SECTIONS, Carrier, loadCarriers, loadReferrals, Referral, tagReferral, loadSpecials, Special, specialActive, specialChange, specialProblems } from '../lib/shop';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useRoles } from '../lib/useRoles';
import { GenericForm } from './GenericForm';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (n: number) => n.toFixed(2);
const SAVED = (queued: boolean) => (queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');

type Page = 'menu' | 'specials' | 'carriers';

/** The online shop, for the owner: specials, and delivery and pickup. Which products are on the shop is set on each product. */
export function ShopScreen() {
  const { roles } = useRoles();
  const [page, setPage] = useState<Page>('menu');
  const back = () => setPage('menu');
  useInnerBack(page !== 'menu' ? back : null);
  if (!roles.owner)
    return (
      <Screen title="Online shop" testID="shop-screen">
        <Body>Only the owner can open this.</Body>
      </Screen>
    );
  if (page === 'specials') return <Specials onBack={back} />;
  if (page === 'carriers') return <Carriers onBack={back} />;
  return (
    <Screen title="Online shop" testID="shop-screen">
      <Row title="Specials" detail="Discount codes" onPress={() => setPage('specials')} testID="shop-specials" />
      <Row title="Delivery and pickup" detail="Areas, prices and the pickup place" onPress={() => setPage('carriers')} testID="shop-carriers" />
    </Screen>
  );
}

function Page({ title, onBack, children, testID }: { title: string; onBack: () => void; children: React.ReactNode; testID: string }) {
  return (
    <Screen title={title} testID={testID}>
      {children}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function Specials({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [rows, setRows] = useState<Special[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', code: '', percent: '', from: '', to: '', max: '' });
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (client && !offline) loadSpecials(client).then(setRows).catch((e) => setError(`Couldn’t read the specials. Is Discount and Loyalty on in Odoo Sales settings? ${why(e)}`));
  }, [client, offline]);
  useEffect(load, [load]);
  const problems = specialProblems({ name: f.name, code: f.code, percentText: f.percent, from: f.from, to: f.to });
  if (adding)
    return (
      <Page title="New special" onBack={() => setAdding(false)} testID="special-form">
        <Field label="Name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} testID="sp-name" />
        <Field label="Code customers type" value={f.code} onChangeText={(v) => setF({ ...f, code: v })} autoCapitalize="characters" testID="sp-code" />
        <Field label="Percent off the whole order" value={f.percent} onChangeText={(v) => setF({ ...f, percent: v })} keyboardType="decimal-pad" testID="sp-percent" />
        <Field label="Starts (year-month-day, optional)" value={f.from} onChangeText={(v) => setF({ ...f, from: v })} testID="sp-from" />
        <Field label="Ends (year-month-day, optional)" value={f.to} onChangeText={(v) => setF({ ...f, to: v })} testID="sp-to" />
        <Field label="Most times it can be used (optional)" value={f.max} onChangeText={(v) => setF({ ...f, max: v })} keyboardType="number-pad" testID="sp-max" />
        <Body muted>Odoo works out the discount. The app only sets the code and the percent.</Body>
        {f.name || f.code ? problems.map((p) => <ErrorText key={p}>{p}</ErrorText>) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {note ? <Body>{note}</Body> : null}
        <Button
          label="Save special"
          disabled={problems.length > 0}
          testID="sp-save"
          onPress={async () => {
            try {
              const r = await save(specialChange({ name: f.name, code: f.code, percent: Number(f.percent.replace(',', '.')), from: f.from, to: f.to, maxUses: Number(f.max) > 0 ? Number(f.max) : null }));
              setNote(SAVED(r.status === 'queued'));
              setAdding(false);
              setF({ name: '', code: '', percent: '', from: '', to: '', max: '' });
              load();
            } catch (e) {
              setError(`Odoo would not take that. ${why(e)}`);
            }
          }}
        />
      </Page>
    );
  return (
    <Page title="Specials" onBack={onBack} testID="specials-page">
      <Body muted>Needs Discount and Loyalty switched on in Odoo, Sales settings.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      {rows && !rows.length ? <Body muted>No specials yet.</Body> : null}
      {rows?.map((s) => (
        <SwitchRow key={s.id} title={`${s.name}${s.code ? ` · ${s.code}` : ''}`} detail={s.from || s.to ? `${s.from || '…'} to ${s.to || '…'}` : 'No dates'} value={s.active} onChange={async (v) => { try { await save(specialActive(s.id, s.name, v)); load(); } catch (e) { setError(`Odoo would not take that. ${why(e)}`); } }} testID={`special-${s.id}`} />
      ))}
      <Button label="New special" onPress={() => setAdding(true)} testID="sp-new" />
    </Page>
  );
}

function Carriers({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [rows, setRows] = useState<Carrier[] | null>(null);
  const [form, setForm] = useState<{ id?: number } | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  useInnerBack(form ? () => setForm(null) : null);
  useEffect(() => {
    if (client && !offline) loadCarriers(client).then(setRows).catch((e) => setError(`Couldn’t read delivery methods. Is Delivery on in Odoo? ${why(e)}`));
  }, [client, offline, tick]);
  if (form)
    return <GenericForm model="delivery.carrier" recordId={form.id ?? null} title="Delivery or pickup" noun="Method" sections={CARRIER_SECTIONS} required={['name']} testID="carrier-form" onBack={() => { setForm(null); setTick((n) => n + 1); }} />;
  return (
    <Page title="Delivery and pickup" onBack={onBack} testID="carriers-page">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows && !rows.length ? <Body muted>No delivery or pickup methods yet.</Body> : null}
      {rows?.map((r) => (
        <Row key={r.id} title={r.name} detail={`${r.onSite ? 'Pickup' : 'Delivery'}${r.zips ? ` · zip ${r.zips}` : ''}`} value={r.onSite ? '' : money(r.price)} onPress={() => setForm({ id: r.id })} testID={`carrier-${r.id}`} />
      ))}
      <Button label="Add a delivery or pickup method" onPress={() => setForm({})} testID="carrier-new" />
    </Page>
  );
}

/** On a customer's page: who sent them, and the people they sent. Needs signal. No rewards are sent. */
export function ReferralBox({ partnerId, name }: { partnerId: number; name: string }) {
  const { client, offline } = useOdoo();
  const [list, setList] = useState<Referral[]>([]);
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ id: number; name: string }[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (client && !offline) loadReferrals(client, name).then(setList).catch(() => undefined);
  }, [client, offline, name]);
  useEffect(() => {
    if (!client || offline || text.trim().length < 2) return setFound([]);
    const t = setTimeout(() => client.call('res.partner', 'search_read', [[['name', 'ilike', text.trim()], ['id', '!=', partnerId]]], { fields: ['name'], limit: 6 }).then((r) => setFound(r as { id: number; name: string }[])).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [client, offline, text, partnerId]);
  return (
    <Card title="Sent by and people they sent" testID="referral-box">
      {list.length ? list.map((r) => <Row key={r.id} title={r.name} value={`${r.orders} orders`} />) : <Body muted>{`Nobody is marked as sent by ${name}.`}</Body>}
      <Field label="This customer was sent by (type a name)" value={text} onChangeText={setText} testID="referral-find" />
      {found.map((f) => (
        <Row
          key={f.id}
          title={f.name}
          testID={`referral-pick-${f.id}`}
          onPress={async () => {
            try {
              await tagReferral(client!, partnerId, f.name);
              setNote(`Marked as sent by ${f.name}. It is a tag on the customer in Odoo.`);
              setText('');
            } catch (e) {
              setError(`Odoo would not take that. ${why(e)}`);
            }
          }}
        />
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
    </Card>
  );
}

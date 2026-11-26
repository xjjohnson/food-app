import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen, SwitchRow } from '../components/ui';
import { loadSettings } from '../lib/appSettings';
import { useInnerBack } from '../lib/innerBack';
import { draftChange, listModelId, loadDrafts, loadLists, MailList, newsletterBody, newsletterProblems, Draft, sendNewsletter } from '../lib/newsletter';
import { CARRIER_SECTIONS, Carrier, closeDayChange, feedbackChange, isClosed, loadCarriers, loadFeedback, loadReferrals, loadShop, Referral, tagReferral, loadSpecials, loadWebOrders, ShopRow, shopSwitch, Special, specialActive, specialChange, specialProblems, WebOrder } from '../lib/shop';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useRoles } from '../lib/useRoles';
import { GenericForm } from './GenericForm';
import { useProductSearch } from './StockExtras';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (n: number) => n.toFixed(2);
const SAVED = (queued: boolean) => (queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Page = 'menu' | 'shop' | 'orders' | 'specials' | 'carriers' | 'closed' | 'news';

/** The online shop, for the owner: switches, new orders, specials, delivery and pickup, closed days, newsletter. */
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
  if (page === 'shop') return <ShopList onBack={back} />;
  if (page === 'orders') return <WebOrders onBack={back} />;
  if (page === 'specials') return <Specials onBack={back} />;
  if (page === 'carriers') return <Carriers onBack={back} />;
  if (page === 'closed') return <ClosedDays onBack={back} />;
  if (page === 'news') return <Newsletter onBack={back} />;
  return (
    <Screen title="Online shop" testID="shop-screen">
      <Row title="New website orders" detail="From the last few days" onPress={() => setPage('orders')} testID="shop-orders" />
      <Row title="On the shop" detail="Switch products on or off, sold out" onPress={() => setPage('shop')} testID="shop-list" />
      <Row title="Specials" detail="Discount codes" onPress={() => setPage('specials')} testID="shop-specials" />
      <Row title="Delivery and pickup" detail="Areas, prices and the pickup place" onPress={() => setPage('carriers')} testID="shop-carriers" />
      <Row title="Closed days" detail="Days you are not delivering (a warning only)" onPress={() => setPage('closed')} testID="shop-closed" />
      <Row title="Newsletter" detail="Pick new products, write, save a draft, send on your tap" onPress={() => setPage('news')} testID="shop-news" />
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

function ShopList({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [rows, setRows] = useState<ShopRow[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (client && !offline) loadShop(client).then(setRows).catch((e) => setError(why(e)));
  }, [client, offline]);
  const flip = async (r: ShopRow, field: 'is_published' | 'allow_out_of_stock_order', value: boolean) => {
    setError('');
    try {
      await save(shopSwitch(r.id, r.name, field, value));
      setRows((all) => all?.map((x) => (x.id === r.id ? { ...x, ...(field === 'is_published' ? { onShop: value } : { sellWhenOut: value }) } : x)) ?? null);
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };
  const shown = rows?.filter((r) => r.name.toLowerCase().includes(text.trim().toLowerCase()));
  return (
    <Page title="On the shop" onBack={onBack} testID="shoplist-page">
      <Body muted>Turn a product on to show it in the shop. “Sell when out of stock” keeps it orderable when stock is zero; off means customers see it as sold out.</Body>
      <Field label="Find a product" value={text} onChangeText={setText} testID="shop-find" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {shown?.map((r) => (
        <Card key={r.id} title={`${r.name} · ${money(r.price)}`}>
          <SwitchRow title="On the shop" value={r.onShop} onChange={(v) => flip(r, 'is_published', v)} testID={`shop-on-${r.id}`} />
          <SwitchRow title="Sell when out of stock" value={r.sellWhenOut} onChange={(v) => flip(r, 'allow_out_of_stock_order', v)} testID={`shop-out-${r.id}`} />
        </Card>
      ))}
    </Page>
  );
}

function WebOrders({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [rows, setRows] = useState<WebOrder[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (client && !offline) loadWebOrders(client).then(setRows).catch((e) => setError(`Couldn’t read the orders. ${why(e)}`));
  }, [client, offline]);
  return (
    <Page title="New website orders" onBack={onBack} testID="weborders-page">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows && !rows.length ? <Body muted>No website orders in the last 3 days.</Body> : null}
      {rows?.map((o) => (
        <Row key={o.id} title={o.customer || o.name} detail={`${o.name} · ${o.date}`} value={money(o.total)} />
      ))}
    </Page>
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

function ClosedDays({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [days, setDays] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (client && !offline) {
      const s = await loadSettings(client);
      const today = ymd(new Date());
      setDays(Object.keys(s).filter((k) => k.startsWith('closed.') && isClosed(s, k.slice(7)) && k.slice(7) >= today).map((k) => k.slice(7)).sort());
    }
  }, [client, offline]);
  useEffect(() => {
    load();
  }, [load]);
  const change = async (d: string, closed: boolean) => {
    setError('');
    try {
      await save(closeDayChange(d, closed));
      setDays((x) => (closed ? [...new Set([...x, d])].sort() : x.filter((y) => y !== d)));
      setDate('');
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };
  return (
    <Page title="Closed days" onBack={onBack} testID="closed-page">
      <Body muted>A closed day is a warning on the Delivery board. It does not stop an order.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {days.map((d) => (
        <Row key={d} title={d} value="Open it again" onPress={() => change(d, false)} testID={`closed-${d}`} />
      ))}
      <Field label="Close a day (year-month-day)" value={date} onChangeText={setDate} testID="closed-date" />
      <Button label="Close this day" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)} onPress={() => change(date, true)} testID="closed-add" />
    </Page>
  );
}

function Newsletter({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [lists, setLists] = useState<MailList[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [subject, setSubject] = useState('');
  const [words, setWords] = useState('');
  const [products, setProducts] = useState<{ id: number; name: string; price: number }[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [confirm, setConfirm] = useState<Draft | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const search = useProductSearch(true);
  const load = useCallback(() => {
    if (!client || offline) return;
    loadLists(client).then(setLists).catch((e) => setError(`Couldn’t read mailing lists. Is Email Marketing on in Odoo? ${why(e)}`));
    loadDrafts(client).then(setDrafts).catch(() => undefined);
  }, [client, offline]);
  useEffect(load, [load]);
  const problems = newsletterProblems(subject, words, picked);
  const people = lists.filter((l) => picked.includes(l.id)).reduce((n, l) => n + l.count, 0);
  if (confirm)
    return (
      <Page title="Send this newsletter?" onBack={() => setConfirm(null)} testID="news-confirm">
        <Body>{`“${confirm.subject}” goes to ${confirm.people} people. This cannot be taken back.`}</Body>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          label={`Send to ${confirm.people} people`}
          kind="danger"
          testID="news-send"
          onPress={async () => {
            try {
              await sendNewsletter(client!, confirm.id);
              setNote('Odoo is sending it.');
              setConfirm(null);
              load();
            } catch (e) {
              setError(`Odoo would not send it. ${why(e)}`);
            }
          }}
        />
      </Page>
    );
  return (
    <Page title="Newsletter" onBack={onBack} testID="news-page">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Card title="Who it goes to">
        {lists.map((l) => (
          <SwitchRow key={l.id} title={l.name} detail={`${l.count} people`} value={picked.includes(l.id)} onChange={(v) => setPicked(v ? [...picked, l.id] : picked.filter((x) => x !== l.id))} testID={`news-list-${l.id}`} />
        ))}
        {!lists.length ? <Body muted>No mailing lists found in Odoo.</Body> : null}
      </Card>
      <Field label="Subject" value={subject} onChangeText={setSubject} testID="news-subject" />
      <Field label="A few words" value={words} onChangeText={setWords} multiline testID="news-words" />
      <Card title="New products to show">
        {products.map((p) => (
          <Row key={p.id} title={p.name} value="Remove" onPress={() => setProducts(products.filter((x) => x.id !== p.id))} />
        ))}
        <Field label="Find a product" value={search.text} onChangeText={search.setText} testID="news-find" />
        {search.text
          ? search.found.filter((p) => !products.some((x) => x.id === p.id)).map((p) => <Row key={p.id} title={p.name} onPress={async () => { const [r] = (await client!.call('product.product', 'read', [[p.id]], { fields: ['list_price'] })) as { list_price?: number }[]; setProducts([...products, { id: p.id, name: p.name, price: Number(r?.list_price ?? 0) }]); search.setText(''); }} testID={`news-add-${p.id}`} />)
          : null}
      </Card>
      {subject || words ? problems.map((p) => <ErrorText key={p}>{p}</ErrorText>) : null}
      <Body muted>{picked.length ? `It would go to ${people} people.` : ''}</Body>
      <Button
        label="Save as a draft"
        disabled={problems.length > 0}
        testID="news-save"
        onPress={async () => {
          try {
            const r = await save(draftChange(subject, newsletterBody(words, products), picked, await listModelId(client!)));
            setNote(`${SAVED(r.status === 'queued')} It is not sent.`);
            setSubject('');
            setWords('');
            setProducts([]);
            load();
          } catch (e) {
            setError(`Odoo would not take that. ${why(e)}`);
          }
        }}
      />
      {drafts.length ? (
        <Card title="Drafts and sent">
          {drafts.map((d) => (
            <Row key={d.id} title={d.subject} detail={d.state === 'draft' ? `Draft · goes to ${d.people} people` : 'Sent'} onPress={d.state === 'draft' ? () => setConfirm(d) : undefined} testID={`news-draft-${d.id}`} />
          ))}
        </Card>
      ) : null}
    </Page>
  );
}

/** "How did it go?" after a delivery: stars and a comment, saved as a note on the order. */
export function FeedbackBox({ orderId, orderName }: { orderId: number; orderName: string }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [done, setDone] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (client && !offline) loadFeedback(client, orderId).then(setDone).catch(() => undefined);
  }, [client, offline, orderId]);
  if (done) return <Body>{`How it went: ${done} of 5 stars.`}</Body>;
  return (
    <Card title="How did it go?" testID={`feedback-${orderId}`}>
      <Row title={stars ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : 'Tap a number of stars'} detail="1 to 5" />
      {[1, 2, 3, 4, 5].map((n) => (
        <Button key={n} label={`${n} star${n === 1 ? '' : 's'}`} kind={stars === n ? 'main' : 'plain'} onPress={() => setStars(n)} testID={`feedback-star-${orderId}-${n}`} />
      ))}
      <Field label="Comment (optional)" value={comment} onChangeText={setComment} testID={`feedback-comment-${orderId}`} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Save"
        disabled={!stars}
        testID={`feedback-save-${orderId}`}
        onPress={async () => {
          try {
            await save(feedbackChange(orderId, orderName, stars, comment));
            setDone(stars);
          } catch (e) {
            setError(`Odoo would not take that. ${why(e)}`);
          }
        }}
      />
    </Card>
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Share } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Row, Screen, SwitchRow } from '../components/ui';
import { loadSettings, settingChange } from '../lib/appSettings';
import { DaySheetRow, DENOMS, drawerKey, drawerTotal, drawerWords, loadDaySheet, loadPriceSheet, loadResults, loadSessions, marketKey, PriceRow, priceSheetText, Session, SessionResults, takeFromLine, takeToLine, TakeRow, totalsFromLine, totalsKey, totalsMatch, totalsToLine, sellThrough } from '../lib/marketDay';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useProductSearch } from './StockExtras';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (n: number) => n.toFixed(2);
const qty = (n: number) => String(Math.round(n * 100) / 100);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Page({ title, onBack, children, testID }: { title: string; onBack: () => void; children: React.ReactNode; testID: string }) {
  return (
    <Screen title={title} testID={testID}>
      {children}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/**
 * One typed line kept in Odoo (Food app settings) and on the phone, so counts made at the
 * market without signal are not lost. Saving goes through the offline queue.
 */
function useTyped(key: string) {
  const { client, db, offline } = useOdoo();
  const { save } = useQueue();
  const [value, setValue] = useState<string | undefined>(undefined);
  const local = `markettyped/v1/${db}/${key}`;
  useEffect(() => {
    let live = true;
    setValue(undefined);
    (async () => {
      const mine = await AsyncStorage.getItem(local).catch(() => null);
      if (live && mine !== null) setValue(mine);
      if (client && !offline) {
        const theirs = (await loadSettings(client))[key];
        if (live && mine === null) setValue(theirs ?? '');
      } else if (live && mine === null) setValue('');
    })();
    return () => {
      live = false;
    };
  }, [client, offline, key, local]);
  const put = useCallback(
    async (line: string) => {
      await AsyncStorage.setItem(local, line);
      setValue(line);
      return save(settingChange(key, line));
    },
    [local, key, save],
  );
  return { value, put };
}

export function ResultsPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [list, setList] = useState<Session[] | null>(null);
  const [res, setRes] = useState<SessionResults | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (client && !offline) loadSessions(client).then(setList).catch((e) => setError(`Couldn’t read the markets. ${why(e)}`));
  }, [client, offline]);
  if (res)
    return (
      <Page title={`${res.session.register} ${(res.session.stop || res.session.start).slice(0, 10)}`} onBack={() => setRes(null)} testID="results-page">
        <Card title={`Sold ${money(res.total)}`} testID="results-total">
          <Row title="Orders" value={String(res.orders)} />
          {res.byWay.map((w) => (
            <Row key={w.way} title={w.way} value={money(w.amount)} />
          ))}
        </Card>
        <Card title="Best sellers">{res.best.length ? res.best.map((b) => <Row key={b.name} title={b.name} value={qty(b.qty)} />) : <Body muted>Nothing sold.</Body>}</Card>
        <Card title="Left in stock now">{res.leftovers.map((b) => <Row key={b.name} title={b.name} value={qty(b.onHand)} />)}</Card>
      </Page>
    );
  return (
    <Page title="Market results" onBack={onBack} testID="results-list">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {offline ? <Body muted>No signal. Results need Odoo.</Body> : null}
      {list && !list.length ? <Body muted>No market days yet.</Body> : null}
      {list?.map((s) => (
        <Row
          key={s.id}
          title={`${s.register || s.name}`}
          detail={`${(s.stop || s.start).slice(0, 10)} · ${s.state === 'closed' ? 'closed' : 'open'}`}
          testID={`session-${s.id}`}
          onPress={async () => {
            try {
              setRes(await loadResults(client!, s));
            } catch (e) {
              setError(`Couldn’t read the results. ${why(e)}`);
            }
          }}
        />
      ))}
    </Page>
  );
}

export function DaySheetPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [sheet, setSheet] = useState<{ rows: DaySheetRow[]; dates: string[] } | null>(null);
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (client && !offline) loadDaySheet(client).then(setSheet).catch((e) => setError(`Couldn’t read past markets. ${why(e)}`));
  }, [client, offline]);
  return (
    <Page title="Market day sheet" onBack={onBack} testID="daysheet-page">
      <Body muted>What sold at the last markets and what is in stock now. Tick things as you pack them. The ticks stay on this phone.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {sheet && !sheet.rows.length ? <Body muted>No closed markets to learn from yet.</Body> : null}
      {sheet?.rows.map((r) => (
        <SwitchRow key={r.productId} title={r.name} detail={`Sold ${r.last.map(qty).join(' / ')} (newest first) · in stock ${qty(r.onHand)}`} value={!!ticked[r.productId]} onChange={(v) => setTicked({ ...ticked, [r.productId]: v })} testID={`bring-${r.productId}`} />
      ))}
    </Page>
  );
}

export function TakePage({ onBack }: { onBack: () => void }) {
  const [date, setDate] = useState(today());
  const { value, put } = useTyped(marketKey(date));
  const [rows, setRows] = useState<TakeRow[]>([]);
  const [sold, setSold] = useState<Record<number, number>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const { client, offline } = useOdoo();
  const search = useProductSearch(true);
  useEffect(() => {
    if (value !== undefined) setRows(takeFromLine(value));
  }, [value]);
  useEffect(() => {
    if (!client || offline) return;
    loadDaySheetSold(client, date).then(setSold).catch(() => undefined);
  }, [client, offline, date]);
  const set = (i: number, patch: Partial<TakeRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Page title="Check out and check in" onBack={onBack} testID="take-page">
      <Body muted>Type what you take to the market, then what came back. Odoo’s stock is not changed here; fix stock with Count stock.</Body>
      <Field label="Market day (year-month-day)" value={date} onChangeText={setDate} testID="take-date" />
      {rows.map((r, i) => {
        const t = sellThrough(r, sold[r.productId] ?? 0);
        return (
          <Card key={r.productId} title={r.name}>
            <Field label="Took" value={r.out} onChangeText={(v) => set(i, { out: v })} keyboardType="decimal-pad" testID={`take-out-${r.productId}`} />
            <Field label="Came back" value={r.back} onChangeText={(v) => set(i, { back: v })} keyboardType="decimal-pad" testID={`take-back-${r.productId}`} />
            {r.out ? <Body>{`Left to sell ${qty(t.left)} · Odoo says sold ${qty(t.sold)}${r.back && t.gap !== 0 ? ` · ${qty(Math.abs(t.gap))} ${t.gap > 0 ? 'not rung up' : 'more than taken'}` : ''}`}</Body> : null}
          </Card>
        );
      })}
      <Field label="Add a product" value={search.text} onChangeText={search.setText} testID="take-search" />
      {search.text
        ? search.found.filter((p) => !rows.some((r) => r.productId === p.id)).map((p) => <Row key={p.id} title={p.name} onPress={() => { setRows([...rows, { productId: p.id, name: p.name, out: '', back: '' }]); search.setText(''); }} testID={`take-add-${p.id}`} />)
        : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Save"
        testID="take-save"
        onPress={async () => {
          try {
            const r = await put(takeToLine(rows));
            setNote(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
          } catch (e) {
            setError(`Odoo would not take that. ${why(e)}`);
          }
        }}
      />
    </Page>
  );
}

/** Units rung up on one date, by product id, from the Point of Sale. */
async function loadDaySheetSold(c: NonNullable<ReturnType<typeof useOdoo>['client']>, date: string): Promise<Record<number, number>> {
  const sessions = (await loadSessions(c, 40)).filter((s) => (s.stop || s.start).slice(0, 10) === date);
  const out: Record<number, number> = {};
  for (const s of sessions) {
    const orders = (await c.call('pos.order', 'search_read', [[['session_id', '=', s.id]]], { fields: ['id'] })) as { id: number }[];
    if (!orders.length) continue;
    const lines = (await c.call('pos.order.line', 'search_read', [[['order_id', 'in', orders.map((o) => o.id)]]], { fields: ['product_id', 'qty'] })) as { product_id: unknown; qty?: number }[];
    for (const l of lines) {
      const id = Array.isArray(l.product_id) ? (l.product_id[0] as number) : 0;
      if (id) out[id] = (out[id] ?? 0) + (l.qty ?? 0);
    }
  }
  return out;
}

export function PricePage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [rows, setRows] = useState<PriceRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (client && !offline) loadPriceSheet(client).then(setRows).catch((e) => setError(`Couldn’t read the prices. ${why(e)}`));
  }, [client, offline]);
  return (
    <Page title="Price sheet" onBack={onBack} testID="price-page">
      <Body muted>Prices are the list prices in Odoo. Tax is as Odoo has it; nothing is worked out here.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows?.map((r) => (
        <Row key={r.id} title={r.name} value={money(r.price)} />
      ))}
      {rows?.length ? <Button label="Share the price list" kind="plain" testID="price-share" onPress={() => Share.share({ message: priceSheetText(rows, 'Price list') })} /> : null}
    </Page>
  );
}

function Drawer({ date, when }: { date: string; when: 'open' | 'close' }) {
  const { value, put } = useTyped(drawerKey(date, when));
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  useEffect(() => {
    if (value === undefined) return;
    const c: Record<string, string> = {};
    for (const p of value.split(';')) {
      const [k, v] = p.split(':');
      if (k && v) c[k] = v;
    }
    setCounts(c);
  }, [value]);
  const total = drawerTotal(counts);
  return (
    <Card title={when === 'open' ? 'Count at opening' : 'Count at closing'}>
      {DENOMS.map((d) => (
        <Field key={d.id} label={d.label} value={counts[d.id] ?? ''} onChangeText={(v) => setCounts({ ...counts, [d.id]: v })} keyboardType="number-pad" testID={`drawer-${when}-${d.id}`} />
      ))}
      <Body>{`Counted ${money(total)}`}</Body>
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Save count"
        kind="plain"
        testID={`drawer-save-${when}`}
        onPress={async () => {
          const r = await put(Object.entries(counts).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(';'));
          setNote(r.status === 'queued' ? 'Saved on the phone.' : 'Saved in Odoo.');
        }}
      />
    </Card>
  );
}

export function DrawerPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [date, setDate] = useState(today());
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (client && !offline) loadSessions(client, 40).then((l) => setSession(l.find((s) => (s.stop || s.start).slice(0, 10) === date) ?? null)).catch(() => undefined);
  }, [client, offline, date]);
  const open = useTyped(drawerKey(date, 'open'));
  const close = useTyped(drawerKey(date, 'close'));
  const sum = (v: string | undefined) => drawerTotal(Object.fromEntries((v ?? '').split(';').map((p) => p.split(':')).filter((p) => p[0] && p[1]).map((p) => [p[0]!, p[1]!])));
  return (
    <Page title="Cash drawer" onBack={onBack} testID="drawer-page">
      <Body muted>Count the bills and coins. The count is kept here and in Odoo’s notes; it is never put into the Point of Sale.</Body>
      <Field label="Market day (year-month-day)" value={date} onChangeText={setDate} testID="drawer-date" />
      {session ? (
        <Card title="What Odoo says">
          <Row title="Opening cash" value={money(session.cashStart)} />
          <Row title="Closing cash counted in Odoo" value={session.state === 'closed' ? money(session.cashEnd) : 'not closed yet'} />
          {open.value ? <Body>{`Opening: ${drawerWords(sum(open.value), session.cashStart)}`}</Body> : null}
          {close.value && session.state === 'closed' ? <Body>{`Closing: ${drawerWords(sum(close.value), session.cashEnd)}`}</Body> : null}
        </Card>
      ) : null}
      <Drawer date={date} when="open" />
      <Drawer date={date} when="close" />
    </Page>
  );
}

export function TotalsPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [date, setDate] = useState(today());
  const { value, put } = useTyped(totalsKey(date));
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [ways, setWays] = useState<{ way: string; amount: number }[]>([]);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (value !== undefined) setTyped(totalsFromLine(value));
  }, [value]);
  useEffect(() => {
    if (!client || offline) return;
    (async () => {
      const sessions = (await loadSessions(client, 40)).filter((s) => (s.stop || s.start).slice(0, 10) === date);
      const by = new Map<string, number>();
      for (const s of sessions) for (const w of (await loadResults(client, s)).byWay) by.set(w.way, (by.get(w.way) ?? 0) + w.amount);
      setWays([...by.entries()].map(([way, amount]) => ({ way, amount })));
    })().catch(() => undefined);
  }, [client, offline, date]);
  return (
    <Page title="Day totals" onBack={onBack} testID="totals-page">
      <Body muted>Type the total your Cash App or Venmo shows for the day. It is checked against what Odoo has for that way to pay.</Body>
      <Field label="Market day (year-month-day)" value={date} onChangeText={setDate} testID="totals-date" />
      {ways.map((w) => (
        <Card key={w.way} title={w.way}>
          <Row title="Odoo total" value={money(w.amount)} />
          <Field label="Total in the app" value={typed[w.way] ?? ''} onChangeText={(v) => setTyped({ ...typed, [w.way]: v })} keyboardType="decimal-pad" testID={`totals-${w.way}`} />
          {typed[w.way] ? <Body>{totalsMatch(typed[w.way]!, w.amount) ? 'Matches.' : 'Does not match yet.'}</Body> : null}
        </Card>
      ))}
      {!ways.length ? <Body muted>No payments from Odoo for this day yet.</Body> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Save"
        testID="totals-save"
        onPress={async () => {
          const r = await put(totalsToLine(typed));
          setNote(r.status === 'queued' ? 'Saved on the phone.' : 'Saved in Odoo.');
        }}
      />
    </Page>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen } from '../components/ui';
import { checkInChanges, checkOutChanges, findMarketPlace, loadStockAt } from '../lib/marketStock';
import { marketKey, takeFromLine, takeToLine, TakeRow } from '../lib/marketDay';
import type { Place, PlaceStock } from '../lib/places';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { TakePage, useTyped } from './MarketDay';
import { useProductSearch } from './StockExtras';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const qty = (n: number) => String(Math.round(n * 100) / 100);
const toNum = (t: string) => Number(t.replace(',', '.')) || 0;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The Market place and the stock in it and outside it; null while loading, false when Odoo has no Market place. */
function useMarketStock() {
  const { client, offline } = useOdoo();
  const [state, setState] = useState<{ market: Place; inMarket: PlaceStock[]; main: PlaceStock[] } | null | false>(null);
  const load = useCallback(async () => {
    if (!client || offline) return setState(false);
    const market = await findMarketPlace(client);
    if (!market) return setState(false);
    const s = await loadStockAt(client, market);
    setState({ market, inMarket: s.market, main: s.main });
  }, [client, offline]);
  useEffect(() => {
    load().catch(() => setState(false));
  }, [load]);
  return { state, load };
}

/** Check out: moves what you take from the pantry to Market in Odoo. Without a Market place it is the old sheet. */
export function CheckOutPage({ onBack }: { onBack: () => void }) {
  const { state, load } = useMarketStock();
  const { save } = useQueue();
  const date = today();
  const sheet = useTyped(marketKey(date));
  const search = useProductSearch(true);
  const [rows, setRows] = useState<TakeRow[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (sheet.value !== undefined) setRows(takeFromLine(sheet.value));
  }, [sheet.value]);
  if (state === null) return <Screen title="Check out" testID="take-page"><Body muted>Loading…</Body></Screen>;
  if (state === false) return <TakePage onBack={onBack} />;
  const pantry = (id: number) => state.main.filter((s) => s.productId === id).reduce((n, s) => n + s.qty, 0);
  const set = (i: number, patch: Partial<TakeRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const run = async () => {
    setError('');
    setNote('');
    try {
      const want = rows.map((r) => ({ productId: r.productId, qty: toNum(r.out) })).filter((w) => w.qty > 0);
      const { changes, short } = checkOutChanges(want, state.main, state.market);
      for (const c of changes) await save(c);
      await sheet.put(takeToLine(rows));
      setNote(
        short.length
          ? `Moved to Market. The pantry did not have enough of ${short.map((s) => rows.find((r) => r.productId === s.productId)?.name ?? 'one item').join(', ')}; only what it has was moved.`
          : 'Moved to Market in Odoo. If you have no signal it goes when signal is back.',
      );
      await load();
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };
  return (
    <Screen title="Check out" testID="take-page">
      <Body muted>Type what you are taking to the market. Saving moves it from the pantry to the Market place in Odoo, batch by batch.</Body>
      {rows.map((r, i) => (
        <Card key={r.productId} title={r.name}>
          <Field label={`Taking (${qty(pantry(r.productId))} in the pantry)`} value={r.out} onChangeText={(v) => set(i, { out: v })} keyboardType="decimal-pad" testID={`take-out-${r.productId}`} />
        </Card>
      ))}
      <Field label="Add a product" value={search.text} onChangeText={search.setText} testID="take-search" />
      {search.text
        ? search.found.filter((p) => !rows.some((r) => r.productId === p.id)).map((p) => <Row key={p.id} title={p.name} onPress={() => { setRows([...rows, { productId: p.id, name: p.name, out: '', back: '' }]); search.setText(''); }} testID={`take-add-${p.id}`} />)
        : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button label="Move to Market" onPress={run} disabled={!rows.some((r) => toNum(r.out) > 0)} testID="take-save" />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/** Check in: shows what Odoo says is still in Market; what you count coming back is moved to the pantry. */
export function CheckInPage({ onBack }: { onBack: () => void }) {
  const { state, load } = useMarketStock();
  const { save } = useQueue();
  const [back, setBack] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const left = useMemo(() => {
    if (!state) return [];
    const by = new Map<number, { productId: number; name: string; qty: number }>();
    for (const s of state.inMarket) {
      const e = by.get(s.productId) ?? { productId: s.productId, name: s.product, qty: 0 };
      e.qty += s.qty;
      by.set(s.productId, e);
    }
    return [...by.values()];
  }, [state]);
  if (state === null) return <Screen title="Check in" testID="take-page"><Body muted>Loading…</Body></Screen>;
  if (state === false) return <TakePage onBack={onBack} />;
  const counted = (p: { productId: number; qty: number }) => (back[p.productId] === undefined ? p.qty : toNum(back[p.productId]!));
  const run = async () => {
    setError('');
    setNote('');
    try {
      const changes = checkInChanges(left.map((p) => ({ productId: p.productId, qty: Math.min(counted(p), p.qty) })).filter((b) => b.qty > 0), state.inMarket, state.main, null);
      for (const c of changes) await save(c);
      setNote('Moved back to the pantry in Odoo. If you have no signal it goes when signal is back.');
      await load();
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };
  return (
    <Screen title="Check in" testID="take-page">
      <Body muted>Odoo says this is still in Market. Count what came back. It moves to the pantry. If the count is less, the gap is what sold but was not rung up, or was wasted.</Body>
      {!left.length ? <Body muted>Nothing is in Market right now.</Body> : null}
      {left.map((p) => {
        const gap = p.qty - counted(p);
        return (
          <Card key={p.productId} title={p.name}>
            <Row title="Odoo says in Market" value={qty(p.qty)} />
            <Field label="Came back" value={back[p.productId] ?? qty(p.qty)} onChangeText={(v) => setBack({ ...back, [p.productId]: v })} keyboardType="decimal-pad" testID={`back-${p.productId}`} />
            {gap > 0 ? <Body>{`${qty(gap)} not counted back. Odoo keeps it in Market until you write it off in Stock.`}</Body> : null}
          </Card>
        );
      })}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button label="Move back to the pantry" onPress={run} disabled={!left.length} testID="checkin-save" />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

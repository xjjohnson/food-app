import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Card, Chip, ErrorText, ListRow, Row, Screen } from '../components/ui';
import { fmtQty } from '../lib/production';
import { router } from 'expo-router';
import { Checkout, handOverChanges, loadCheckout, loadFree, loadLotStock, loadOrders, loadPackLines, loadToMake, LotPick, makeLink, makeShort, oldestFirst, Order, PackLine, readyToPack, shortWords, stateWords, ToMake } from '../lib/orders';
import { DeliveryBoardScreen } from './DeliveryBoardScreen';
import { useLeaveAtBase } from '../lib/innerBack';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const copyKey = (db: string) => `orders/v1/${db}`;

/** Website orders: what is waiting to be packed, and handing each over. */
export function OrdersScreen({ go }: { go?: string } = {}) {
  const { client, db, offline } = useOdoo();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [open, setOpen] = useState<Order | null>(null);
  const [fromPhone, setFromPhone] = useState(false);
  const [board, setBoard] = useState(!!go && go.startsWith('board'));
  useLeaveAtBase(!!go && go.startsWith('board'), !board);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toMake, setToMake] = useState<ToMake[]>([]);

  const load = useCallback(async () => {
    if (!db) return;
    setError('');
    if (client && !offline) {
      setBusy(true);
      try {
        const list = await loadOrders(client);
        setOrders(list);
        setFromPhone(false);
        loadToMake(client, list.filter((o) => !readyToPack(o))).then(setToMake).catch(() => setToMake([]));
        await AsyncStorage.setItem(copyKey(db), JSON.stringify(list));
        return;
      } catch (e) {
        setError(`Couldn’t read orders from Odoo. ${why(e)}`);
      } finally {
        setBusy(false);
      }
    }
    try {
      const raw = await AsyncStorage.getItem(copyKey(db));
      if (raw) {
        setOrders(JSON.parse(raw) as Order[]);
        setFromPhone(true);
      }
    } catch {
      // No copy.
    }
  }, [client, db, offline]);

  useEffect(() => {
    load();
  }, [load]);

  if (board) return <DeliveryBoardScreen start={go?.split(':')[1]} onBack={() => setBoard(false)} onPack={(b) => { setBoard(false); const found = orders?.find((x) => x.id === b.id); if (found) setOpen(found); }} />;

  if (open)
    return (
      <PackOrder
        order={open}
        onBack={() => {
          setOpen(null);
          load();
        }}
      />
    );

  return (
    <Screen title="Website orders" testID="orders-screen">
      {fromPhone ? <Body muted>No signal. Showing what the phone saw last.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!orders ? <Body muted>{busy ? 'Loading…' : 'Nothing to show yet. Connect to Odoo to load orders.'}</Body> : null}
      {orders && !orders.length ? <Body muted>No website orders waiting to be packed.</Body> : null}
      {orders?.map((o) => (
        <ListRow key={o.id} title={o.customer || o.origin || o.name} detail={`${o.origin || o.name} · ${o.pickup ? 'Pickup' : 'Delivery'}${o.date ? ` · ${o.date}` : ''}`} tag={{ label: stateWords(o.state), tone: readyToPack(o) ? 'good' : 'warn' }} onPress={() => setOpen(o)} testID={`order-${o.id}`} />
      ))}
      {toMake.length ? (
        <Card title="What to make" testID="to-make">
          <Body muted>Odoo is waiting on these. Tap one to start a batch with the amount filled in.</Body>
          {toMake.map((m) => (
            <Row key={m.productId} title={`${fmtQty(m.short)} ${m.name}`} detail={`Waiting orders need ${fmtQty(m.need)}, ${fmtQty(m.free)} free`} onPress={() => router.push(makeLink(m.productId, m.short))} testID={`tomake-${m.productId}`} />
          ))}
        </Card>
      ) : null}
      <Button label="Refresh" kind="plain" onPress={load} busy={busy} />
    </Screen>
  );
}

interface Planned {
  line: PackLine;
  picks: LotPick[];
  short: number;
}

function PackOrder({ order, onBack }: { order: Order; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [plan, setPlan] = useState<Planned[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [free, setFree] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    if (!client || offline) return;
    // Delivery or pickup is whatever the order says in Odoo.
    loadCheckout(client, order.id).then(setCheckout);
    (async () => {
      try {
        const lines = await loadPackLines(client, order.id);
        setFree(await loadFree(client, lines.map((l) => l.productId)));
        const out: Planned[] = [];
        for (const line of lines) {
          const stock = await loadLotStock(client, line.productId);
          // Products with no batch numbers are packed as Odoo set them aside.
          const r = stock.length ? oldestFirst(stock, line.qty) : { picks: [], short: 0 };
          out.push({ line, ...r });
        }
        setPlan(out);
      } catch (e) {
        setError(`Couldn’t read this order from Odoo. ${why(e)}`);
      }
    })();
  }, [client, offline, order.id]);

  const ready = readyToPack(order) && !!plan && !note;
  return (
    <Screen title={order.customer || order.origin || order.name} testID="pack-screen">
      <Chip label={`${order.origin || order.name} · ${stateWords(order.state)}`} />
      {offline ? <Body muted>No signal. Packing needs the batch list from Odoo, so open this order again with signal.</Body> : null}
      {!readyToPack(order) ? <Body muted>Odoo is still waiting for stock for this order, so it can’t be packed yet.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {plan?.some((x) => x.picks.some((p) => p.expired)) ? <ErrorText>One of these batches is past its use-by date. Check it before you pack it, and fix the date in Odoo if it was a typing mistake.</ErrorText> : null}
      <Card title="Pack these">
        {!plan ? <Body muted>{offline ? '' : 'Loading…'}</Body> : null}
        {plan?.map(({ line, picks, short }) => (
          <Row
            key={line.moveId}
            title={`${fmtQty(line.qty)} ${line.name}`}
            detail={
              picks.length
                ? `Take: ${picks.map((p) => `${fmtQty(p.qty)} from batch ${p.lot}${p.useBy ? ` (use by ${p.useBy}${p.expired ? ', EXPIRED' : ''})` : ''}`).join(', ')}${short ? `. Short by ${fmtQty(short)}.` : ''}`
                : readyToPack(order)
                  ? 'No batch numbers on this product.'
                  : shortWords(line.qty, free.get(line.productId)) || 'No batch numbers on this product.'
            }
            testID={`line-${line.moveId}`}
          />
        ))}
        {!readyToPack(order)
          ? plan?.map(({ line }) => {
              const short = makeShort(line.qty, free.get(line.productId));
              return short > 0 ? <Button key={line.moveId} label={`Make a batch for this: ${fmtQty(short)} ${line.name}`} kind="plain" onPress={() => router.push(makeLink(line.productId, short))} testID={`make-${line.moveId}`} /> : null;
            })
          : null}
      </Card>
      {checkout ? <Body>{`${checkout.how === 'pickup' ? 'Pickup' : 'Delivery'} (set in Odoo): ${checkout.label}`}</Body> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Pack"
        disabled={!ready || plan.some((p) => p.short > 0)}
        busy={busy}
        testID="hand-over"
        onPress={async () => {
          if (!plan) return;
          setBusy(true);
          setError('');
          try {
            let queued = false;
            for (const change of handOverChanges(order, plan)) if ((await save(change)).status === 'queued') queued = true;
            if (queued) {
              setNote('Saved on the phone. It goes to Odoo when signal is back.');
              setTimeout(onBack, 1500);
            } else onBack();
          } catch (e) {
            setError(`Odoo said no: ${why(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button label="Back to orders" kind="plain" onPress={onBack} />
    </Screen>
  );
}

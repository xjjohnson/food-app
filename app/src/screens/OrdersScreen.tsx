import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Card, Chip, ErrorText, Row, Screen, Segments } from '../components/ui';
import { fmtQty } from '../lib/production';
import { handOverChanges, Handover, loadLotStock, loadOrders, loadPackLines, LotPick, oldestFirst, Order, PackLine, readyToPack, stateWords } from '../lib/orders';
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
  const [board, setBoard] = useState(go === 'board');
  useLeaveAtBase(go === 'board', !board);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!db) return;
    setError('');
    if (client && !offline) {
      setBusy(true);
      try {
        const list = await loadOrders(client);
        setOrders(list);
        setFromPhone(false);
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

  if (board) return <DeliveryBoardScreen onBack={() => setBoard(false)} onPack={() => setBoard(false)} />;

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
      <Button label="Delivery board (today)" onPress={() => setBoard(true)} testID="open-board" />
      {fromPhone ? <Body muted>No signal. Showing what the phone saw last.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card title="Waiting to be packed">
        {!orders ? <Body muted>{busy ? 'Loading…' : 'Nothing to show yet. Connect to Odoo to load orders.'}</Body> : null}
        {orders && !orders.length ? <Body muted>No website orders waiting.</Body> : null}
        {orders?.map((o) => (
          <Row key={o.id} title={o.customer || o.origin || o.name} detail={`${o.origin || o.name} · ${stateWords(o.state)}${o.date ? ` · ${o.date}` : ''}`} onPress={() => setOpen(o)} testID={`order-${o.id}`} />
        ))}
      </Card>
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
  const [how, setHow] = useState<Handover>('delivery');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!client || offline) return;
    (async () => {
      try {
        const lines = await loadPackLines(client, order.id);
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
      <Card title="Pack these">
        {!plan ? <Body muted>{offline ? '' : 'Loading…'}</Body> : null}
        {plan?.map(({ line, picks, short }) => (
          <Row
            key={line.moveId}
            title={`${fmtQty(line.qty)} ${line.name}`}
            detail={
              picks.length
                ? `Take: ${picks.map((p) => `${fmtQty(p.qty)} from batch ${p.lot}${p.useBy ? ` (use by ${p.useBy})` : ''}`).join(', ')}${short ? `. Short by ${fmtQty(short)}.` : ''}`
                : 'No batch numbers on this product.'
            }
            testID={`line-${line.moveId}`}
          />
        ))}
      </Card>
      <Body>How does it go to the customer?</Body>
      <Segoptions how={how} setHow={setHow} />
      {note ? <Body>{note}</Body> : null}
      <Button
        label={how === 'pickup' ? 'Packed and picked up' : 'Packed and delivered'}
        disabled={!ready || plan.some((p) => p.short > 0)}
        busy={busy}
        testID="hand-over"
        onPress={async () => {
          if (!plan) return;
          setBusy(true);
          setError('');
          try {
            let queued = false;
            for (const change of handOverChanges(order, plan, how)) if ((await save(change)).status === 'queued') queued = true;
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

function Segoptions({ how, setHow }: { how: Handover; setHow: (h: Handover) => void }) {
  return (
    <Segments
      options={[
        { id: 'delivery', label: 'Delivery' },
        { id: 'pickup', label: 'Pickup' },
      ]}
      value={how}
      onChange={setHow}
      testID="how"
    />
  );
}

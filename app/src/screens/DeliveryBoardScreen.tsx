import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyRoute, moveStop, routeKey, routeLink, sortByZip } from '../lib/buying';
import { useTyped } from './MarketDay';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Body, Button, Card, Chip, ErrorText, Screen, Row, Segments } from '../components/ui';
import { thankYouChange } from '../lib/activities';
import { BoardOrder, deliveredChange, loadBoard, mapLink, STEP_WORDS, Step } from '../lib/deliveryBoard';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { PhotosCard } from './PhotosCard';
import { FeedbackBox } from './ShopScreen';
import { isClosed } from '../lib/shop';
import { loadSettings } from '../lib/appSettings';
import { payMethods, salePayChange } from '../lib/deliveryPay';
import { Journal, loadJournals } from '../lib/ingredients';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const copyKey = (db: string) => `board/v1/${db}`;

/** Today's deliveries and pickups: where each goes, its step, and a Delivered tick. */
export function DeliveryBoardScreen({ onBack, onPack }: { onBack: () => void; onPack: () => void }) {
  const { client, db, offline } = useOdoo();
  const { save, items } = useQueue();
  const [list, setList] = useState<BoardOrder[] | null>(null);
  const [fromPhone, setFromPhone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [closedToday, setClosedToday] = useState(false);
  const [stage, setStage] = useState<Step | null>(null);

  const load = useCallback(async () => {
    if (!db) return;
    setError('');
    if (client && !offline) {
      setBusy(true);
      try {
        const rows = await loadBoard(client);
        setList(rows);
        setFromPhone(false);
        await AsyncStorage.setItem(copyKey(db), JSON.stringify(rows));
        return;
      } catch (e) {
        setError(`Couldn’t read the board from Odoo. ${why(e)}`);
      } finally {
        setBusy(false);
      }
    }
    try {
      const raw = await AsyncStorage.getItem(copyKey(db));
      if (raw) {
        setList(JSON.parse(raw) as BoardOrder[]);
        setFromPhone(true);
      }
    } catch {
      // No copy.
    }
  }, [client, db, offline]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (client && !offline) loadSettings(client).then((s) => setClosedToday(isClosed(s, new Date().toISOString().slice(0, 10)))).catch(() => undefined);
  }, [client, offline]);

  const route = useTyped(routeKey(new Date().toISOString().slice(0, 10)));
  const ordered = list ? applyRoute(list, route.value) : list;
  const routeUrl = ordered ? routeLink(ordered) : '';
  const waiting = new Set(items.filter((i) => i.step?.kind === 'note').map((i) => (i.step as { resId: number }).resId));

  const stepOf = (o: BoardOrder): Step => (waiting.has(o.saleId) ? 'delivered' : o.step);
  const stages: Step[] = ['pack', 'packed', 'delivered'];
  const count = (st: Step) => (ordered ? ordered.filter((o) => stepOf(o) === st).length : 0);
  // The board opens on the first stage that has a card; tap another stage to see its cards.
  const active: Step = stage ?? stages.find((st) => count(st) > 0) ?? 'pack';

  const delivered = async (o: BoardOrder) => {
    setError('');
    try {
      await save(deliveredChange(o));
      // The invoice is made now; the payment is chosen on the card that opens.
      await save(salePayChange(o.saleId, o.origin || o.name, null, '', new Date().toISOString().slice(0, 10)));
      if (o.partnerId && client) await save(thankYouChange({ partnerId: o.partnerId, customer: o.customer, saleName: o.origin || o.name }, client.session.uid)).catch(() => undefined);
      await load();
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };

  return (
    <Screen title="Delivery board" testID="board-screen">
      {closedToday ? <Body>Today is marked as a closed day. This is only a warning.</Body> : null}
      {fromPhone ? <Body muted>No signal. Showing what the phone saw last.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!list ? <Body muted>{busy ? 'Loading…' : 'Nothing to show yet. Connect to Odoo to load the board.'}</Body> : null}
      {list && !list.length ? <Body muted>No deliveries or pickups for today.</Body> : null}
      {list && list.length > 1 ? (
        <Card title="Route" testID="route-card">
          <Body muted>The app doesn’t plan the route. Sort by zip to start, then move stops up or down.</Body>
          <Button label="Sort by zip" kind="plain" onPress={() => route.put(sortByZip(list.map((o) => ({ id: o.id, address: o.address, zip: o.zip ?? '' }))).map((x) => x.id).join(','))} testID="route-sort" />
          {routeUrl ? <Button label="Open the whole route in Maps" onPress={() => Linking.openURL(routeUrl)} testID="route-open" /> : null}
        </Card>
      ) : null}
      {ordered && ordered.length ? (
        <Segments<Step> options={stages.map((st) => ({ id: st, label: `${STEP_WORDS[st]} (${count(st)})` }))} value={active} onChange={setStage} testID="board-stages" />
      ) : null}
      {ordered?.map((o, n) => {
        if (stepOf(o) !== active) return null;
        const isWaiting = waiting.has(o.saleId);
        const step = isWaiting ? 'delivered' : o.step;
        return (
          <Card key={o.id} title={o.customer || o.origin || o.name} testID={`board-${o.id}`}>
            <Chip label={isWaiting ? 'Delivered (waiting to send)' : STEP_WORDS[step]} testID={`board-step-${o.id}`} />
            <Body muted>{`${o.origin || o.name}${o.date ? ` · ${o.date.slice(0, 10)}` : ''}`}</Body>
            {ordered && ordered.length > 1 ? (
              <>
                <Chip label={`Stop ${n + 1}`} testID={`stop-${o.id}`} />
                <Button label="Move up" kind="plain" disabled={n === 0} onPress={() => route.put(moveStop(ordered, n, -1).map((x) => x.id).join(','))} testID={`stop-up-${o.id}`} />
                <Button label="Move down" kind="plain" disabled={n === ordered.length - 1} onPress={() => route.put(moveStop(ordered, n, 1).map((x) => x.id).join(','))} testID={`stop-down-${o.id}`} />
              </>
            ) : null}
            {o.address ? <Row title="Address" detail={o.address} onPress={() => Linking.openURL(mapLink(o.address))} testID={`board-map-${o.id}`} /> : <Body muted>No address on the contact.</Body>}
            {o.phone ? <Row title="Phone" detail={o.phone} onPress={() => Linking.openURL(`tel:${o.phone}`)} /> : null}
            {o.notes ? <Body>{`Notes: ${o.notes}`}</Body> : null}
            {step === 'delivered' && o.saleId ? <PaymentCard order={o} /> : null}
            {step === 'delivered' && o.saleId && !isWaiting ? <FeedbackBox orderId={o.saleId} orderName={o.origin || o.name} /> : null}
            {step === 'pack' ? <Button label="Pack it" kind="plain" onPress={onPack} testID={`board-pack-${o.id}`} /> : null}
            {o.saleId ? <PhotosCard model="sale.order" resId={o.saleId} recordName={o.origin || o.name} title="Delivery proof" about="Delivery proof" button="Take a proof photo" testID={`board-photos-${o.id}`} /> : null}
            {step === 'packed' && o.saleId ? <Button label="Move to Delivered ›" onPress={() => delivered(o)} testID={`board-delivered-${o.id}`} /> : null}
          </Card>
        );
      })}
      <Button label="Refresh" kind="plain" onPress={load} busy={busy} />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

const journalKey = (db: string) => `money/journals/${db}`;

/** After Delivered: how did the customer pay? Cash, Cash App, Venmo, or not yet. The invoice is Odoo's. */
function PaymentCard({ order }: { order: BoardOrder }) {
  const { client, db, offline } = useOdoo();
  const { save } = useQueue();
  const [journals, setJournals] = useState<Journal[]>([]);
  const [paid, setPaid] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db) return;
    if (client && !offline) {
      loadJournals(client).then((j) => {
        setJournals(j);
        AsyncStorage.setItem(journalKey(db), JSON.stringify(j)).catch(() => undefined);
      });
      client
        .call('sale.order', 'read', [[order.saleId]], { fields: ['invoice_ids'] })
        .then(async (r) => {
          const ids = ((r as { invoice_ids?: number[] }[])[0]?.invoice_ids ?? []) as number[];
          if (!ids.length) return;
          const moves = (await client.call('account.move', 'read', [ids], { fields: ['payment_state', 'state'] })) as { payment_state?: string; state?: string }[];
          const live = moves.filter((m) => m.state !== 'cancel');
          if (live.length && live.every((m) => m.payment_state === 'paid' || m.payment_state === 'in_payment')) setPaid(true);
        })
        .catch(() => undefined);
    } else {
      AsyncStorage.getItem(journalKey(db)).then((raw) => raw && setJournals(JSON.parse(raw) as Journal[])).catch(() => undefined);
    }
  }, [client, db, offline, order.saleId]);

  const methods = payMethods(journals);
  const name = order.origin || order.name;
  const pay = async (label: string, journalId: number | null) => {
    setError('');
    try {
      const out = await save(salePayChange(order.saleId, name, journalId, label, new Date().toISOString().slice(0, 10)));
      const queued = out.status === 'queued';
      if (journalId) setPaid(true);
      setNote(journalId ? (queued ? `Paid with ${label}. Saved on the phone; it goes to Odoo when signal is back.` : `Paid with ${label}. The invoice is in Odoo.`) : 'Not paid yet. The invoice is open in Odoo, under Money.');
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };
  return (
    <Card title="Payment" testID={`board-pay-${order.id}`}>
      {paid && !note ? <Body>Paid.</Body> : null}
      {!paid ? (
        <>
          <Body>How did the customer pay?</Body>
          {methods.map((m) => (
            <Button key={m.key} label={m.label} onPress={() => pay(m.label, m.journal.id)} testID={`pay-${order.id}-${m.key}`} />
          ))}
          {!methods.length ? <Body muted>Odoo has no Cash, Cash App or Venmo payment method yet. Add them in Odoo, Accounting, Configuration, Journals.</Body> : null}
          <Button label="Not paid yet" kind="plain" onPress={() => pay('', null)} testID={`pay-${order.id}-none`} />
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
    </Card>
  );
}

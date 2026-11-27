import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyRoute, moveStop, routeKey, routeLink, sortByZip } from '../lib/buying';
import { useTyped } from './MarketDay';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Chip, ErrorText, Screen, Row, Segments } from '../components/ui';
import { useBrand } from '../lib/useBrand';
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
export function DeliveryBoardScreen({ onBack, onPack, start }: { onBack: () => void; onPack: () => void; start?: string }) {
  const { colors } = useBrand();
  const { client, db, offline } = useOdoo();
  const { save, items } = useQueue();
  const [list, setList] = useState<BoardOrder[] | null>(null);
  const [fromPhone, setFromPhone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [closedToday, setClosedToday] = useState(false);
  const [stage, setStage] = useState<Step | null>(null);
  const [lateOnly, setLateOnly] = useState(start === 'late');

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
  // Deliveries have a route and stops; pickups have none. Both are on the board.
  const deliveries = list ? applyRoute(list.filter((o) => !o.pickup), route.value) : [];
  const pickups = list ? list.filter((o) => o.pickup) : [];
  const today = new Date().toISOString().slice(0, 10);
  const waiting = new Set(items.filter((i) => i.step?.kind === 'note').map((i) => (i.step as { resId: number }).resId));

  const stepOf = (o: BoardOrder): Step => (waiting.has(o.saleId) ? 'delivered' : o.step);
  const isLate = (o: BoardOrder) => stepOf(o) !== 'delivered' && o.date.slice(0, 10) < today;
  const keep = (o: BoardOrder) => !lateOnly || isLate(o);
  const inMode = (o: BoardOrder, m: Step) => stepOf(o) === m && keep(o);
  const modes: Step[] = ['pack', 'packed', 'delivered'];
  const MODE_WORDS: Record<Step, string> = { pack: 'Pack', packed: 'Drive', delivered: 'Done' };
  const count = (m: Step) => (list ? list.filter((o) => inMode(o, m)).length : 0);
  // "Late" opens on whichever side has a late order; otherwise the first side with a card.
  const active: Step = stage ?? modes.find((m) => count(m) > 0) ?? (start === 'packed' ? 'packed' : 'pack');
  const stage0 = start === 'packed' && stage === null && count('packed') > 0 ? 'packed' : active;
  const mode: Step = stage ?? stage0;
  // Cards on this side: deliveries in route order first, then pickups.
  const ordered = [...deliveries, ...pickups].filter((o) => inMode(o, mode));
  const stops = deliveries.filter((o) => inMode(o, mode));
  const routeUrl = mode === 'packed' && stops.length ? routeLink(stops) : '';

  const delivered = async (o: BoardOrder) => {
    setError('');
    try {
      await save(deliveredChange(o));
      // The invoice is made now; the payment is chosen on the card that opens.
      await save(salePayChange(o.saleId, o.origin || o.name, null, '', new Date().toISOString().slice(0, 10)));
      if (o.partnerId && client) await save(thankYouChange({ partnerId: o.partnerId, customer: o.customer, saleName: o.origin || o.name }, client.session.uid)).catch(() => undefined);
      setStage('delivered');
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
      {list && list.length ? (
        <Segments<Step> options={modes.map((m) => ({ id: m, label: `${MODE_WORDS[m]} (${count(m)})` }))} value={mode} onChange={setStage} testID="board-stages" />
      ) : null}
      {lateOnly ? <Button label="Showing late orders only. Show all" kind="plain" onPress={() => setLateOnly(false)} testID="board-late-off" /> : null}
      {list && list.length && !ordered.length ? <Body muted>{mode === 'pack' ? 'Nothing to pack.' : mode === 'packed' ? 'Nothing packed and waiting to go.' : 'Nothing delivered yet today.'}</Body> : null}
      {mode === 'packed' && stops.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: 10 }} testID="route-card">
          <View style={{ flex: 1 }}>
            <Button label="Sort by zip" kind="plain" onPress={() => route.put(sortByZip(stops.map((o) => ({ id: o.id, address: o.address, zip: o.zip ?? '' }))).map((x) => x.id).join(','))} testID="route-sort" />
          </View>
          {routeUrl ? (
            <View style={{ flex: 1 }}>
              <Button label="Open in Maps" onPress={() => Linking.openURL(routeUrl)} testID="route-open" />
            </View>
          ) : null}
        </View>
      ) : null}
      {ordered.map((o) => {
        const n = stops.findIndex((x) => x.id === o.id);
        const isWaiting = waiting.has(o.saleId);
        const step = isWaiting ? 'delivered' : o.step;
        return (
          <Card key={o.id} title={o.customer || o.origin || o.name} testID={`board-${o.id}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 6 }}>
                {isWaiting ? <Chip label={`${o.pickup ? 'Picked up' : 'Delivered'} (waiting to send)`} testID={`board-step-${o.id}`} /> : null}
                {n >= 0 && mode === 'packed' ? <Chip label={`Stop ${n + 1}`} testID={`stop-${o.id}`} /> : null}
                <Body muted>{`${o.origin || o.name}${o.date ? ` · ${o.date.slice(0, 10)}` : ''}${isLate(o) ? ' · Late' : ''}`}</Body>
              </View>
              {n >= 0 && stops.length > 1 && mode === 'packed' ? (
                <View style={{ gap: 6 }}>
                  {[-1, 1].map((d) => {
                    const off = d === -1 ? n === 0 : n === stops.length - 1;
                    return (
                      <Pressable
                        key={d}
                        disabled={off}
                        onPress={() => route.put(moveStop(stops, n, d as 1 | -1).map((x) => x.id).join(','))}
                        accessibilityRole="button"
                        accessibilityLabel={d === -1 ? 'Move up' : 'Move down'}
                        testID={d === -1 ? `stop-up-${o.id}` : `stop-down-${o.id}`}
                        style={{ width: 44, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint, opacity: off ? 0.35 : 1 }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{d === -1 ? '▲' : '▼'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
            <Body muted>{[o.pickup ? 'Pickup' : o.address || 'No address on the contact', o.phone].filter(Boolean).join(' · ')}</Body>
            {mode === 'packed' && ((!o.pickup && o.address) || o.phone) ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {!o.pickup && o.address ? (
                  <View style={{ flex: 1 }}>
                    <Button label="Navigate" kind="plain" onPress={() => Linking.openURL(mapLink(o.address))} testID={`board-map-${o.id}`} />
                  </View>
                ) : null}
                {o.phone ? (
                  <View style={{ flex: 1 }}>
                    <Button label="Call" kind="plain" onPress={() => Linking.openURL(`tel:${o.phone}`)} testID={`board-call-${o.id}`} />
                  </View>
                ) : null}
              </View>
            ) : null}
            {o.notes ? <Body>{`Notes: ${o.notes}`}</Body> : null}
            {step === 'delivered' && o.saleId ? <PaymentCard order={o} /> : null}
            {step === 'delivered' && o.saleId && !isWaiting ? <FeedbackBox orderId={o.saleId} orderName={o.origin || o.name} /> : null}
            {step === 'pack' ? <Button label="Pack it" kind="plain" onPress={onPack} testID={`board-pack-${o.id}`} /> : null}
            {step === 'packed' && o.saleId ? <Button label={o.pickup ? 'Picked up ›' : 'Delivered ›'} onPress={() => delivered(o)} testID={`board-delivered-${o.id}`} /> : null}
            {o.saleId && !o.pickup && mode !== 'pack' ? <ProofToggle o={o} /> : null}
          </Card>
        );
      })}
      <Button label="Refresh" kind="plain" onPress={load} busy={busy} />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/** Proof photo is tucked away until it is wanted. */
function ProofToggle({ o }: { o: BoardOrder }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button label="Proof photo" kind="plain" onPress={() => setOpen(true)} testID={`board-proof-${o.id}`} />;
  return <PhotosCard model="sale.order" resId={o.saleId} recordName={o.origin || o.name} title="Delivery proof" about="Delivery proof" button="Take a proof photo" testID={`board-photos-${o.id}`} />;
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
          {!methods.length ? <Body muted>Odoo has no cash or bank account yet. Add them in Odoo, Accounting, Configuration, Journals.</Body> : null}
          <Button label="Not paid yet" kind="plain" onPress={() => pay('', null)} testID={`pay-${order.id}-none`} />
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
    </Card>
  );
}

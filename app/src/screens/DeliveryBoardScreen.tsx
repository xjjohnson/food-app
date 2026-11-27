import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyRoute, moveStop, routeKey, routeLink, sortByZip } from '../lib/buying';
import { useTyped } from './MarketDay';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Screen, Row, SectionLabel, Segments } from '../components/ui';
import { useBrand } from '../lib/useBrand';
import { thankYouChange } from '../lib/activities';
import { BoardOrder, deliveredChange, loadBoard, mapLink, STEP_WORDS, Step } from '../lib/deliveryBoard';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { PhotosCard } from './PhotosCard';
import { isClosed } from '../lib/shop';
import { loadSettings } from '../lib/appSettings';
import { payMethods, salePayChange } from '../lib/deliveryPay';
import { Journal, loadJournals } from '../lib/ingredients';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const copyKey = (db: string) => `board/v1/${db}`;

/** Today's deliveries and pickups: where each goes, its step, and a Delivered tick. */
export function DeliveryBoardScreen({ onBack: _onBack, onPack, onWaiting, start, inline }: { onBack: () => void; onPack: (o: BoardOrder) => void; onWaiting?: () => void; start?: string; inline?: boolean }) {
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
  const [focus, setFocus] = useState<number | null>(null);

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
  // On the Sell page the tab stays alive behind other screens, so read the board again each time it comes back into view (after packing, for one).
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      if (inline) load();
    }, [inline, load]),
  );
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
  const MODE_WORDS: Record<Step, string> = { pack: 'To pack', packed: 'Ready', delivered: 'Done' };
  const count = (m: Step) => (list ? list.filter((o) => inMode(o, m)).length : 0);
  // "Late" opens on whichever side has a late order; otherwise the first side with a card.
  const active: Step = stage ?? modes.find((m) => count(m) > 0) ?? (start === 'packed' ? 'packed' : 'pack');
  const stage0 = start === 'packed' && stage === null && count('packed') > 0 ? 'packed' : active;
  const mode: Step = stage ?? stage0;
  // Cards on this side: deliveries in route order first, then pickups.
  const ordered = [...deliveries, ...pickups].filter((o) => inMode(o, mode));
  // Orders due after today wait in their own Upcoming space on the Pack side.
  const stops = deliveries.filter((o) => inMode(o, mode) && !o.later);
  const sidePickups = pickups.filter((o) => inMode(o, mode) && !o.later);
  const upcoming = mode === 'pack' ? [...deliveries, ...pickups].filter((o) => inMode(o, 'pack') && o.later) : [];
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

  /** Ready: the next stop big on top, the rest as slim numbered stops. Tap a stop to make it the big one. */
  const drive = (ordered: BoardOrder[], kind: 'delivery' | 'pickup') => {
    const first = ordered.find((o) => o.id === focus) ?? ordered[0]!;
    const rest = ordered.filter((o) => o.id !== first.id);
    const numOf = (o: BoardOrder) => ordered.findIndex((x) => x.id === o.id) + 1;
    const sub = (o: BoardOrder) => (o.pickup ? `Pickup${o.phone ? ` · ${o.phone}` : ''}` : o.address || 'No address on the contact');
    const white = { backgroundColor: '#FFFFFF' };
    return (
      <>
        <View style={{ backgroundColor: colors.accent, borderRadius: 18, padding: 14, gap: 8 }} testID={`board-${first.id}`}>
          <Text style={{ color: colors.onAccent, opacity: 0.9, fontSize: 14 }}>{`${kind === 'pickup' ? 'Next pickup' : 'Next stop'} · ${ordered.length} left`}</Text>
          <Text style={{ color: colors.onAccent, fontSize: 22, fontWeight: '800' }}>{`${numOf(first)}. ${first.customer || first.origin || first.name}`}</Text>
          <Text style={{ color: colors.onAccent, opacity: 0.9, fontSize: 15 }}>{`${sub(first)}${isLate(first) ? ' · Late' : ''}`}</Text>
          {first.notes ? <Text style={{ color: colors.onAccent, fontSize: 15 }}>{`Notes: ${first.notes}`}</Text> : null}
          {first.saleId ? <GoodsList saleId={first.saleId} color={colors.onAccent} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {!first.pickup && first.address ? (
              <View style={{ flex: 1 }}>
                <Pressable onPress={() => Linking.openURL(mapLink(first.address))} accessibilityRole="button" accessibilityLabel="Navigate" testID={`board-map-${first.id}`} style={[{ minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, white]}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: colors.accent }}>Navigate</Text>
                </Pressable>
              </View>
            ) : null}
            {first.phone ? (
              <View style={{ flex: 1 }}>
                <Pressable onPress={() => Linking.openURL(`tel:${first.phone}`)} accessibilityRole="button" accessibilityLabel="Call" testID={`board-call-${first.id}`} style={[{ minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, white]}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: colors.accent }}>Call</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {first.saleId ? (
            <Pressable onPress={() => delivered(first)} accessibilityRole="button" accessibilityLabel={first.pickup ? 'Picked up' : 'Delivered'} testID={`board-delivered-${first.id}`} style={{ minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2F7D52' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFFFFF' }}>{first.pickup ? 'Picked up ›' : 'Delivered ›'}</Text>
            </Pressable>
          ) : null}
        </View>
        {first.saleId && !first.pickup ? <ProofToggle o={first} /> : null}
        {rest.length ? <SectionLabel>After that</SectionLabel> : null}
        {rest.map((o) => {
          const n = kind === 'delivery' ? stops.findIndex((x) => x.id === o.id) : -1;
          return (
            <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 10 }} testID={`board-${o.id}`}>
              <Pressable onPress={() => setFocus(o.id)} accessibilityRole="button" accessibilityLabel={`Go to ${o.customer || o.name}`} testID={`board-open-${o.id}`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }} testID={n >= 0 ? `stop-${o.id}` : undefined}>
                  <Text style={{ color: colors.onAccent, fontWeight: '800' }}>{numOf(o)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{o.customer || o.origin || o.name}</Text>
                  <Text style={{ fontSize: 14, color: colors.muted }}>{sub(o)}</Text>
                </View>
              </Pressable>
              {n >= 0 && stops.length > 1 ? (
                <View style={{ gap: 4 }}>
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
                        style={{ width: 40, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint, opacity: off ? 0.35 : 1 }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>{d === -1 ? '▲' : '▼'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </>
    );
  };

  const content = (
    <>
      {closedToday ? <Body>Today is marked as a closed day. This is only a warning.</Body> : null}
      {fromPhone ? <Body muted>No signal. Showing what the phone saw last.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!list ? <Body muted>{busy ? 'Loading…' : 'Nothing to show yet. Connect to Odoo to load the board.'}</Body> : null}
      {list && !list.length ? <Body muted>No deliveries or pickups for today.</Body> : null}
      {list && list.length ? (
        <View style={{ flexDirection: 'row', backgroundColor: colors.tint, borderRadius: 14, padding: 4 }} testID="board-stages" accessibilityRole="radiogroup">
          {modes.map((m) => {
            const on = m === mode;
            return (
              <Pressable key={m} onPress={() => setStage(m)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${MODE_WORDS[m]} (${count(m)})`} testID={`board-stages-${m}`} style={{ flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.accent : 'transparent' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: on ? colors.onAccent : colors.text }}>{`${MODE_WORDS[m]} (${count(m)})`}</Text>
              </Pressable>
            );
          })}
        </View>
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
      {mode === 'packed' && stops.length ? (
        <>
          <SectionLabel>Deliveries</SectionLabel>
          {drive(stops, 'delivery')}
        </>
      ) : null}
      {mode === 'packed' && sidePickups.length ? (
        <>
          <SectionLabel>Pickups</SectionLabel>
          {drive(sidePickups, 'pickup')}
        </>
      ) : null}
      {mode === 'pack' && stops.length ? <SectionLabel>Deliveries</SectionLabel> : null}
      {mode === 'pack' ? stops.map((o) => <PackCard key={o.id} o={o} late={isLate(o)} onPack={() => onPack(o)} />) : null}
      {mode === 'pack' && sidePickups.length ? <SectionLabel>Pickups</SectionLabel> : null}
      {mode === 'pack' ? sidePickups.map((o) => <PackCard key={o.id} o={o} late={isLate(o)} onPack={() => onPack(o)} />) : null}
      {mode === 'pack' && upcoming.length ? <SectionLabel>Upcoming</SectionLabel> : null}
      {mode === 'pack' ? upcoming.map((o) => <PackCard key={o.id} o={o} late={false} onPack={() => onPack(o)} />) : null}
      {mode === 'delivered' && stops.length ? <SectionLabel>Deliveries</SectionLabel> : null}
      {mode === 'delivered' && sidePickups.length && !stops.length ? <SectionLabel>Pickups</SectionLabel> : null}
      {mode === 'delivered' ? [...stops, ...sidePickups].map((o, idx) => {
        const isWaiting = waiting.has(o.saleId);
        return (
          <View key={o.id} style={{ gap: 12 }}>
            {o.pickup && idx === stops.length && stops.length ? <SectionLabel>Pickups</SectionLabel> : null}
          <DoneRow o={o} waitingToSend={isWaiting} />
          </View>
        );
      }) : null}
      {onWaiting ? <Row title="Waiting for stock" detail="Orders that can’t be packed yet, and what to make" onPress={onWaiting} testID="board-waiting" /> : null}
      <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Refresh" style={{ alignItems: 'center', padding: 12 }}>
        <Text style={{ fontSize: 15, color: colors.muted }}>{busy ? 'Refreshing…' : 'Refresh'}</Text>
      </Pressable>
    </>
  );
  // On the Sell page the board sits inline; on its own it is a full screen.
  if (inline) return <View style={{ gap: 12 }} testID="board-inline">{content}</View>;
  return (
    <Screen title="Sold board" testID="board-screen">
      {content}
    </Screen>
  );
}

/** The products on an order (services such as the delivery charge left out), read from Odoo. */
function useGoods(saleId: number): { id: number; name: string; qty: number }[] {
  const { client, offline } = useOdoo();
  const [lines, setLines] = useState<{ id: number; name: string; qty: number }[]>([]);
  useEffect(() => {
    if (!client || offline || !saleId) return;
    (async () => {
      const rows = (await client.call('sale.order.line', 'search_read', [[['order_id', '=', saleId], ['display_type', '=', false]]], { fields: ['name', 'product_uom_qty', 'product_id'] })) as Record<string, unknown>[];
      // Services (the delivery charge, for one) are not packed. If Odoo can't say, nothing is hidden.
      const ids = [...new Set(rows.map((r) => (Array.isArray(r.product_id) ? (r.product_id[0] as number) : 0)).filter(Boolean))];
      const services = new Set<number>();
      if (ids.length) {
        try {
          const kinds = (await client.call('product.product', 'read', [ids], { fields: ['type'] })) as { id: number; type?: string }[];
          for (const k of kinds) if (k.type === 'service') services.add(k.id);
        } catch {
          // Keep every line.
        }
      }
      const goods = rows.filter((r) => !(Array.isArray(r.product_id) && services.has(r.product_id[0] as number)));
      setLines(goods.map((r) => ({ id: r.id as number, name: Array.isArray(r.product_id) ? String(r.product_id[1] ?? '') : String(r.name ?? ''), qty: Number(r.product_uom_qty ?? 0) })));
    })().catch(() => undefined);
  }, [client, offline, saleId]);
  return lines;
}

/** A plain list of what is in the order. */
function GoodsList({ saleId, color, muted }: { saleId: number; color: string; muted?: boolean }) {
  const lines = useGoods(saleId);
  if (!lines.length) return null;
  return (
    <View style={{ gap: 2 }} testID={`goods-${saleId}`}>
      {lines.map((l) => (
        <Text key={l.id} style={{ color, fontSize: 15, opacity: muted ? 0.7 : 1 }}>{`${String(Math.round(l.qty * 100) / 100)} × ${l.name}`}</Text>
      ))}
    </View>
  );
}

/** One order to pack: name and tag, the products to put in, and one button that opens the packing step. */
function PackCard({ o, late, onPack }: { o: BoardOrder; late: boolean; onPack: () => void }) {
  const { colors } = useBrand();
  const lines = useGoods(o.saleId);
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  return (
    <Card testID={`board-${o.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: colors.text }}>{o.customer || o.origin || o.name}</Text>
        <View style={{ backgroundColor: late ? colors.stop : '#C26A0E', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>{late ? 'Late' : 'To pack'}</Text>
        </View>
      </View>
      <Body muted>{`${o.origin || o.name}${o.pickup ? ' · Pickup' : ''}${o.date ? ` · ${o.date.slice(0, 10)}` : ''}`}</Body>
      {lines.map((l) => (
        <Pressable key={l.id} onPress={() => setTicked({ ...ticked, [l.id]: !ticked[l.id] })} accessibilityRole="checkbox" accessibilityState={{ checked: !!ticked[l.id] }} accessibilityLabel={l.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: ticked[l.id] ? colors.accent : 'transparent' }}>
            {ticked[l.id] ? <Text style={{ color: colors.onAccent, fontSize: 14 }}>✓</Text> : null}
          </View>
          <Text style={{ flex: 1, fontSize: 16, color: colors.text }}>{l.name}</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{String(Math.round(l.qty * 100) / 100)}</Text>
        </Pressable>
      ))}
      <Button label="Pack it ›" onPress={onPack} testID={`board-pack-${o.id}`} />
    </Card>
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

/** Is the order's invoice paid? true / false from Odoo, or null when it can't be asked (no signal, no invoice yet). */
function usePaid(saleId: number): boolean | null {
  const { client, offline } = useOdoo();
  const [paid, setPaid] = useState<boolean | null>(null);
  useEffect(() => {
    if (!client || offline || !saleId) return;
    (async () => {
      const r = (await client.call('sale.order', 'read', [[saleId]], { fields: ['invoice_ids'] })) as { invoice_ids?: number[] }[];
      const ids = r[0]?.invoice_ids ?? [];
      if (!ids.length) return;
      const moves = (await client.call('account.move', 'read', [ids], { fields: ['payment_state', 'state'] })) as { payment_state?: string; state?: string }[];
      const live = moves.filter((m) => m.state !== 'cancel');
      if (live.length) setPaid(live.every((m) => m.payment_state === 'paid' || m.payment_state === 'in_payment'));
    })().catch(() => undefined);
  }, [client, offline, saleId]);
  return paid;
}

/** A finished delivery or pickup as one slim card: name, order, date, and Paid or Not paid. Payment is recorded only when asked for. */
function DoneRow({ o, waitingToSend }: { o: BoardOrder; waitingToSend: boolean }) {
  const { colors } = useBrand();
  const paid = usePaid(o.saleId);
  const [paying, setPaying] = useState(false);
  return (
    <Card testID={`board-${o.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{o.customer || o.origin || o.name}</Text>
          <Text style={{ fontSize: 14, color: colors.muted }}>{`${o.origin || o.name}${o.date ? ` · ${o.date.slice(0, 10)}` : ''}`}</Text>
        </View>
        {paid !== null ? (
          <Text style={{ fontSize: 15, fontWeight: '800', color: paid ? '#2F7D52' : '#C26A0E' }} testID={`board-paid-${o.id}`}>
            {paid ? 'Paid' : 'Not paid'}
          </Text>
        ) : null}
      </View>
      {o.saleId ? <GoodsList saleId={o.saleId} color={colors.muted} /> : null}
      {waitingToSend ? <Body muted>{`${o.pickup ? 'Picked up' : 'Delivered'} (waiting to send)`}</Body> : null}
      {o.saleId && paid !== true && !paying ? <Button label="Record payment" kind="plain" onPress={() => setPaying(true)} testID={`board-record-${o.id}`} /> : null}
      {o.saleId && paying ? <PaymentCard order={o} /> : null}
      {o.saleId && !o.pickup ? <ProofToggle o={o} /> : null}
    </Card>
  );
}

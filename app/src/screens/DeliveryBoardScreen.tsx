import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Body, Button, Card, Chip, ErrorText, Screen, Row } from '../components/ui';
import { BoardOrder, deliveredChange, loadBoard, mapLink, STEP_WORDS } from '../lib/deliveryBoard';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { PhotosCard } from './PhotosCard';

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

  const waiting = new Set(items.filter((i) => i.step?.kind === 'note').map((i) => (i.step as { resId: number }).resId));

  const delivered = async (o: BoardOrder) => {
    setError('');
    try {
      await save(deliveredChange(o));
      await load();
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };

  return (
    <Screen title="Delivery board" testID="board-screen">
      {fromPhone ? <Body muted>No signal. Showing what the phone saw last.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!list ? <Body muted>{busy ? 'Loading…' : 'Nothing to show yet. Connect to Odoo to load the board.'}</Body> : null}
      {list && !list.length ? <Body muted>No deliveries or pickups for today.</Body> : null}
      {list?.map((o) => {
        const isWaiting = waiting.has(o.saleId);
        const step = isWaiting ? 'delivered' : o.step;
        return (
          <Card key={o.id} title={o.customer || o.origin || o.name} testID={`board-${o.id}`}>
            <Chip label={isWaiting ? 'Delivered (waiting to send)' : STEP_WORDS[step]} testID={`board-step-${o.id}`} />
            <Body muted>{`${o.origin || o.name}${o.date ? ` · ${o.date.slice(0, 10)}` : ''}`}</Body>
            {o.address ? <Row title="Address" detail={o.address} onPress={() => Linking.openURL(mapLink(o.address))} testID={`board-map-${o.id}`} /> : <Body muted>No address on the contact.</Body>}
            {o.phone ? <Row title="Phone" detail={o.phone} onPress={() => Linking.openURL(`tel:${o.phone}`)} /> : null}
            {o.notes ? <Body>{`Notes: ${o.notes}`}</Body> : null}
            {step === 'pack' ? <Button label="Pack it" kind="plain" onPress={onPack} testID={`board-pack-${o.id}`} /> : null}
            {o.saleId ? <PhotosCard model="sale.order" resId={o.saleId} recordName={o.origin || o.name} title="Delivery proof" about="Delivery proof" button="Take a proof photo" testID={`board-photos-${o.id}`} /> : null}
            {step === 'packed' && o.saleId ? <Button label="Delivered" onPress={() => delivered(o)} testID={`board-delivered-${o.id}`} /> : null}
          </Card>
        );
      })}
      <Button label="Refresh" kind="plain" onPress={load} busy={busy} />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

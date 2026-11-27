import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText } from '../components/ui';
import { payMethods } from '../lib/deliveryPay';
import { loadJournals, type Journal } from '../lib/ingredients';
import { loadPoState, orderBillChange, type PoState } from '../lib/poBill';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const journalKey = (db: string) => `money/journals/${db}`;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * What to do next on a purchase order, in order: Confirm it, Check in the
 * delivery, then make the bill and say how it was paid. Shown on the order's
 * Lines tab and on the lines screen. Odoo does the work; the app only asks.
 */
export function PoActions({ id, onCheckIn }: { id: number; onCheckIn: () => void }) {
  const { client, db, offline } = useOdoo();
  const { save } = useQueue();
  const [po, setPo] = useState<PoState | null>(null);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const read = () => {
    if (!client || offline) return;
    loadPoState(client, id).then(setPo).catch(() => undefined);
  };
  useEffect(read, [client, offline, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!db) return;
    if (client && !offline) {
      loadJournals(client).then((j) => {
        setJournals(j);
        AsyncStorage.setItem(journalKey(db), JSON.stringify(j)).catch(() => undefined);
      }).catch(() => undefined);
    } else {
      AsyncStorage.getItem(journalKey(db)).then((raw) => raw && setJournals(JSON.parse(raw) as Journal[])).catch(() => undefined);
    }
  }, [client, db, offline]);

  if (!po) return null;
  const confirm = async () => {
    setError('');
    try {
      const r = await save({ label: 'Confirm purchase order', model: 'purchase.order', method: 'button_confirm', args: [[id]], already: { model: 'purchase.order', domain: [['id', '=', id], ['state', 'not in', ['draft', 'sent']]] } });
      setNote(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Confirmed. Odoo made the delivery.');
      read();
    } catch (e) {
      setError(`Odoo said no: ${why(e)}`);
    }
  };
  const bill = async (label: string, journalId: number | null) => {
    setError('');
    try {
      const r = await save(orderBillChange(id, po.name || `order ${id}`, journalId, label, today()));
      const wait = r.status === 'queued' ? ' Saved on the phone; it goes to Odoo when signal is back.' : '';
      setNote(journalId ? `Bill made and paid with ${label}.${wait}` : `Bill made. It is open under Purchase history.${wait}`);
      read();
    } catch (e) {
      setError(`Odoo said no: ${why(e)}`);
    }
  };

  if (po.state === 'draft' || po.state === 'sent')
    return (
      <Card title="Confirm this order">
        <Body muted>Odoo makes the delivery when you confirm. Then Check in the delivery is ready for it.</Body>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {note ? <Body>{note}</Body> : null}
        <Button label="Confirm order" testID="po-confirm" onPress={confirm} />
      </Card>
    );
  if (po.state !== 'purchase' && po.state !== 'done') return null;

  const methods = payMethods(journals);
  const unpaid = po.bills.filter((b) => !b.paid);
  const allPaid = po.bills.length > 0 && !unpaid.length;
  return (
    <>
      {po.openReceipts > 0 ? (
        <Card title="Delivery">
          <Body muted>Waiting for the delivery. Check it in when it arrives.</Body>
          <Button label="Check in the delivery" onPress={onCheckIn} testID="po-checkin" />
        </Card>
      ) : null}
      {po.openReceipts === 0 && po.doneReceipts > 0 ? (
        <Card title="Bill and payment" testID="po-bill-card">
          {allPaid ? <Body>{`Paid: ${po.bills.map((b) => b.name).join(', ')}.`}</Body> : null}
          {!allPaid ? (
            <>
              <Body>{po.bills.length ? `The bill is not paid yet. How did you pay?` : 'The delivery is in. Make the bill and say how you paid.'}</Body>
              {methods.map((m) => (
                <Button key={m.key} label={m.label} onPress={() => bill(m.label, m.journal.id)} testID={`po-pay-${m.key}`} />
              ))}
              {!methods.length ? <Body muted>Odoo has no Cash, Cash App or Venmo payment method yet. Add them in Odoo, Accounting, Configuration, Journals.</Body> : null}
              {!po.bills.length ? <Button label="Make the bill, not paid yet" kind="plain" onPress={() => bill('', null)} testID="po-pay-none" /> : null}
            </>
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          {note ? <Body>{note}</Body> : null}
        </Card>
      ) : null}
      {error && po.openReceipts > 0 ? <ErrorText>{error}</ErrorText> : null}
    </>
  );
}

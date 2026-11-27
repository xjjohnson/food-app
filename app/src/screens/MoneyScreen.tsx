import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShareCsv } from './MoneyPages';
import { moneyCells } from '../lib/packet';
import { Body, Button, Card, Chip, ErrorText, Field, Row, Screen, Segments } from '../components/ui';
import { Journal, loadJournals } from '../lib/ingredients';
import { useInnerBack } from '../lib/innerBack';
import { currencySymbol } from '../lib/lookup';
import { filterMoney, loadMoney, loadMoneyLines, MoneyKind, MoneyLine, MoneyRow, payChange, Show, stateWords } from '../lib/money';
import { fmtQty, ymd } from '../lib/production';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { loadBillPayments, type BillPayment } from '../lib/poBill';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const copyKey = (kind: MoneyKind, db: string, partnerId?: number) => `money/${kind}/${db}${partnerId ? `/${partnerId}` : ''}`;
const journalKey = (db: string) => `money/journals/${db}`;

const WORDS: Record<MoneyKind, { title: string; empty: string; who: string; owed: string; paid: string }> = {
  out: { title: 'Invoices', empty: 'No invoices yet.', who: 'Customer', owed: 'Who owes you', paid: 'Paid' },
  in: { title: 'Purchase history', empty: 'No purchases yet.', who: 'Store', owed: 'Not paid yet', paid: 'Paid' },
};

const SHOW: { id: Show; label: string }[] = [
  { id: 'owed', label: 'Not paid' },
  { id: 'paid', label: 'Paid' },
  { id: 'all', label: 'All' },
];

/** Invoices (what customers owe) or Purchase history (every vendor bill): newest first, tap for the lines, mark paid. */
export function MoneyScreen({ kind, onBack, partnerId, title }: { kind: MoneyKind; onBack?: () => void; partnerId?: number; title?: string }) {
  const { client, db, offline } = useOdoo();
  const { items } = useQueue();
  const w = WORDS[kind];
  const [rows, setRows] = useState<MoneyRow[] | null>(null);
  const [fromPhone, setFromPhone] = useState(false);
  const [show, setShow] = useState<Show>('owed');
  const [text, setText] = useState('');
  const [open, setOpen] = useState<MoneyRow | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [symbol, setSymbol] = useState('');

  useInnerBack(open ? () => setOpen(null) : null);

  const load = useCallback(async () => {
    if (!db) return;
    setError('');
    if (client && !offline) {
      setBusy(true);
      try {
        const list = await loadMoney(client, kind, { partnerId });
        setRows(list);
        setFromPhone(false);
        await AsyncStorage.setItem(copyKey(kind, db, partnerId), JSON.stringify(list));
        setSymbol(await currencySymbol(client, client.session.companyId));
        return;
      } catch (e) {
        setError(`Couldn’t read this from Odoo. ${why(e)}`);
      } finally {
        setBusy(false);
      }
    }
    try {
      const raw = await AsyncStorage.getItem(copyKey(kind, db, partnerId));
      if (raw) {
        setRows(JSON.parse(raw) as MoneyRow[]);
        setFromPhone(true);
      }
    } catch {
      // No copy yet.
    }
  }, [client, db, offline, kind, partnerId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Payments saved on this phone and not in Odoo yet, by invoice or bill. */
  const waiting = useMemo(() => new Set(items.filter((i) => i.step?.kind === 'pay').map((i) => (i.step as { moveId: number }).moveId)), [items]);
  const money = (n: number) => `${symbol}${n.toFixed(2)}`;
  const shown = useMemo(() => filterMoney(rows ?? [], show, text), [rows, show, text]);

  if (open) return <Detail row={open} money={money} waiting={waiting.has(open.id)} kind={kind} onBack={() => { setOpen(null); load(); }} />;

  return (
    <Screen title={title ?? w.title} testID={`money-${kind}`}>
      {fromPhone ? <Body muted>No signal. Showing what the phone saw last.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Segments options={SHOW.map((s) => (s.id === 'owed' && kind === 'out' ? { ...s, label: 'Owed' } : s))} value={show} onChange={setShow} testID="money-show" />
      <Field label={`Search by ${w.who.toLowerCase()} or number`} value={text} onChangeText={setText} testID="money-search" />
      {!rows ? <Body muted>{busy ? 'Loading…' : 'Nothing to show yet. Connect to Odoo to load this.'}</Body> : null}
      {rows && !shown.length ? <Body muted>{rows.length ? 'Nothing matches.' : w.empty}</Body> : null}
      {shown.map((r) => (
        <Row
          key={r.id}
          title={`${r.who || 'No name'} · ${r.name}`}
          detail={`${r.date || 'No date'}${waiting.has(r.id) ? ' · Payment waiting to send' : r.due && !r.paid ? ` · due ${r.due}` : ''}`}
          value={`${money(r.paid ? r.total : r.left || r.total)}\n${stateWords(r)}`}
          onPress={() => setOpen(r)}
          testID={`money-${r.id}`}
        />
      ))}
      {shown.length ? <ShareCsv name={kind === 'out' ? 'invoices' : 'purchase-history'} cells={moneyCells(shown)} /> : null}
      <Button label="Refresh" kind="plain" onPress={load} busy={busy} />
      {onBack ? <Button label="Back" kind="plain" onPress={onBack} /> : null}
    </Screen>
  );
}

function Detail({ row, money, waiting, kind, onBack }: { row: MoneyRow; money: (n: number) => string; waiting: boolean; kind: MoneyKind; onBack: () => void }) {
  const { client, db, offline } = useOdoo();
  const { save } = useQueue();
  const [lines, setLines] = useState<MoneyLine[] | null>(null);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!client || offline) return;
    loadMoneyLines(client, row.id)
      .then(setLines)
      .catch((e) => setError(`Couldn’t read the lines from Odoo. ${why(e)}`));
    loadBillPayments(client, row.id).then(setPayments).catch(() => undefined);
    loadJournals(client).then((j) => {
      setJournals(j);
      if (db) AsyncStorage.setItem(journalKey(db), JSON.stringify(j)).catch(() => undefined);
    });
  }, [client, offline, row.id, db]);

  useEffect(() => {
    if (!db || (client && !offline)) return;
    AsyncStorage.getItem(journalKey(db)).then((raw) => raw && setJournals(JSON.parse(raw) as Journal[])).catch(() => undefined);
  }, [db, client, offline]);

  const pay = async (j: Journal) => {
    setError('');
    try {
      const out = await save(payChange(row, j.id, j.name, ymd(new Date())));
      setNote(out.status === 'queued' ? 'Saved on the phone. It goes to Odoo when there is signal.' : 'Marked paid in Odoo.');
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };

  const canPay = !row.paid && row.state === 'posted' && !waiting && !note;

  return (
    <Screen title={row.name} testID="money-detail">
      <Card>
        <Row title={kind === 'out' ? 'Customer' : 'Store'} value={row.who || 'No name'} />
        <Row title="Date" value={row.date || 'None'} />
        {row.due ? <Row title="Due" value={row.due} /> : null}
        {row.origin || row.ref ? <Row title="From" value={row.origin || row.ref} /> : null}
        <Row title="Total" value={money(row.total)} />
        <Row title={row.paid ? 'Status' : 'Still to pay'} value={row.paid ? 'Paid' : money(row.left)} />
        <Chip label={waiting || note ? 'Payment waiting to send' : stateWords(row)} />
      </Card>
      <Card title="What was on it">
        {offline ? <Body muted>No signal. The lines show when the phone is back online.</Body> : null}
        {!lines && !offline ? <Body muted>Loading…</Body> : null}
        {lines && !lines.length ? <Body muted>No lines.</Body> : null}
        {lines?.map((l) => (
          <Row key={l.id} title={l.name} detail={`${fmtQty(l.qty)} at ${money(l.price)}`} value={money(l.subtotal)} />
        ))}
      </Card>
      {payments.length ? (
        <Card title="How it was paid" testID="money-payments">
          {payments.map((p, i) => (
            <Row key={i} title={p.how || 'Payment'} detail={p.date} value={money(p.amount)} />
          ))}
        </Card>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      {row.state === 'draft' ? <Body muted>This is still a draft in Odoo. Confirm it there before marking it paid.</Body> : null}
      {canPay ? (
        <Card title="Mark as paid">
          {!journals.length ? <Body muted>No ways to pay found. Open the invoice screen once with signal.</Body> : null}
          {journals.map((j) => (
            <Button key={j.id} label={`Paid with ${j.name}`} onPress={() => pay(j)} testID={`pay-${j.id}`} />
          ))}
        </Card>
      ) : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

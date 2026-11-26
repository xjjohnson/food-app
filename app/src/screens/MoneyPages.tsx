import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Row, Screen, Segments } from '../components/ui';
import { loadSettings, settingChange } from '../lib/appSettings';
import { toCsv } from '../lib/csv';
import { ExpenseInput, expenseChange, expenseProblems, loadExpenseAccounts } from '../lib/expense';
import { loadJournals } from '../lib/ingredients';
import { BudgetRow, budgetKey, budgetRows, CashRow, DueBill, GOAL_KEY, goalPercent, loadBillsDue, loadCash, loadCategories, loadSpent, loadTax, TaxRow } from '../lib/moneyReports';
import { buildPacket, cashCells, moneyCells, taxCells } from '../lib/packet';
import { keepPhoto } from '../lib/photoFiles';
import { loadSold, Range, RANGES, rangeDays } from '../lib/reports';
import { shareText } from '../lib/shareFile';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { CameraSheet } from './PhotosCard';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (n: number) => n.toFixed(2);
const SAVED = (queued: boolean) => (queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A "Share as a spreadsheet file" button. */
export function ShareCsv({ name, cells }: { name: string; cells: (string | number)[][] }) {
  const [error, setError] = useState('');
  return (
    <View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Share as a spreadsheet file"
        kind="plain"
        testID="share-csv"
        onPress={async () => {
          try {
            setError('');
            await shareText(`${name}.csv`, toCsv(cells));
          } catch (e) {
            setError(`Couldn’t share it. ${why(e)}`);
          }
        }}
      />
    </View>
  );
}

function Page({ title, onBack, children, testID }: { title: string; onBack: () => void; children: React.ReactNode; testID: string }) {
  return (
    <Screen title={title} testID={testID}>
      {children}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

export function TaxPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [rows, setRows] = useState<TaxRow[] | null>(null);
  const [error, setError] = useState('');
  const year = new Date().getFullYear();
  useEffect(() => {
    if (client && !offline) loadTax(client, year).then(setRows).catch((e) => setError(`Couldn’t read the tax lines. ${why(e)}`));
  }, [client, offline, year]);
  return (
    <Page title="Sales tax" onBack={onBack} testID="tax-page">
      <Body muted>Tax as Odoo booked it, by month. Information only, not a tax return. Ask your accountant about anything unclear.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows && !rows.length ? <Body muted>No tax booked this year.</Body> : null}
      {rows?.map((r) => (
        <Row key={`${r.month}${r.tax}`} title={`${r.month} · ${r.tax}`} detail={`Charged on ${money(r.base)}`} value={money(r.amount)} />
      ))}
      {rows?.length ? <ShareCsv name={`sales-tax-${year}`} cells={taxCells(rows)} /> : null}
    </Page>
  );
}

export function CashPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<CashRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (client && !offline) loadCash(client, range).then(setRows).catch((e) => setError(`Couldn’t read payments. ${why(e)}`));
  }, [client, offline, range]);
  return (
    <Page title="Cash in and out" onBack={onBack} testID="cash-page">
      <Segments value={range} onChange={setRange} options={RANGES} testID="cash-range" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows && !rows.length ? <Body muted>No payments in this time.</Body> : null}
      {rows?.map((r) => (
        <Row key={r.way} title={r.way} detail={`Out ${money(r.cashOut)}`} value={`In ${money(r.cashIn)}`} />
      ))}
      {rows?.length ? <ShareCsv name="cash-in-out" cells={cashCells(rows)} /> : null}
    </Page>
  );
}

export function BillsPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [rows, setRows] = useState<DueBill[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (client && !offline) loadBillsDue(client).then(setRows).catch((e) => setError(`Couldn’t read the bills. ${why(e)}`));
  }, [client, offline]);
  return (
    <Page title="Bills due" onBack={onBack} testID="bills-page">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows && !rows.length ? <Body muted>No unpaid bills.</Body> : null}
      {rows?.map((r) => (
        <Row key={r.id} title={`${r.who || r.name}`} detail={r.due ? (r.late !== null && r.late > 0 ? `LATE: due ${r.due} (${r.late} days ago)` : `Due ${r.due}`) : 'No due date'} value={money(r.left)} testID={`bill-${r.id}`} />
      ))}
      {rows?.length ? <ShareCsv name="bills-due" cells={moneyCells(rows)} /> : null}
    </Page>
  );
}

export function GoalPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [goal, setGoal] = useState('');
  const [sold, setSold] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    loadSettings(client).then((s) => setGoal(s[GOAL_KEY] ?? ''));
    const { from, to } = rangeDays('month');
    loadSold(client, from, to).then((r) => setSold(r.reduce((n, x) => n + x.sales, 0))).catch((e) => setError(`Couldn’t read sales. ${why(e)}`));
  }, [client, offline]);
  const g = Number(goal.replace(',', '.')) || 0;
  const pct = sold === null ? 0 : goalPercent(g, sold);
  return (
    <Page title="Month goal" onBack={onBack} testID="goal-page">
      <Field label="Sales goal for each month" value={goal} onChangeText={setGoal} keyboardType="decimal-pad" testID="goal-input" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {sold !== null && g > 0 ? (
        <Card title={`${pct}% of the goal`} testID="goal-progress">
          <View style={{ height: 14, borderRadius: 7, backgroundColor: '#ddd', overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, pct)}%`, height: 14, backgroundColor: '#3a8f4a' }} />
          </View>
          <Body>{`Sold ${money(sold)} of ${money(g)} so far this month (Odoo’s totals, before tax).`}</Body>
        </Card>
      ) : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Save goal"
        testID="goal-save"
        onPress={async () => {
          try {
            const r = await save(settingChange(GOAL_KEY, String(g)));
            setNote(SAVED(r.status === 'queued'));
          } catch (e) {
            setError(`Odoo would not take that. ${why(e)}`);
          }
        }}
      />
    </Page>
  );
}

export function BudgetPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [rows, setRows] = useState<BudgetRow[] | null>(null);
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [edit, setEdit] = useState<{ id: number; name: string; text: string } | null>(null);
  const [error, setError] = useState('');
  const load = async () => {
    if (!client || offline) return;
    try {
      const [c, spent, s] = await Promise.all([loadCategories(client), loadSpent(client), loadSettings(client)]);
      setCats(c);
      setRows(budgetRows(c, spent, s));
    } catch (e) {
      setError(`Couldn’t read the budget. ${why(e)}`);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, offline]);
  if (edit)
    return (
      <Page title={edit.name} onBack={() => setEdit(null)} testID="budget-edit">
        <Field label="Budget for each month" value={edit.text} onChangeText={(t) => setEdit({ ...edit, text: t })} keyboardType="decimal-pad" testID="budget-input" />
        <Button
          label="Save budget"
          testID="budget-save"
          onPress={async () => {
            try {
              await save(settingChange(budgetKey(edit.id), String(Number(edit.text.replace(',', '.')) || 0)));
              setEdit(null);
              await load();
            } catch (e) {
              setError(`Odoo would not take that. ${why(e)}`);
            }
          }}
        />
      </Page>
    );
  return (
    <Page title="Budget this month" onBack={onBack} testID="budget-page">
      <Body muted>Spent is from bills posted this month, by product category (Odoo’s totals). Budgets are typed here.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows?.map((r) => (
        <Row key={r.categoryId} title={r.name} detail={r.budget > 0 ? `Budget ${money(r.budget)} · ${r.actual > r.budget ? 'OVER' : 'left ' + money(r.budget - r.actual)}` : 'No budget'} value={money(r.actual)} onPress={() => setEdit({ id: r.categoryId, name: r.name, text: r.budget ? String(r.budget) : '' })} testID={`budget-${r.categoryId}`} />
      ))}
      <Card title="Add a budget">
        {cats.filter((c) => !rows?.some((r) => r.categoryId === c.id)).map((c) => (
          <Row key={c.id} title={c.name} onPress={() => setEdit({ id: c.id, name: c.name, text: '' })} testID={`budget-new-${c.id}`} />
        ))}
      </Card>
    </Page>
  );
}

export function ExpensePage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [what, setWhat] = useState('');
  const [store, setStore] = useState('');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [accounts, setAccounts] = useState<{ id: number; name: string }[]>([]);
  const [journals, setJournals] = useState<{ id: number; name: string }[]>([]);
  const [accountId, setAccountId] = useState(0);
  const [journalId, setJournalId] = useState<number | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    loadExpenseAccounts(client).then(setAccounts);
    loadJournals(client).then(setJournals);
  }, [client, offline]);
  const problems = expenseProblems({ what, date, accountId, amountText: amount });
  return (
    <Page title="Add an expense" onBack={onBack} testID="expense-page">
      <Field label="What was it for" value={what} onChangeText={setWhat} testID="exp-what" />
      <Field label="Store or person paid" value={store} onChangeText={setStore} testID="exp-store" />
      <Field label="Date (year-month-day)" value={date} onChangeText={setDate} testID="exp-date" />
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" testID="exp-amount" />
      <Card title="Category">
        {accounts.length ? accounts.map((a) => <Row key={a.id} title={a.name} value={accountId === a.id ? '✓' : ''} onPress={() => setAccountId(a.id)} testID={`exp-acct-${a.id}`} />) : <Body muted>{offline ? 'No signal. Categories show when the phone is back online.' : 'No expense accounts found. Is the Accounting app on in Odoo?'}</Body>}
      </Card>
      <Card title="Paid with">
        <Row title="Not paid yet" value={journalId === null ? '✓' : ''} onPress={() => setJournalId(null)} testID="exp-unpaid" />
        {journals.map((j) => (
          <Row key={j.id} title={j.name} value={journalId === j.id ? '✓' : ''} onPress={() => setJournalId(j.id)} testID={`exp-pay-${j.id}`} />
        ))}
      </Card>
      <Button label={uri ? 'Take the receipt photo again' : 'Take a receipt photo'} kind="plain" onPress={() => setCamera(true)} testID="exp-photo" />
      {uri ? <Body muted>Receipt photo kept on the phone.</Body> : null}
      {camera ? (
        <CameraSheet
          onClose={() => setCamera(false)}
          onTaken={async (u) => {
            setCamera(false);
            try {
              setUri(await keepPhoto(u));
            } catch (e) {
              setError(`Couldn’t keep the photo. ${why(e)}`);
            }
          }}
        />
      ) : null}
      {problems.map((p) => (what || amount ? <ErrorText key={p}>{p}</ErrorText> : null))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Save expense"
        disabled={problems.length > 0}
        testID="exp-save"
        onPress={async () => {
          const input: ExpenseInput = { what, store, date, amount: Number(amount.replace(',', '.')), accountId, journalId, uri };
          try {
            const r = await save(expenseChange(input));
            setNote(SAVED(r.status === 'queued'));
            setWhat('');
            setStore('');
            setAmount('');
            setUri(null);
          } catch (e) {
            setError(`Odoo would not take that. ${why(e)}`);
          }
        }}
      />
    </Page>
  );
}

export function PacketPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const now = new Date();
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const [which, setWhich] = useState<'this' | 'last'>('last');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const month = which === 'this' ? ym(now) : ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return (
    <Page title="Accountant packet" onBack={onBack} testID="packet-page">
      <Body muted>One spreadsheet file for the month: sales, sales tax, cash in and out, customer invoices and purchase bills. Share it to email or Drive.</Body>
      <Segments value={which} onChange={setWhich} options={[{ id: 'last', label: 'Last month' }, { id: 'this', label: 'This month' }]} testID="packet-month" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label={`Build and share ${month}`}
        busy={busy}
        disabled={offline}
        testID="packet-build"
        onPress={async () => {
          if (!client) return;
          setBusy(true);
          setError('');
          try {
            const p = await buildPacket(client, month);
            await shareText(`accountant-packet-${month}.csv`, p.csv);
            setNote('Ready to share.');
          } catch (e) {
            setError(`Couldn’t build it. ${why(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Page>
  );
}

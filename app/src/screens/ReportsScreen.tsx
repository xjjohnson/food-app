import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useBrand } from '../lib/useBrand';
import { Body, Card, ErrorText, Field, Row, Screen, Segments, useUi } from '../components/ui';
import { Button } from '../components/ui';
import { useInnerBack } from '../lib/innerBack';
import { BreakEvenProduct, bestFirst, breakEvenUnits, findForBreakEven, loadSold, loadStockValue, loadYears, Range, RANGES, rangeDays, slowest, SoldRow, StockValue } from '../lib/reports';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';
import { BillsPage, BudgetPage, CashPage, ExpensePage, GoalPage, PacketPage, ShareCsv, TaxPage } from './MoneyPages';
import { soldCells } from '../lib/packet';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (n: number) => n.toFixed(2);
const fmtQty = (n: number) => String(Math.round(n * 100) / 100);
const qty = (n: number) => String(Math.round(n * 100) / 100);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Tab = 'menu' | 'sales' | 'profit' | 'stock' | 'years' | 'even' | 'tax' | 'cash' | 'bills' | 'goal' | 'budget' | 'expense' | 'packet';

/** Owner reports. Odoo's own numbers, side by side; nothing is worked out here beyond adding up. */
export function ReportsScreen() {
  const { client, offline } = useOdoo();
  const { roles } = useRoles();
  const [tab, setTab] = useState<Tab>('menu');
  const [range, setRange] = useState<Range>('month');
  const [sold, setSold] = useState<SoldRow[] | null>(null);
  const [slow, setSlow] = useState<{ name: string; units: number }[]>([]);
  const [stock, setStock] = useState<StockValue | null>(null);
  const [years, setYears] = useState<{ year: number; thisYear: number[]; lastYear: number[] } | null>(null);
  const [error, setError] = useState('');
  const back = () => setTab('menu');
  useInnerBack(tab !== 'menu' ? back : null);

  useEffect(() => {
    if (!client || offline || !roles.owner) return;
    setError('');
    const run = async () => {
      try {
        if (tab === 'sales' || tab === 'profit' || tab === 'menu') {
          const { from, to } = rangeDays(range);
          const rows = await loadSold(client, from, to);
          setSold(rows);
          setSlow(tab === 'sales' ? await slowest(client, rows) : []);
        } else if (tab === 'stock') setStock(await loadStockValue(client));
        else if (tab === 'years') setYears(await loadYears(client));
      } catch (e) {
        setError(`Couldn’t read the report from Odoo. ${why(e)}`);
      }
    };
    run();
  }, [client, offline, roles.owner, tab, range]);

  if (!roles.owner)
    return (
      <Screen title="Reports" testID="reports-screen">
        <Body>Only the owner can open reports.</Body>
      </Screen>
    );

  const best = sold ? bestFirst(sold) : [];
  const pages: Partial<Record<Tab, React.ReactElement>> = {
    tax: <TaxPage onBack={back} />,
    cash: <CashPage onBack={back} />,
    bills: <BillsPage onBack={back} />,
    goal: <GoalPage onBack={back} />,
    budget: <BudgetPage onBack={back} />,
    expense: <ExpensePage onBack={back} />,
    packet: <PacketPage onBack={back} />,
  };
  if (pages[tab]) return pages[tab]!;
  if (tab === 'menu')
    return (
      <Screen title="Money and reports" testID="reports-screen">
        <NumbersFirst rows={best} range={range} />
        <Card title="Reports">
          <Row title="Sales" detail="Best and slowest sellers" onPress={() => setTab('sales')} testID="rep-sales" />
          <Row title="Profit" detail="Sold, units and cost side by side" onPress={() => setTab('profit')} testID="rep-profit" />
          <Row title="Stock value" detail="What is on the shelves" onPress={() => setTab('stock')} testID="rep-stock" />
          <Row title="Year against last year" onPress={() => setTab('years')} testID="rep-years" />
          <Row title="Break-even" detail="Units to cover a cost" onPress={() => setTab('even')} testID="rep-even" />
          <Row title="Month goal" detail="Your goal and how far along" onPress={() => setTab('goal')} testID="rep-goal" />
        </Card>
        <Card title="Money">
          <Row title="Bills due" detail="Unpaid bills, late ones marked" onPress={() => setTab('bills')} testID="rep-bills" />
          <Row title="Cash in and out" onPress={() => setTab('cash')} testID="rep-cash" />
          <Row title="Sales tax" detail="As Odoo booked it" onPress={() => setTab('tax')} testID="rep-tax" />
          <Row title="Budget" detail="Spent against what you set, by category" onPress={() => setTab('budget')} testID="rep-budget" />
          <Row title="Add an expense" detail="With a receipt photo" onPress={() => setTab('expense')} testID="rep-expense" />
          <Row title="Accountant packet" detail="One file for the month" onPress={() => setTab('packet')} testID="rep-packet" />
        </Card>
      </Screen>
    );
  return (
    <Screen title="Reports" testID="reports-screen">
      {offline ? <Body muted>No signal. Reports need Odoo.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {tab === 'sales' || tab === 'profit' ? <Segments value={range} onChange={setRange} options={RANGES} testID="reports-range" /> : null}

      {tab === 'sales' && sold ? (
        <>
          <Card title="Best sellers" testID="report-best">
            {best.length ? best.slice(0, 10).map((r) => <Row key={r.productId} title={r.name} detail={`${money(r.sales)} sold`} value={`${qty(r.units)}`} />) : <Body muted>Nothing sold in this time.</Body>}
          </Card>
          <Card title="Slowest sellers" testID="report-slow">
            {slow.map((r) => (
              <Row key={r.name} title={r.name} value={qty(r.units)} />
            ))}
          </Card>
        </>
      ) : null}

      {tab === 'profit' && sold ? (
        <Card title="Price, cost and units" testID="report-profit">
          <Body muted>Sales are Odoo’s own totals. Cost is each product’s Cost in Odoo today. The app works out nothing here.</Body>
          {best.length ? (
            best.map((r) => (
              <Row key={r.productId} title={r.name} detail={`Sold ${money(r.sales)} · cost each ${money(r.cost)}${r.margin !== null ? ` · Odoo margin ${money(r.margin)}` : ''}`} value={`${qty(r.units)} units`} />
            ))
          ) : (
            <Body muted>Nothing sold in this time.</Body>
          )}
        </Card>
      ) : null}

      {tab === 'stock' && stock ? (
        stock.known ? (
          <Card title={`Stock value ${money(stock.total)}`} testID="report-stock">
            {stock.rows.map((r) => (
              <Row key={r.name} title={r.name} detail={`${qty(r.qty)} on hand`} value={money(r.value)} />
            ))}
          </Card>
        ) : (
          <Body muted>This Odoo does not give a value on stock lines. Turn on Automated inventory valuation in Odoo, then try again.</Body>
        )
      ) : null}

      {tab === 'years' && years ? (
        <Card title={`${years.year} and ${years.year - 1}, sold by month`} testID="report-years">
          {MONTHS.map((m, i) => (
            <Row key={m} title={m} detail={`${years.year - 1}: ${money(years.lastYear[i]!)}`} value={money(years.thisYear[i]!)} />
          ))}
          <Row title="Whole year" detail={`${years.year - 1}: ${money(years.lastYear.reduce((a, b) => a + b, 0))}`} value={money(years.thisYear.reduce((a, b) => a + b, 0))} />
        </Card>
      ) : null}

      {tab === 'even' ? <BreakEven /> : null}
      {tab === 'sales' && sold?.length ? <ShareCsv name="sales-by-product" cells={soldCells(best)} /> : null}
      {tab === 'profit' && sold?.length ? <ShareCsv name="profit-by-product" cells={soldCells(best)} /> : null}
      <Button label="Back" kind="plain" onPress={back} />
    </Screen>
  );
}

function BreakEven() {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [found, setFound] = useState<BreakEvenProduct[]>([]);
  const [pick, setPick] = useState<BreakEvenProduct | null>(null);
  const [fixed, setFixed] = useState('');

  useEffect(() => {
    if (!client || offline || pick) return;
    const t = setTimeout(() => findForBreakEven(client, text).then(setFound).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [client, offline, text, pick]);

  if (!pick)
    return (
      <Card title="Break-even" testID="report-even">
        <Body muted>How many units of a product cover a cost you type, like a market fee.</Body>
        <Field label="Find a product" value={text} onChangeText={setText} testID="even-search" />
        {found.map((p) => (
          <Row key={p.id} title={p.name} detail={`Price ${money(p.price)} · cost ${money(p.cost)}`} onPress={() => setPick(p)} testID={`even-${p.id}`} />
        ))}
      </Card>
    );
  const units = breakEvenUnits(Number(fixed.replace(',', '.')), pick.price, pick.cost);
  return (
    <Card title={pick.name} testID="report-even-result">
      <Row title="Price (Odoo)" value={money(pick.price)} />
      <Row title="Cost (Odoo)" value={money(pick.cost)} />
      <Field label="Cost to cover (for example the market fee)" value={fixed} onChangeText={setFixed} keyboardType="decimal-pad" testID="even-fixed" />
      {fixed && units === null ? <Body>The price is not above the cost, so it never covers the cost.</Body> : null}
      {units !== null ? <Body>{`About ${units} units. Before tax, a count only.`}</Body> : null}
      <Row title="Pick another product" onPress={() => { setPick(null); setFixed(''); }} testID="even-other" />
    </Card>
  );
}

/** The first thing on Money: this month's numbers and the best sellers as bars. Odoo's own totals, added up. */
function NumbersFirst({ rows, range }: { rows: SoldRow[]; range: Range }) {
  const s = useUi();
  const { colors } = useBrand();
  if (!rows.length) return null;
  const total = rows.reduce((a, r) => a + r.sales, 0);
  const units = rows.reduce((a, r) => a + r.units, 0);
  const top = rows.slice(0, 5);
  const biggest = Math.max(...top.map((r) => r.sales), 1);
  const tile = { flexBasis: '47%' as const, flexGrow: 1, borderRadius: 14, padding: 12, backgroundColor: colors.tint, gap: 2 };
  return (
    <Card title={range === 'month' ? 'This month' : 'Sold'} testID="report-numbers">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <View style={tile}>
          <Text style={s.muted}>Sold</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }} testID="numbers-sold">{money(total)}</Text>
        </View>
        <View style={tile}>
          <Text style={s.muted}>Units out</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }} testID="numbers-units">{fmtQty(units)}</Text>
        </View>
      </View>
      {top.map((r) => (
        <View key={r.productId} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[s.rowTitle, { fontSize: 16 }]}>{r.name}</Text>
            <Text style={s.rowValue}>{money(r.sales)}</Text>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.line }}>
            <View style={{ height: 10, borderRadius: 5, width: `${Math.max(4, (r.sales / biggest) * 100)}%`, backgroundColor: colors.accent }} />
          </View>
        </View>
      ))}
    </Card>
  );
}

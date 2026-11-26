import { useEffect, useState } from 'react';
import { Body, Card, ErrorText, Field, Row, Screen, Segments } from '../components/ui';
import { useInnerBack } from '../lib/innerBack';
import { BreakEvenProduct, bestFirst, breakEvenUnits, findForBreakEven, loadSold, loadStockValue, loadYears, Range, RANGES, rangeDays, slowest, SoldRow, StockValue } from '../lib/reports';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (n: number) => n.toFixed(2);
const qty = (n: number) => String(Math.round(n * 100) / 100);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Tab = 'sales' | 'profit' | 'stock' | 'years' | 'even';

/** Owner reports. Odoo's own numbers, side by side; nothing is worked out here beyond adding up. */
export function ReportsScreen() {
  const { client, offline } = useOdoo();
  const { roles } = useRoles();
  const [tab, setTab] = useState<Tab>('sales');
  const [range, setRange] = useState<Range>('month');
  const [sold, setSold] = useState<SoldRow[] | null>(null);
  const [slow, setSlow] = useState<{ name: string; units: number }[]>([]);
  const [stock, setStock] = useState<StockValue | null>(null);
  const [years, setYears] = useState<{ year: number; thisYear: number[]; lastYear: number[] } | null>(null);
  const [error, setError] = useState('');
  useInnerBack(null);

  useEffect(() => {
    if (!client || offline || !roles.owner) return;
    setError('');
    const run = async () => {
      try {
        if (tab === 'sales' || tab === 'profit') {
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
  return (
    <Screen title="Reports" testID="reports-screen">
      <Segments
        value={tab}
        onChange={setTab}
        testID="reports-tab"
        options={[
          { id: 'sales', label: 'Sales' },
          { id: 'profit', label: 'Profit' },
          { id: 'stock', label: 'Stock value' },
          { id: 'years', label: 'Year' },
          { id: 'even', label: 'Break-even' },
        ]}
      />
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

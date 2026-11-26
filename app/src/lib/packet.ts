/**
 * CSV files for sharing: one list at a time (Share on a report) and the
 * accountant packet, one file with a section per report for a chosen month.
 * Every number is the one Odoo gave; nothing is recalculated.
 *
 * Kept free of React; the client is passed in.
 */
import { toCsv } from './csv';
import { CashRow, loadCashDates, loadTax, TaxRow } from './moneyReports';
import { loadMoney, MoneyRow } from './money';
import type { OdooClient } from './odoo';
import { loadSold, SoldRow } from './reports';

type Client = Pick<OdooClient, 'call'>;
type Cells = (string | number)[][];

export const soldCells = (rows: SoldRow[]): Cells => [['Product', 'Units', 'Sold', 'Cost each'], ...rows.map((r) => [r.name, r.units, r.sales.toFixed(2), r.cost.toFixed(2)])];
export const taxCells = (rows: TaxRow[]): Cells => [['Month', 'Tax', 'Amount', 'Charged on'], ...rows.map((r) => [r.month, r.tax, r.amount.toFixed(2), r.base.toFixed(2)])];
export const cashCells = (rows: CashRow[]): Cells => [['Paid with', 'In', 'Out'], ...rows.map((r) => [r.way, r.cashIn.toFixed(2), r.cashOut.toFixed(2)])];
export const moneyCells = (rows: MoneyRow[]): Cells => [['Number', 'Who', 'Date', 'Due', 'Total', 'Left to pay'], ...rows.map((r) => [r.name, r.who, r.date, r.due, r.total.toFixed(2), r.left.toFixed(2)])];

export interface Packet {
  month: string;
  csv: string;
}

/** Everything for one month (YYYY-MM) in one CSV: sales, tax, cash, customer invoices and purchase bills. */
export async function buildPacket(c: Client, month: string): Promise<Packet> {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const from = `${month}-01`;
  const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const sold = await loadSold(c, from, to);
  const tax = (await loadTax(c, y)).filter((r) => r.month === month);
  const inMonth = (d: string) => d >= from && d <= to;
  const invoices = (await loadMoney(c, 'out', { limit: 500 })).filter((r) => inMonth(r.date));
  const bills = (await loadMoney(c, 'in', { limit: 500 })).filter((r) => inMonth(r.date));
  const cash = await loadCashDates(c, from, to);
  const sections: [string, Cells][] = [
    ['Sales by product', soldCells(sold)],
    ['Sales tax as booked', taxCells(tax)],
    ['Cash in and out', cashCells(cash)],
    ['Customer invoices', moneyCells(invoices)],
    ['Purchase bills', moneyCells(bills)],
  ];
  const rows: Cells = [[`Accountant packet ${month}`], ['Numbers are as Odoo has them. Ask your accountant about anything unclear.']];
  for (const [title, cells] of sections) rows.push([], [title], ...cells);
  return { month, csv: toCsv(rows) };
}

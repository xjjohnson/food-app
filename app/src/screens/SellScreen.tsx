import { useEffect, useMemo, useState } from 'react';
import { Share } from 'react-native';
import { Body, Button, Card, ErrorText, Field, ListRow, Row, Screen } from '../components/ui';
import { useInnerBack, useLeaveAtBase } from '../lib/innerBack';
import { confirmChange, emailQuote, invoiceChange, loadQuotes, quoteText, quoteWords, QuoteRow, repeatChange, SALE_SECTIONS, SO_LINES } from '../lib/sell';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { GenericForm } from './GenericForm';
import { LinesScreen, unitAfterProduct } from './SubRecordsEditor';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (n: number) => n.toFixed(2);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

type Page = { p: 'menu' } | { p: 'list' } | { p: 'quote'; id?: number; lines?: boolean };

/** Quotes and orders for customers: new quote and the list of quotes. */
export function SellScreen({ go }: { go?: string } = {}) {
  const [page, setPage] = useState<Page>(go === 'quote' ? { p: 'quote' } : go === 'list' ? { p: 'list' } : { p: 'menu' });
  const menu = () => setPage({ p: 'menu' });
  useLeaveAtBase(!!go, page.p === 'menu');
  useInnerBack(page.p === 'menu' ? null : page.p === 'quote' && page.lines ? () => setPage({ p: 'quote', id: page.id }) : page.p === 'quote' && page.id ? () => setPage({ p: 'list' }) : menu);
  if (page.p === 'list') return <QuoteList onBack={menu} onOpen={(id) => setPage({ p: 'quote', id })} />;
  if (page.p === 'quote') {
    if (page.lines && page.id) return <QuoteLines id={page.id} onBack={() => setPage({ p: 'quote', id: page.id })} />;
    return (
      <GenericForm
        model="sale.order"
        recordId={page.id ?? null}
        title="Quote"
        defaults={page.id ? undefined : { date_order: ymd(new Date()), validity_date: ymd(new Date(Date.now() + 30 * 86400000)) }}
        noun="Quote"
        sections={SALE_SECTIONS}
        required={['partner_id']}
        uniqueField="client_order_ref"
        saveLabel="Next: add products"
        onCreated={(id) => setPage({ p: 'quote', id, lines: true })}
        testID="quote-form"
        onBack={() => (page.id ? setPage({ p: 'list' }) : menu())}
        extraTabs={
          page.id
            ? [
                { id: 'lines', label: 'Lines', render: () => <Button label="Edit the lines" onPress={() => setPage({ p: 'quote', id: page.id, lines: true })} testID="quote-lines" /> },
                { id: 'do', label: 'Send', render: () => <QuoteActions id={page.id!} /> },
              ]
            : undefined
        }
      />
    );
  }
  return (
    <Screen title="Quotes and orders" testID="sell-screen">
      <Row title="New quote" detail="Pick a customer, then add products" onPress={() => setPage({ p: 'quote' })} testID="sell-new" />
      <Row title="Quotes and open orders" detail="Open, confirm, share, invoice" onPress={() => setPage({ p: 'list' })} testID="sell-list" />
    </Screen>
  );
}

function QuoteLines({ id, onBack }: { id: number; onBack: () => void }) {
  const { client } = useOdoo();
  const [state, setState] = useState('');
  useEffect(() => {
    client?.call('sale.order', 'read', [[id]], { fields: ['state'] }).then((r) => setState(String((r as { state?: string }[])[0]?.state ?? ''))).catch(() => undefined);
  }, [client, id]);
  return (
    <LinesScreen
      title="Quote lines"
      onBack={onBack}
      spec={SO_LINES}
      domain={[['order_id', '=', id]]}
      base={{ order_id: id }}
      label="Quote"
      addLabel="Add a line"
      canEdit={state === '' || state === 'draft' || state === 'sent'}
      lockedNote="This order is confirmed. Change it in Odoo."
      afterPick={async (c, f, v) => {
        // Odoo 19 names the unit product_uom_id; older ones product_uom.
        const have = (await c.call('sale.order.line', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
        return unitAfterProduct('product_uom_id' in have ? 'product_uom_id' : 'product_uom')(c, f, v);
      }}
    />
  );
}

function QuoteActions({ id }: { id: number }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [info, setInfo] = useState<{ name: string; state: string; total: number } | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const load = () => {
    if (client && !offline) client.call('sale.order', 'read', [[id]], { fields: ['name', 'state', 'amount_total'] }).then((r) => { const o = (r as Record<string, unknown>[])[0]; if (o) setInfo({ name: String(o.name), state: String(o.state), total: Number(o.amount_total ?? 0) }); }).catch(() => undefined);
  };
  useEffect(load, [client, offline, id]);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError('');
    try {
      await fn();
      setNote(done);
      load();
    } catch (e) {
      setError(`Odoo would not do that. ${why(e)}`);
    }
  };
  const name = info?.name ?? 'quote';
  return (
    <Card title={info ? `${quoteWords(info.state)} ${info.name}` : 'Quote'} testID="quote-actions">
      {info ? <Row title="Total (Odoo’s)" value={money(info.total)} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      {info && (info.state === 'draft' || info.state === 'sent') ? <Button label="Confirm the order" onPress={() => run(() => save(confirmChange(id, name)), 'Confirmed. Odoo makes the delivery.')} testID="quote-confirm" /> : null}
      {info && (info.state === 'sale' || info.state === 'done') ? <Button label="Make the invoice" onPress={() => run(() => save(invoiceChange(id, name)), 'Invoice saved. It shows under Invoices.')} testID="quote-invoice" /> : null}
      <Button label="Share as text" kind="plain" disabled={offline} onPress={() => run(async () => Share.share({ message: await quoteText(client!, id) }), '')} testID="quote-share" />
      <Button label="Email it from Odoo" kind="plain" disabled={offline} onPress={() => run(() => emailQuote(client!, id), 'Odoo sent the email.')} testID="quote-email" />
      <Body muted>Nothing is sent unless you tap. Prices and totals come from Odoo.</Body>
    </Card>
  );
}

function QuoteList({ onOpen }: { onBack: () => void; onOpen: (id: number) => void }) {
  const { client, offline } = useOdoo();
  const [rows, setRows] = useState<QuoteRow[] | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const load = () => {
    if (client && !offline) loadQuotes(client).then(setRows).catch((e) => setError(`Couldn’t read the quotes. ${why(e)}`));
  };
  useEffect(load, [client, offline]);
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || `${r.customer} ${r.name}`.toLowerCase().includes(q));
  }, [rows, text]);
  return (
    <Screen title="Quotes and open orders" testID="quote-list">
      {offline ? <Body muted>No signal. The list needs Odoo.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Field label="Search" placeholder="Customer or number" value={text} onChangeText={setText} testID="quote-search" />
      {rows && !shown.length ? <Body muted>{text.trim() ? 'Nothing matches. Try fewer letters.' : 'No open quotes.'}</Body> : null}
      {shown.map((r) => (
        <ListRow
          key={r.id}
          title={r.customer || 'No customer'}
          detail={`${r.name}${r.date ? ` · ${r.date}` : ''}`}
          amount={`$${money(r.total)}`}
          tag={{ label: quoteWords(r.state), tone: r.state === 'sale' || r.state === 'done' ? 'good' : r.state === 'sent' ? 'warn' : 'plain' }}
          onPress={() => onOpen(r.id)}
          testID={`quote-${r.id}`}
        />
      ))}
      <Button label="Refresh" kind="plain" onPress={load} />
    </Screen>
  );
}

/** "Repeat last order" on a customer's page: a new quote like their last confirmed order. */
export function RepeatLastButton({ partnerId, name }: { partnerId: number; name: string }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  return (
    <>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Repeat the last order"
        kind="plain"
        disabled={offline}
        testID="contact-repeat"
        onPress={async () => {
          setError('');
          try {
            const [last] = (await client!.call('sale.order', 'search_read', [[['partner_id', '=', partnerId], ['state', 'in', ['sale', 'done']]]], { fields: ['id'], order: 'date_order desc, id desc', limit: 1 })) as { id: number }[];
            if (!last) {
              setNote(`${name} has no confirmed order to repeat.`);
              return;
            }
            const out = await save(repeatChange(last.id, name));
            setNote(out.status === 'queued' ? 'Saved on the phone. The quote is made when signal is back.' : 'A new quote is in Quotes and orders.');
          } catch (e) {
            setError(`Odoo would not do that. ${why(e)}`);
          }
        }}
      />
    </>
  );
}

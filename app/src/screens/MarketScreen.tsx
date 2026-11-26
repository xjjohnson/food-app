import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Body, Button, Card, ErrorText, Row, Screen } from '../components/ui';
import { loadMarket, MarketInfo, openFor, posUrl } from '../lib/market';
import { useOdoo } from '../lib/useOdoo';
import { useInnerBack } from '../lib/innerBack';
import { DaySheetPage, DrawerPage, PricePage, ResultsPage, TakePage, TotalsPage } from './MarketDay';

/** Market: opens Odoo's Point of Sale to ring up sales. */
const MARKET_PAGES = ['results', 'sheet', 'take', 'price', 'drawer', 'totals'] as const;

export function MarketScreen({ go }: { go?: string } = {}) {
  const { client, offline } = useOdoo();
  const [info, setInfo] = useState<MarketInfo | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState<'main' | (typeof MARKET_PAGES)[number]>(MARKET_PAGES.find((p) => p === go) ?? 'main');
  useInnerBack(page !== 'main' ? () => setPage('main') : null);

  useEffect(() => {
    if (!client || offline) return;
    loadMarket(client)
      .then(setInfo)
      .catch((e) => setError(`Couldn’t read the registers from Odoo. ${e instanceof Error ? e.message : String(e)}`));
  }, [client, offline]);

  const open = async (id: number) => {
    if (!client) return;
    setError('');
    try {
      await Linking.openURL(posUrl(client.session.url, id));
    } catch {
      setError('Couldn’t open the Point of Sale. Open it in your phone’s browser instead.');
    }
  };

  const back = () => setPage('main');
  if (page === 'results') return <ResultsPage onBack={back} />;
  if (page === 'sheet') return <DaySheetPage onBack={back} />;
  if (page === 'take') return <TakePage onBack={back} />;
  if (page === 'price') return <PricePage onBack={back} />;
  if (page === 'drawer') return <DrawerPage onBack={back} />;
  if (page === 'totals') return <TotalsPage onBack={back} />;
  return (
    <Screen title="Market" testID="market-screen">
      <Body>Sales are rung up in Odoo’s Point of Sale. It opens in your browser, and sales go to Odoo and take stock off the right batch.</Body>
      {offline ? <Body muted>No signal. The Point of Sale has its own offline mode, but it must be opened once with signal first.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {info && !info.registers.length ? <Body muted>Odoo has no register yet. Set one up in Odoo: Point of Sale, Configuration.</Body> : null}
      {info?.registers.map((r) => (
        <Button key={r.id} label={`Open ${r.name}`} onPress={() => open(r.id)} testID={`open-pos-${r.id}`} />
      ))}
      {info?.open.length ? (
        <Card title="Open registers">
          <Body muted>Close a register at the end of the day. In the Point of Sale, tap the menu, then Close Register. That is when Odoo finishes the day’s sales.</Body>
          {info.open.map((o) => (
            <Row key={o.configId} title={o.name} detail={openFor(o.since)} testID={`open-register-${o.configId}`} right={<Button label="Close register" onPress={() => open(o.configId)} testID={`close-register-${o.configId}`} />} />
          ))}
        </Card>
      ) : null}
      <Card title="Market day">
        <Row title="Market day sheet" detail="What sold last time and what is in stock" onPress={() => setPage('sheet')} testID="market-sheet" />
        <Row title="Check out and check in" detail="What you took and what came back" onPress={() => setPage('take')} testID="market-take" />
        <Row title="Price sheet" detail="Big list of prices to share" onPress={() => setPage('price')} testID="market-price" />
        <Row title="Cash drawer" detail="Count bills and coins" onPress={() => setPage('drawer')} testID="market-drawer" />
        <Row title="Day totals" detail="Cash App and Venmo against Odoo" onPress={() => setPage('totals')} testID="market-totals" />
        <Row title="Results" detail="Sales after closing" onPress={() => setPage('results')} testID="market-results" />
      </Card>
      {info ? (
        <Card title="Ways to pay (set in Odoo)">
          {info.payments.length ? info.payments.map((p) => <Row key={p} title={p} />) : <Body muted>No payment methods yet. Add Cash, Cash App and Venmo in Odoo’s Point of Sale settings.</Body>}
        </Card>
      ) : null}
    </Screen>
  );
}

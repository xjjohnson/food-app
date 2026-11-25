import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Body, Button, Card, ErrorText, Row, Screen } from '../components/ui';
import { loadMarket, MarketInfo, openFor, posUrl } from '../lib/market';
import { useOdoo } from '../lib/useOdoo';

/** Market: opens Odoo's Point of Sale to ring up sales. */
export function MarketScreen() {
  const { client, offline } = useOdoo();
  const [info, setInfo] = useState<MarketInfo | null>(null);
  const [error, setError] = useState('');

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
      {info ? (
        <Card title="Ways to pay (set in Odoo)">
          {info.payments.length ? info.payments.map((p) => <Row key={p} title={p} />) : <Body muted>No payment methods yet. Add Cash, Cash App and Venmo in Odoo’s Point of Sale settings.</Body>}
        </Card>
      ) : null}
    </Screen>
  );
}

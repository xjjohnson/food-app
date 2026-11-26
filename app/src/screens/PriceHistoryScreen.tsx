import { useEffect, useState } from 'react';
import { Body, Button, ErrorText, Row, Screen } from '../components/ui';
import { currencySymbol } from '../lib/lookup';
import { loadPriceHistory, PricePoint } from '../lib/priceHistory';
import { fmtQty } from '../lib/production';
import { useOdoo } from '../lib/useOdoo';

/** What was paid for one ingredient over time, from vendor bills. The cheapest price is marked. */
export function PriceHistoryScreen({ templateId, name, onBack }: { templateId: number; name: string; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [list, setList] = useState<PricePoint[] | null>(null);
  const [symbol, setSymbol] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    loadPriceHistory(client, templateId)
      .then(setList)
      .catch((e) => setError(`Couldn’t read the bills from Odoo. ${e instanceof Error ? e.message : String(e)}`));
    currencySymbol(client, client.session.companyId).then(setSymbol).catch(() => undefined);
  }, [client, offline, templateId]);
  return (
    <Screen title={`${name}: prices paid`} testID="price-history">
      {offline ? <Body muted>No signal. This comes from Odoo, so it shows when the phone is back online.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {list && !list.length ? <Body muted>No purchases of this ingredient yet.</Body> : null}
      {list?.map((p) => (
        <Row key={p.id} title={`${symbol}${p.price.toFixed(2)} each${p.cheapest ? ' · cheapest' : ''}`} detail={`${p.store || 'No store'} · ${p.date || 'No date'} · ${fmtQty(p.qty)} bought`} />
      ))}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

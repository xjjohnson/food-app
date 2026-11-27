import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Body, Button, ErrorText, Row, Screen, SectionLabel, Segments } from '../components/ui';
import { loadMarket, MarketInfo, openFor, posUrl } from '../lib/market';
import { useBrand } from '../lib/useBrand';
import { useOdoo } from '../lib/useOdoo';
import { useInnerBack, useLeaveAtBase } from '../lib/innerBack';
import { DaySheetPage, DrawerPage, PricePage, ResultsPage, TotalsPage } from './MarketDay';
import { CheckInPage, CheckOutPage } from './MarketTake';

/** Market: opens Odoo's Point of Sale to ring up sales. */
const MARKET_PAGES = ['results', 'sheet', 'take', 'checkin', 'price', 'drawer', 'totals'] as const;
type Part = 'before' | 'selling' | 'after';

/** One numbered step card: circle with the number, title, small line, arrow. The step you are on has an accent border. */
function StepCard({ n, title, detail, onPress, now, testID }: { n: number; title: string; detail: string; onPress: () => void; now?: boolean; testID: string }) {
  const { colors } = useBrand();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, backgroundColor: colors.card, borderRadius: 16, borderWidth: now ? 2 : 1, borderColor: now ? colors.accent : colors.line, paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.onAccent, fontWeight: '800' }}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{title}</Text>
        <Text style={{ fontSize: 14, color: colors.muted }}>{detail}</Text>
      </View>
      <Text style={{ fontSize: 18, color: colors.muted }}>›</Text>
    </Pressable>
  );
}

export function MarketScreen({ go }: { go?: string } = {}) {
  const { client, offline } = useOdoo();
  const [info, setInfo] = useState<MarketInfo | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState<'main' | (typeof MARKET_PAGES)[number]>(MARKET_PAGES.find((p) => p === go) ?? 'main');
  const [part, setPart] = useState<Part | null>(null);
  useLeaveAtBase(!!go, page === 'main');
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
  if (page === 'take') return <CheckOutPage onBack={back} />;
  if (page === 'checkin') return <CheckInPage onBack={back} />;
  if (page === 'price') return <PricePage onBack={back} />;
  if (page === 'drawer') return <DrawerPage onBack={back} />;
  if (page === 'totals') return <TotalsPage onBack={back} />;
  // Opens on the step you are in: Selling while a register is open, otherwise Before.
  const active: Part = part ?? (info?.open.length ? 'selling' : 'before');
  const PARTS: { id: Part; label: string }[] = [
    { id: 'before', label: 'Before' },
    { id: 'selling', label: 'Selling' },
    { id: 'after', label: 'After' },
  ];
  return (
    <Screen title="Market" testID="market-screen">
      <Segments<Part> options={PARTS} value={active} onChange={setPart} testID="market-part" />
      {offline ? <Body muted>No signal. The Point of Sale has its own offline mode, but it must be opened once with signal first.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {info && !info.registers.length ? <Body muted>Odoo has no register yet. Set one up in Odoo: Point of Sale, Configuration.</Body> : null}
      {active === 'before' ? (
        <>
          <SectionLabel>Get ready</SectionLabel>
          <StepCard n={1} now title="Market day sheet" detail="What sold last time, what is in stock" onPress={() => setPage('sheet')} testID="market-sheet" />
          <StepCard n={2} title="Check out" detail="Move what you take to Market" onPress={() => setPage('take')} testID="market-take" />
          <StepCard n={3} title="Price sheet" detail="Big list of prices to share" onPress={() => setPage('price')} testID="market-price" />
          <StepCard n={4} title="Count the cash drawer" detail="Starting bills and coins" onPress={() => setPage('drawer')} testID="market-drawer" />
        </>
      ) : null}
      {active !== 'after' ? (
        <>
          {info?.registers.map((r) => (
            <Button key={r.id} label={`Open ${r.name}`} onPress={() => open(r.id)} testID={`open-pos-${r.id}`} />
          ))}
          {active === 'selling' ? <Body muted>Sales are rung up in Odoo’s Point of Sale. It opens in your browser, and sales go to Odoo and take stock off the right batch.</Body> : null}
        </>
      ) : null}
      {active === 'selling' ? (
        <>
          {info && !info.open.length ? <Body muted>No register is open.</Body> : null}
          {info?.open.map((o) => (
            <Row key={o.configId} title={o.name} detail={`Open ${openFor(o.since)}`} testID={`open-register-${o.configId}`} />
          ))}
          {info?.payments.length ? <Body muted>{`Ways to pay (set in Odoo): ${info.payments.join(', ')}`}</Body> : null}
        </>
      ) : null}
      {active === 'after' ? (
        <>
          <SectionLabel>Close up</SectionLabel>
          {info?.open.length ? (
            info.open.map((o) => (
              <StepCard key={o.configId} n={1} now title={`Close ${o.name}`} detail={`Open ${openFor(o.since)}. In the Point of Sale tap the menu, then Close Register.`} onPress={() => open(o.configId)} testID={`close-register-${o.configId}`} />
            ))
          ) : (
            <StepCard n={1} title="Close the register" detail="No register is open" onPress={() => undefined} testID="close-register-none" />
          )}
          <StepCard n={2} now={!info?.open.length} title="Count the cash drawer" detail="Ending bills and coins" onPress={() => setPage('drawer')} testID="market-drawer-after" />
          <StepCard n={3} title="Check in" detail="Move what came back to the pantry" onPress={() => setPage('checkin')} testID="market-checkin" />
          <StepCard n={4} title="Day totals" detail="Cash App and Venmo against Odoo" onPress={() => setPage('totals')} testID="market-totals" />
          <StepCard n={5} title="Results" detail="Sold, best sellers, what is left" onPress={() => setPage('results')} testID="market-results" />
        </>
      ) : null}
    </Screen>
  );
}

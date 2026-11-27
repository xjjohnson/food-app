import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Body, ErrorText, Screen, SectionLabel } from '../components/ui';
import { loadMarket, MarketInfo, openFor, posUrl } from '../lib/market';
import { useBrand } from '../lib/useBrand';
import { useOdoo } from '../lib/useOdoo';
import { useInnerBack, useLeaveAtBase } from '../lib/innerBack';
import { loadResults, loadSessions, SessionResults } from '../lib/marketDay';
import { DaySheetPage, ResultsPage, TotalsPage } from './MarketDay';
import { CheckInPage, CheckOutPage } from './MarketTake';

/** Market: one page. A top card for the register, then Get ready, Today and Close up. Opens Odoo's Point of Sale to ring up sales. */
const MARKET_PAGES = ['results', 'sheet', 'take', 'checkin', 'totals'] as const;
const qty = (n: number) => String(Math.round(n * 100) / 100);

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

/** A big purple button inside the top card. */
function HeroButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const { colors } = useBrand();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={{ minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.accent }}>{label}</Text>
    </Pressable>
  );
}

function Tile({ value, label, testID }: { value: string; label: string; testID?: string }) {
  const { colors } = useBrand();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 10 }} testID={testID}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }} numberOfLines={1}>{value}</Text>
      <Text style={{ fontSize: 14, color: colors.muted }}>{label}</Text>
    </View>
  );
}

export function MarketScreen({ go }: { go?: string } = {}) {
  const { client, offline } = useOdoo();
  const { colors } = useBrand();
  const [info, setInfo] = useState<MarketInfo | null>(null);
  const [live, setLive] = useState<SessionResults | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState<'main' | (typeof MARKET_PAGES)[number]>(MARKET_PAGES.find((p) => p === go) ?? 'main');
  useLeaveAtBase(!!go, page === 'main');
  useInnerBack(page !== 'main' ? () => setPage('main') : null);

  useEffect(() => {
    if (!client || offline) return;
    loadMarket(client)
      .then(setInfo)
      .catch((e) => setError(`Couldn’t read the registers from Odoo. ${e instanceof Error ? e.message : String(e)}`));
  }, [client, offline]);

  // Sales so far today come from Odoo's open Point of Sale day. Read only.
  const openIds = info?.open.map((o) => o.configId).join(',') ?? '';
  useEffect(() => {
    if (!client || offline || !openIds) {
      setLive(null);
      return;
    }
    loadSessions(client, 10)
      .then((l) => {
        const s = l.find((x) => x.state !== 'closed');
        return s ? loadResults(client, s) : null;
      })
      .then(setLive)
      .catch(() => undefined);
  }, [client, offline, openIds]);

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
  if (page === 'totals') return <TotalsPage onBack={back} />;

  const first = info?.open[0];
  const items = live ? live.best.reduce((n, b) => n + b.qty, 0) : 0;
  return (
    <Screen title="Market" testID="market-screen">
      {offline ? <Body muted>No signal. The Point of Sale has its own offline mode, but it must be opened once with signal first.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <View style={{ backgroundColor: colors.accent, borderRadius: 18, padding: 16, gap: 8 }} testID="market-hero">
        {first ? (
          <>
            <Text style={{ color: colors.onAccent, opacity: 0.9, fontSize: 14 }}>{`${first.name} · ${openFor(first.since)}`}</Text>
            <Text style={{ color: colors.onAccent, fontSize: 26, fontWeight: '800' }} testID="market-sold">{live ? `${live.total.toFixed(2)} sold` : 'Selling'}</Text>
            <HeroButton label="Go to register ›" onPress={() => open(first.configId)} testID={`open-register-${first.configId}`} />
          </>
        ) : (
          <>
            <Text style={{ color: colors.onAccent, opacity: 0.9, fontSize: 14 }}>No register is open</Text>
            <Text style={{ color: colors.onAccent, fontSize: 22, fontWeight: '800' }}>Ready to sell?</Text>
            {info?.registers.map((r) => (
              <HeroButton key={r.id} label={`Open ${r.name} ›`} onPress={() => open(r.id)} testID={`open-pos-${r.id}`} />
            ))}
          </>
        )}
      </View>
      {info && !info.registers.length ? <Body muted>Odoo has no register yet. Set one up in Odoo: Point of Sale, Configuration.</Body> : null}
      {first ? (
        <Body muted>Sales are rung up in Odoo’s Point of Sale. It opens in your browser, and sales go to Odoo and take stock off the right batch.</Body>
      ) : null}

      <SectionLabel>Get ready</SectionLabel>
      <StepCard n={1} title="Market day sheet" detail="What sold last time, what is in stock" onPress={() => setPage('sheet')} testID="market-sheet" />
      <StepCard n={2} title="Check out" detail="Move what you take to Market" onPress={() => setPage('take')} testID="market-take" />

      <SectionLabel>Today</SectionLabel>
      {live ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} testID="market-live">
          <Tile value={live.total.toFixed(2)} label="sold so far" />
          <Tile value={String(live.orders)} label="orders" />
          <Tile value={qty(items)} label="items sold" />
          <Tile value={live.best[0]?.name ?? '-'} label="selling fastest" />
        </View>
      ) : (
        <Body muted>{first ? 'Loading sales…' : 'Sales show here once the register is open.'}</Body>
      )}
      {info?.payments.length ? <Body muted>{`Ways to pay (set in Odoo): ${info.payments.join(', ')}`}</Body> : null}

      <SectionLabel>Close up</SectionLabel>
      {info?.open.map((o) => (
        <StepCard key={o.configId} n={3} title={`Close ${o.name}`} detail="In the Point of Sale tap the menu, then Close Register." onPress={() => open(o.configId)} testID={`close-register-${o.configId}`} />
      ))}
      <StepCard n={info?.open.length ? 4 : 3} title="Check in" detail="Move what came back to the pantry" onPress={() => setPage('checkin')} testID="market-checkin" />
      <StepCard n={info?.open.length ? 5 : 4} title="Day totals" detail="Cash App and Venmo against Odoo" onPress={() => setPage('totals')} testID="market-totals" />
      <StepCard n={info?.open.length ? 6 : 5} title="Results" detail="Sold, best sellers, what is left" onPress={() => setPage('results')} testID="market-results" />
    </Screen>
  );
}

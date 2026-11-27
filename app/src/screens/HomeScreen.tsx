import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Card, Chip, Row, Screen, SectionLabel, useUi } from '../components/ui';
import { hasAnyRole, roleNames } from '../lib/roles';
import { plusChoices } from '../lib/tabs';
import { loadToday, TodayItem } from '../lib/today';
import { useBrand } from '../lib/useBrand';
import { useOdoo } from '../lib/useOdoo';
import { useRoles } from '../lib/useRoles';

/** Short names for the "All clear" line, and the four big tiles at the top (in this order). */
const SHORT: Record<string, string> = { 'special-soon': 'birthdays', batches: 'batches', orders: 'orders to pack', expiring: 'use-by dates', low: 'low ingredients', deliveries: 'deliveries', 'web-new': 'new website orders', 'season-now': 'in season', 'season-soon': 'seasons', owed: 'invoices', 'out-today': 'pickups today' };
const TILES: { id: string; label: string; hot: boolean }[] = [
  { id: 'tasks', label: 'Tasks due or late', hot: true },
  { id: 'web-new', label: 'New website orders', hot: false },
  { id: 'expiring', label: 'Close to use-by date', hot: true },
  { id: 'orders', label: 'Orders to pack', hot: false },
];
/** The four quick buttons: the plus-button choices, with short words. */
const QUICK: { id: string; label: string; mark: string }[] = [
  { id: 'bought', label: 'I bought something', mark: '$' },
  { id: 'batch', label: 'Start a batch', mark: '▶' },
  { id: 'quote', label: 'New order', mark: '+' },
  { id: 'task', label: 'Add task', mark: '✓' },
];

/** The Today tab: quick buttons, the big counts, and only the rows that are not zero. The areas live in the Make, Buy and Sell tabs. */
export function HomeScreen() {
  const { client, offline } = useOdoo();
  const { roles, mine, loading } = useRoles();
  const { name } = useBrand();
  const s = useUi();
  const { colors } = useBrand();
  const [showAll, setShowAll] = useState(false);
  const quick = QUICK.filter((q) => plusChoices(roles).some((c) => c.id === q.id));
  const hrefs = Object.fromEntries(plusChoices(roles).map((c) => [c.id, c.href]));
  const first = client?.session.name.split(' ')[0] ?? '';
  const [today, setToday] = useState<TodayItem[]>([]);
  // The counts are read again each time Today comes into view, and on pull down.
  const reload = useCallback(async () => {
    if (!client || offline || !hasAnyRole(roles)) return;
    try {
      setToday(await loadToday(client, roles));
    } catch {
      // Keep the last numbers.
    }
  }, [client, offline, roles]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  const open = (t: TodayItem) => router.push(t.area === 'tasks' ? '/tasks' : (`/area/${t.area}${t.go ? `?go=${t.go}` : ''}` as never));
  const tiles = TILES.flatMap((t) => {
    const item = today.find((x) => x.id === t.id);
    return item ? [{ item, label: t.label, hot: t.hot }] : [];
  });
  const nonZero = today.filter((t) => t.count > 0);
  const shown = showAll ? today : nonZero;
  const hidden = today.filter((t) => t.count === 0);

  return (
    <Screen
      title="Home"
      subtitle={name}
      back={false}
      testID="home-screen"
      onRefresh={reload}
      right={
        <Pressable onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Search" testID="open-search-top" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, color: colors.onHead }}>⌕</Text>
        </Pressable>
      }
    >
      <View style={{ gap: 6 }}>
        <Text style={s.cardTitle}>{first ? `Hi ${first}` : 'Hi'}</Text>
        {hasAnyRole(roles) ? <Chip label={roleNames(roles)} testID="my-roles" /> : null}
      </View>

      {!hasAnyRole(roles) && !loading ? (
        <Card title="No role yet" testID="no-role">
          <Body>
            {mine && !mine.hasEmployee
              ? 'Your Odoo login has no Employee record, so the app can’t see your role. Ask the owner to link you to an Employee in Odoo and give you a role.'
              : 'Ask the owner to give you a role in the app’s Management area (or as a Tag on your Employee in Odoo). Then pull this screen down or reopen the app.'}
          </Body>
        </Card>
      ) : null}

      {quick.length ? (
        <View style={{ flexDirection: 'row', gap: 8 }} testID="today-quick">
          {quick.map((q) => (
            <Pressable
              key={q.id}
              onPress={() => router.push(hrefs[q.id] as never)}
              accessibilityRole="button"
              accessibilityLabel={q.label}
              testID={`today-quick-${q.id}`}
              style={({ pressed }) => ({ flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 })}
            >
              <View style={s.tile}>
                <Text style={s.tileText}>{q.mark}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' }}>{q.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {tiles.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} testID="today-tiles">
          {tiles.map(({ item, label, hot }) => (
            <Pressable
              key={item.id}
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${item.count}`}
              testID={`today-tile-${item.id}`}
              style={({ pressed }) => ({ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 6, opacity: pressed ? 0.75 : 1 })}
            >
              <Text style={{ fontSize: 30, fontWeight: '800', color: hot && item.count > 0 ? colors.stop : colors.accent }}>{item.count}</Text>
              <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {today.length ? (
        <>
          {shown.length ? <SectionLabel>Also today</SectionLabel> : null}
          {shown.length ? (
            <Card testID="today-card">
              {shown.map((t) => (
                <Row key={t.id} title={t.title} value={String(t.count)} onPress={() => open(t)} testID={`today-${t.id}`} />
              ))}
            </Card>
          ) : null}
          {hidden.length || showAll ? (
            <Pressable onPress={() => setShowAll(!showAll)} accessibilityRole="button" testID="today-show-all">
              <Text style={[s.muted, { textAlign: 'center' }]}>
                {showAll ? 'Hide the empty ones' : `All clear: ${hidden.map((t) => SHORT[t.id] ?? t.title.toLowerCase()).join(', ')}. `}
                {showAll ? null : <Text style={{ color: colors.accent, fontWeight: '700' }}>Show all</Text>}
              </Text>
            </Pressable>
          ) : null}
          {!shown.length && !hidden.length ? <Body muted>All clear.</Body> : null}
        </>
      ) : null}

      {hasAnyRole(roles) ? <Row title="Tasks" detail="Jobs to do, and special dates" onPress={() => router.push('/tasks')} testID="open-tasks" /> : null}

    </Screen>
  );
}

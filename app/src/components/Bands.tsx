/**
 * The bands along the bottom of every screen:
 * - TEST DATABASE, while the phone is attached to a database marked as a test copy;
 * - No signal / changes waiting, while the queue holds anything;
 * - TEST MODE, while a Developer testing switch is on (so nobody forgets one);
 * - Update ready, once an over-the-air update has downloaded.
 * Taps go through all but the update bar.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dbLabel, DbKind, kindOf } from '../lib/dbSwitch';
import { onDevFlags, pretendOffline, rolePreview, weakSignal } from '../lib/devFlags';
import { ROLES } from '../lib/roles';
import { useBrand } from '../lib/useBrand';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { UpdateReadyBar } from './UpdateReadyBar';

const kindListeners = new Set<() => void>();
/** Call after marking a database test or live, so the band updates. */
export function dbKindChanged() {
  kindListeners.forEach((l) => l());
}

export function useDbKind(): DbKind | null {
  const { client } = useOdoo();
  const [kind, setKind] = useState<DbKind | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const l = () => setN((x) => x + 1);
    kindListeners.add(l);
    return () => {
      kindListeners.delete(l);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    kindOf(AsyncStorage, client?.session ?? null).then((k) => alive && setKind(k));
    return () => {
      alive = false;
    };
  }, [client, n]);
  return kind;
}

export function testModeLabels(): string[] {
  const out: string[] = [];
  const p = rolePreview();
  if (p) out.push(`Viewing as ${ROLES.find((r) => r.id === p)?.label ?? p}`);
  const s = weakSignal();
  if (s !== 'normal') out.push(s === 'slow' ? 'Slow signal' : 'Signal drops');
  if (pretendOffline()) out.push('Pretend offline');
  return out;
}

export function Bands() {
  const { colors } = useBrand();
  const { client, offline } = useOdoo();
  const { items } = useQueue();
  const kind = useDbKind();
  const [, tick] = useState(0);
  useEffect(() => onDevFlags(() => tick((x) => x + 1)), []);
  const test = testModeLabels();
  const stuck = items.filter((x) => x.state === 'stuck').length;
  const waiting = items.length - stuck;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ backgroundColor: colors.bg }}>
      {kind === 'test' && client ? (
        <View style={[styles.band, { backgroundColor: '#B54708' }]} pointerEvents="none" testID="test-db-band">
          <Text style={styles.white}>{`TEST DATABASE · ${dbLabel(client.session)}`}</Text>
        </View>
      ) : null}
      {test.length ? (
        <View style={[styles.band, { backgroundColor: colors.stop }]} pointerEvents="none" testID="test-mode-band">
          <Text style={[styles.white, { color: colors.onStop }]}>{`TEST MODE · ${test.join(' · ')}`}</Text>
        </View>
      ) : null}
      {items.length || offline ? (
        <Pressable onPress={() => router.push('/waiting')} style={[styles.band, { backgroundColor: stuck ? colors.warnBg : colors.tint }]} accessibilityRole="button" testID="queue-band">
          <Text style={[styles.dark, { color: stuck ? colors.warn : colors.text }]}>
            {[offline ? 'No signal: working offline' : '', waiting ? `${waiting} ${waiting === 1 ? 'change' : 'changes'} waiting to send` : '', stuck ? `${stuck} ${stuck === 1 ? 'needs' : 'need'} a look` : ''].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      ) : null}
      <UpdateReadyBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  band: { paddingHorizontal: 16, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  white: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  dark: { fontSize: 15, fontWeight: '800' },
});

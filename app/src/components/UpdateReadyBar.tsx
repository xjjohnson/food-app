import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { checkAndFetchOta, isCheckDue, type OtaApi } from '../lib/otaUpdate';
import type { Palette } from '../lib/palette';
import { useAppForeground } from '../lib/useAppForeground';
import { useStyles } from '../lib/useBrand';

interface Props {
  api?: OtaApi;
  restart?: () => Promise<unknown>;
  now?: () => number;
}

const defaultApi: OtaApi = Updates;
const defaultRestart = () => Updates.reloadAsync();

/**
 * A bar at the bottom once an over-the-air update has downloaded. Restart
 * switches to it right away. Later hides it until the app is next opened,
 * which also switches to the update. It never restarts by itself, so nobody
 * loses their place. Checks when the app opens and each time it comes back
 * to the screen, at most every ten minutes.
 */
export function UpdateReadyBar({ api = defaultApi, restart = defaultRestart, now = Date.now }: Props) {
  const s = useStyles(makeStyles);
  const [found, setFound] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastCheckAt = useRef<number | undefined>(undefined);
  const live = useRef(true);

  const look = useCallback(() => {
    if (!isCheckDue(lastCheckAt.current, now())) return;
    lastCheckAt.current = now();
    checkAndFetchOta(api).then((result) => {
      if (live.current && result === 'ready') setFound(true);
    });
  }, [api, now]);

  useEffect(() => {
    live.current = true;
    look();
    return () => {
      live.current = false;
    };
  }, [look]);

  useAppForeground(look);

  if (!found || hidden) return null;

  return (
    <View style={s.bar} testID="update-ready-bar" accessibilityRole="alert">
      <View style={{ flex: 1 }}>
        <Text style={s.title}>Update ready</Text>
        <Text style={s.body}>{failed ? "Couldn't restart. Close and reopen the app to use it." : 'Restart to use it.'}</Text>
      </View>
      <Pressable
        style={[s.button, s.primary]}
        disabled={restarting}
        onPress={() => {
          setRestarting(true);
          setFailed(false);
          restart().catch(() => {
            if (!live.current) return;
            setRestarting(false);
            setFailed(true);
          });
        }}
        accessibilityRole="button"
        accessibilityLabel="Restart to update"
        testID="update-restart"
      >
        <Text style={[s.buttonText, s.primaryText]}>{restarting ? 'Restarting' : 'Restart'}</Text>
      </Pressable>
      <Pressable style={s.button} onPress={() => setHidden(true)} accessibilityRole="button" accessibilityLabel="Update later" testID="update-later">
        <Text style={s.buttonText}>Later</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.warnBg, borderTopWidth: 1, borderTopColor: c.line },
    title: { fontSize: 17, fontWeight: '800', color: c.text },
    body: { fontSize: 15, color: c.text },
    button: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    primary: { backgroundColor: c.accent, borderColor: c.accent },
    buttonText: { fontSize: 17, fontWeight: '800', color: c.text },
    primaryText: { color: c.onAccent },
  });

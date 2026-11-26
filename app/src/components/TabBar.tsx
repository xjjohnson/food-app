/**
 * The bottom tab bar and its plus button. Colors come from the company brand.
 * The plus button opens a short list of "start something" choices; each one
 * opens the same screen as before, ready to fill in, so saves still go
 * through the offline queue.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { plusChoices, TABS, tabVisible, TabId } from '../lib/tabs';
import { useBrand } from '../lib/useBrand';
import { useRoles } from '../lib/useRoles';

/** The parts of the tab navigator's props this bar uses. */
export interface TabBarProps {
  state: { routes: { name: string; key: string }[]; index: number };
  navigateToTab: (routeKey: string) => void;
}

export function TabBar({ state, navigateToTab }: TabBarProps) {
  const { colors } = useBrand();
  const { roles } = useRoles();
  const [open, setOpen] = useState(false);
  const choices = plusChoices(roles);
  const current = state.routes[state.index]?.name as TabId | undefined;
  return (
    <View>
      {choices.length ? (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="New"
          testID="plus-button"
          style={[styles.fab, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.fabText, { color: colors.onAccent }]}>+</Text>
        </Pressable>
      ) : null}
      <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.line }]} testID="tab-bar">
        {TABS.filter((t) => tabVisible(t.id, roles)).map((t) => {
          const on = current === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => navigateToTab(state.routes.find((r) => r.name === t.id)?.key ?? t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
              testID={`tab-${t.id}`}
              style={styles.tab}
            >
              <Text style={{ fontSize: 18, color: on ? colors.accent : colors.muted }}>{t.mark}</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: on ? colors.accent : colors.muted }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.shade} onPress={() => setOpen(false)} testID="plus-shade">
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>Start something</Text>
            {choices.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => {
                  setOpen(false);
                  router.push(c.href as never);
                }}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                testID={`plus-${c.id}`}
                style={[styles.choice, { backgroundColor: colors.tint }]}
              >
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingBottom: 6 },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  fab: { position: 'absolute', right: 16, top: -68, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 4, zIndex: 5 },
  fabText: { fontSize: 32, fontWeight: '700', lineHeight: 36 },
  shade: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: { padding: 16, gap: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  choice: { minHeight: 56, borderRadius: 14, paddingHorizontal: 16, justifyContent: 'center' },
});

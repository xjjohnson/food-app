import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useBrand } from '../lib/useBrand';
import { isDate, ymd } from '../lib/production';
import { Button, useUi } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * A date picked from a calendar, drawn here (no native module, so it ships as
 * a normal update). The value is "YYYY-MM-DD", or "" when nothing is picked.
 */
export function DatePicker({ label, value, onChange, testID, clearable }: { label: string; value: string; onChange: (v: string) => void; testID?: string; clearable?: boolean }) {
  const s = useUi();
  const { colors } = useBrand();
  const [open, setOpen] = useState(false);
  const start = isDate(value) ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [shown, setShown] = useState(start);
  const first = (new Date(shown.getFullYear(), shown.getMonth(), 1).getDay() + 6) % 7; // Monday first
  const count = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const move = (n: number) => setShown(new Date(shown.getFullYear(), shown.getMonth() + n, 1));
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable
        onPress={() => {
          setShown(start);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'pick a date'}`}
        testID={testID}
        style={s.input}
      >
        <Text style={{ color: value ? colors.text : colors.muted, fontSize: 16 }}>{value || 'Tap to pick a date'}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 10 }} testID="date-picker">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Pressable onPress={() => move(-1)} accessibilityLabel="Earlier month" testID="date-prev" style={{ padding: 12 }}>
                <Text style={{ color: colors.text, fontSize: 22 }}>‹</Text>
              </Pressable>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }} testID="date-month">{`${MONTHS[shown.getMonth()]} ${shown.getFullYear()}`}</Text>
              <Pressable onPress={() => move(1)} accessibilityLabel="Later month" testID="date-next" style={{ padding: 12 }}>
                <Text style={{ color: colors.text, fontSize: 22 }}>›</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {DAYS.map((d, i) => (
                <Text key={i} style={{ flex: 1, textAlign: 'center', color: colors.muted }}>{d}</Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((n, i) => {
                const v = n ? ymd(new Date(shown.getFullYear(), shown.getMonth(), n)) : '';
                const on = !!n && v === value;
                return (
                  <View key={i} style={{ width: `${100 / 7}%`, padding: 2 }}>
                    {n ? (
                      <Pressable
                        onPress={() => {
                          onChange(v);
                          setOpen(false);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={v}
                        testID={`date-day-${n}`}
                        style={{ alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: on ? colors.accent : 'transparent' }}
                      >
                        <Text style={{ color: on ? colors.onAccent : colors.text, fontSize: 16 }}>{n}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
            {clearable && value ? <Button label="No date" kind="plain" onPress={() => { onChange(''); setOpen(false); }} testID="date-clear" /> : null}
            <Button label="Cancel" kind="plain" onPress={() => setOpen(false)} testID="date-cancel" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

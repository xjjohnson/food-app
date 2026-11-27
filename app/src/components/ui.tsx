/**
 * The app's building blocks: page, header, cards, buttons, rows, fields and
 * switches. Colors come from the Odoo company (lib/useBrand.tsx). Text and
 * buttons stay big, so they work with floury hands and in a busy market.
 */
import { router } from 'expo-router';
import { createContext, ReactNode, useContext, useEffect } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Palette } from '../lib/palette';
import { runInnerBack } from '../lib/innerBack';
import { log } from '../lib/log';
import { useBrand, useStyles } from '../lib/useBrand';

export const TOUCH = 52;

/** The page look: clean everywhere, "cookbook" (paper, dashed cards, serif titles) on recipe pages. */
export type Look = 'clean' | 'cookbook';
const LookContext = createContext<Look>('clean');
export const useLook = () => useContext(LookContext);
/** Wrap recipe pages in this to give them the cookbook look. */
export function LookScope({ look, children }: { look: Look; children: ReactNode }) {
  return <LookContext.Provider value={look}>{children}</LookContext.Provider>;
}
const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });
/** Warm paper tones for the cookbook look in light mode; dark mode keeps the brand dark colors. */
export const PAPER = { page: '#FFFBEF', card: '#FFFDF6', edge: '#C9A66B' };

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.bg },
    head: { backgroundColor: c.head, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
    headTitle: { flex: 1, color: c.onHead, fontSize: 22, fontWeight: '800' },
    headBack: { minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center' },
    headBackText: { color: c.onHead, fontSize: 18, fontWeight: '700' },
    logo: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#FFFFFF' },
    scroll: { padding: 16, gap: 16, paddingBottom: 120 },
    card: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 16, gap: 12 },
    cardTitle: { fontSize: 20, fontWeight: '800', color: c.text },
    body: { fontSize: 17, color: c.text, lineHeight: 24 },
    muted: { fontSize: 15, color: c.muted, lineHeight: 21 },
    button: { minHeight: TOUCH, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent },
    buttonText: { fontSize: 18, fontWeight: '800', color: c.onAccent },
    plain: { backgroundColor: c.card, borderWidth: 1.5, borderColor: c.line },
    plainText: { color: c.text },
    danger: { backgroundColor: c.stop },
    dangerText: { color: c.onStop },
    pressed: { opacity: 0.75 },
    disabled: { opacity: 0.45 },
    row: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
    rowText: { flex: 1, gap: 2 },
    rowTextWithValue: { flexGrow: 1, flexShrink: 0, flexBasis: '45%', gap: 2 },
    rowTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    rowValue: { fontSize: 16, color: c.muted, flexShrink: 1, textAlign: 'right' },
    label: { fontSize: 15, fontWeight: '700', color: c.muted },
    input: { minHeight: TOUCH, borderRadius: 12, borderWidth: 1.5, borderColor: c.line, paddingHorizontal: 14, fontSize: 18, color: c.text, backgroundColor: c.card },
    chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.tint, alignSelf: 'flex-start' },
    chipText: { fontSize: 14, fontWeight: '800', color: c.text },
    error: { fontSize: 16, fontWeight: '700', color: c.stop },
    segment: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    segItem: { minHeight: 44, borderRadius: 999, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card },
    segOn: { backgroundColor: c.accent, borderColor: c.accent },
    segText: { fontSize: 16, fontWeight: '700', color: c.text },
    segTextOn: { color: c.onAccent },
  });

export function useUi() {
  return useStyles(makeStyles);
}

/** A page with the brand header. `back` shows a Back button (full pages); the home screen has none. */
export function Screen({ title, back = true, children, right, testID }: { title: string; back?: boolean; children: ReactNode; right?: ReactNode; testID?: string }) {
  const s = useUi();
  const { brand, dark } = useBrand();
  const look = useLook();
  const paper = look === 'cookbook' && !dark;
  // A trail of screens in the log: the id of the screen, not what is on it.
  useEffect(() => {
    log.info('screen', testID ?? title);
  }, [testID, title]);
  return (
    <SafeAreaView style={[s.page, paper && { backgroundColor: PAPER.page }]} edges={['top', 'left', 'right']} testID={testID}>
      <View style={s.head}>
        {back ? (
          <Pressable onPress={() => {
              if (!runInnerBack()) router.canGoBack() ? router.back() : router.replace('/');
            }} style={s.headBack} accessibilityRole="button" accessibilityLabel="Back" testID="back">
            <Text style={s.headBackText}>‹ Back</Text>
          </Pressable>
        ) : brand.logo ? (
          <Image source={{ uri: brand.logo }} style={s.logo} resizeMode="contain" accessibilityLabel={`${brand.name} logo`} testID="brand-logo" />
        ) : null}
        <Text style={[s.headTitle, look === 'cookbook' && { fontFamily: SERIF }]} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ title, children, testID }: { title?: string; children: ReactNode; testID?: string }) {
  const s = useUi();
  const look = useLook();
  const { dark } = useBrand();
  const book = look === 'cookbook';
  return (
    <View style={[s.card, book && { borderStyle: 'dashed', borderWidth: 2, borderRadius: 6 }, book && !dark && { backgroundColor: PAPER.card, borderColor: PAPER.edge }]} testID={testID}>
      {title ? (
        <Text style={[s.cardTitle, book && { fontFamily: SERIF }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const s = useUi();
  return <Text style={muted ? s.muted : s.body}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const s = useUi();
  // What the person saw goes in the log too, so the log shows why a screen failed.
  const text = typeof children === 'string' ? children : Array.isArray(children) ? children.filter((c) => typeof c === 'string').join('') : '';
  useEffect(() => {
    if (text) log.warn('screen', `shown: ${text}`);
  }, [text]);
  return (
    <Text style={s.error} accessibilityRole="alert">
      {children}
    </Text>
  );
}

export function Button({ label, onPress, kind = 'main', disabled, busy, testID }: { label: string; onPress: () => void; kind?: 'main' | 'plain' | 'danger'; disabled?: boolean; busy?: boolean; testID?: string }) {
  const s = useUi();
  const { colors } = useBrand();
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      testID={testID}
      style={({ pressed }) => [s.button, kind === 'plain' && s.plain, kind === 'danger' && s.danger, pressed && s.pressed, off && s.disabled]}
    >
      {busy ? <ActivityIndicator color={kind === 'plain' ? colors.text : colors.onAccent} /> : <Text style={[s.buttonText, kind === 'plain' && s.plainText, kind === 'danger' && s.dangerText]}>{label}</Text>}
    </Pressable>
  );
}

/** A row with a title, optional detail under it, and a value or control on the right. */
export function Row({ title, detail, value, onPress, right, testID }: { title: string; detail?: string; value?: string; onPress?: () => void; right?: ReactNode; testID?: string }) {
  const s = useUi();
  const inner = (
    <>
      <View style={value !== undefined ? s.rowTextWithValue : s.rowText}>
        <Text style={s.rowTitle}>{title}</Text>
        {detail ? <Text style={s.muted}>{detail}</Text> : null}
      </View>
      {value !== undefined ? <Text style={s.rowValue}>{value}</Text> : null}
      {right}
      {onPress ? <Text style={s.rowValue}>›</Text> : null}
    </>
  );
  if (!onPress)
    return (
      <View style={s.row} testID={testID}>
        {inner}
      </View>
    );
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={title} testID={testID}>
      {inner}
    </Pressable>
  );
}

export function SwitchRow({ title, detail, value, onChange, disabled, testID }: { title: string; detail?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID?: string }) {
  const { colors } = useBrand();
  return (
    <Row
      title={title}
      detail={detail}
      right={<Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.accent, false: colors.line }} accessibilityLabel={title} testID={testID} />}
    />
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const s = useUi();
  const { colors } = useBrand();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} accessibilityLabel={label} {...props} />
    </View>
  );
}

export function Chip({ label, testID }: { label: string; testID?: string }) {
  const s = useUi();
  return (
    <View style={s.chip} testID={testID}>
      <Text style={s.chipText}>{label}</Text>
    </View>
  );
}

/** A row of choices, one picked. */
export function Segments<T extends string>({ options, value, onChange, testID }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  const s = useUi();
  return (
    <View style={s.segment} testID={testID} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} style={[s.segItem, on && s.segOn]} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.label} testID={testID ? `${testID}-${o.id}` : undefined}>
            <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A big button tile for standing-up work (market day): large text, easy to hit. */
export function BigTile({ label, detail, onPress, testID }: { label: string; detail?: string; onPress: () => void; testID?: string }) {
  const { colors } = useBrand();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => ({ flexBasis: '47%', flexGrow: 1, minHeight: 104, borderRadius: 16, padding: 14, justifyContent: 'space-between', backgroundColor: colors.accent, opacity: pressed ? 0.75 : 1 })}
    >
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.onAccent }}>{label}</Text>
      {detail ? <Text style={{ fontSize: 14, color: colors.onAccent }}>{detail}</Text> : null}
    </Pressable>
  );
}

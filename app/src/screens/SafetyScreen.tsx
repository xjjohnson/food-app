import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Row, Screen, Segments, SwitchRow } from '../components/ui';
import { DatePicker } from '../components/DatePicker';
import { loadSettings, Settings, settingChange } from '../lib/appSettings';
import { useInnerBack } from '../lib/innerBack';
import { nutritionKey, nutritionText, RULES_KEY, rulesList, toLine, fromLine } from '../lib/records';
import { askKind, keepForNext, LOG_KINDS, LogEntry, LogForm, LogKind, LogQuestion, LogValues, loadLogEntries, loadLogForm, loadLogSuggestions, logChange, logDefaults, logProblems, setupLog } from '../lib/surveyLog';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useRoles } from '../lib/useRoles';
import { useProductSearch } from './StockExtras';
import { TEXAS_RULES, TEXAS_RULES_DATE } from '../lib/texasRules';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SAVED = (queued: boolean) => (queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');

type Page = 'menu' | 'rules' | 'nutrition' | LogKind['id'];

/** Safety and records: kitchen checks, tasting, shelf-life, cottage-food rules, nutrition notes. */
export function SafetyScreen() {
  const [page, setPage] = useState<Page>('menu');
  const back = () => setPage('menu');
  useInnerBack(page !== 'menu' ? back : null);
  if (page === 'rules') return <RulesPage onBack={back} />;
  if (page === 'nutrition') return <NutritionPage onBack={back} />;
  const kind = LOG_KINDS.find((k) => k.id === page);
  if (kind) return <LogPage kind={kind} onBack={back} />;
  return (
    <Screen title="Safety and records" testID="safety-screen">
      {LOG_KINDS.map((k) => (
        <Row key={k.id} title={k.title} detail={k.detail} onPress={() => setPage(k.id)} testID={`safety-${k.id}`} />
      ))}
      <Row title="Cottage-food rules" detail="Your own rules, to read before selling" onPress={() => setPage('rules')} testID="safety-rules" />
      <Row title="Nutrition notes" detail="Typed notes for each product" onPress={() => setPage('nutrition')} testID="safety-nutrition" />
    </Screen>
  );
}

function LogPage({ kind, onBack }: { kind: LogKind; onBack: () => void }) {
  const { client, db, offline } = useOdoo();
  const { save } = useQueue();
  const { roles } = useRoles();
  const [form, setForm] = useState<LogForm | null>(null);
  const [missing, setMissing] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [values, setValues] = useState<LogValues>({});
  const [who, setWho] = useState('');
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [started, setStarted] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `logform/v1/${db}/${kind.id}`;

  const load = useCallback(async () => {
    if (!db) return;
    if (client && !offline) {
      try {
        const f = await loadLogForm(client, kind.title);
        setMissing(!f);
        setForm(f);
        if (f) {
          await AsyncStorage.setItem(cacheKey, JSON.stringify(f));
          setEntries(await loadLogEntries(client, f));
        }
        return;
      } catch (e) {
        setError(`Couldn’t read ${kind.title} from Odoo. Is the Surveys app switched on in Odoo? ${why(e)}`);
      }
    }
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) setForm(JSON.parse(raw) as LogForm);
    } catch {
      // No copy.
    }
  }, [client, db, offline, kind.title, cacheKey]);

  useEffect(() => {
    load();
  }, [load]);

  // The person signed in, for "Who tasted it".
  useEffect(() => {
    if (!client || offline) return;
    (client.call('res.users', 'read', [[client.session.uid]], { fields: ['name'] }) as Promise<{ name?: string }[]>).then((r) => setWho(String(r[0]?.name ?? ''))).catch(() => undefined);
  }, [client, offline]);

  // Names to pick from, for product and batch questions.
  useEffect(() => {
    if (!client || offline || !form) return;
    for (const q of form.questions) {
      const k = askKind(q);
      if (k === 'product' || k === 'batch') loadLogSuggestions(client, k).then((l) => setPicks((p) => ({ ...p, [k]: l }))).catch(() => undefined);
    }
  }, [client, offline, form]);

  // A fresh entry starts with today's date, who is signed in, and Good on each Good / Off choice.
  useEffect(() => {
    if (!form || started) return;
    setValues(logDefaults(form, today, who));
    setStarted(true);
  }, [form, started, today, who]);
  // The name can arrive after the form: fill "Who" in if it is still empty.
  useEffect(() => {
    if (!form || !who) return;
    setValues((v) => {
      const next = { ...v };
      for (const q of form.questions) if (askKind(q) === 'who' && !next[q.id]) next[q.id] = who;
      return next;
    });
  }, [form, who]);

  const problems = form ? logProblems(form, values) : [];
  const set = (q: LogQuestion, v: string) => setValues({ ...values, [q.id]: v });

  return (
    <Screen title={kind.title} testID={`log-${kind.id}`}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {missing ? (
        <Card title="Not set up yet">
          <Body>{`There is no survey called ${kind.title} in Odoo yet.`}</Body>
          {roles.owner && !offline ? (
            <Button
              label={`Make the ${kind.title} survey in Odoo`}
              testID="log-setup"
              onPress={async () => {
                if (!client) return;
                try {
                  await setupLog(client, kind);
                  setError('');
                  await load();
                } catch (e) {
                  setError(`Couldn’t make it. Switch on the Surveys app in Odoo first. ${why(e)}`);
                }
              }}
            />
          ) : (
            <Body muted>Ask the owner to open this page and make it.</Body>
          )}
        </Card>
      ) : null}
      {form ? (
        <Card title="New entry">
          {form.questions.map((q) => {
            const k = askKind(q);
            if (k === 'choice')
              return (
                <View key={q.id} style={{ gap: 6 }}>
                  <Body>{q.title}</Body>
                  <Segments options={q.choices.map((c) => ({ id: String(c.id), label: c.value }))} value={values[q.id] ?? ''} onChange={(v) => set(q, v)} testID={`log-q${q.id}`} />
                </View>
              );
            if (k === 'date') return <DatePicker key={q.id} label={q.title} value={values[q.id] ?? ''} onChange={(v) => set(q, v)} testID={`log-q${q.id}`} />;
            if (k === 'score')
              return (
                <View key={q.id} style={{ gap: 6 }}>
                  <Body>{q.title}</Body>
                  <Segments options={[1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: '★'.repeat(n) }))} value={values[q.id] ?? ''} onChange={(v) => set(q, v)} testID={`log-q${q.id}`} />
                </View>
              );
            const typed = (values[q.id] ?? '').trim().toLowerCase();
            const options = k === 'product' || k === 'batch' ? (picks[k] ?? []).filter((n) => !typed || (n.toLowerCase().includes(typed) && n.toLowerCase() !== typed)).slice(0, 6) : [];
            return (
              <View key={q.id} style={{ gap: 6 }}>
                <Field label={q.title} value={values[q.id] ?? ''} onChangeText={(v) => set(q, v)} keyboardType={k === 'number' ? 'decimal-pad' : 'default'} multiline={k === 'text'} testID={`log-q${q.id}`} />
                {options.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {options.map((n) => (
                      <Button key={n} label={n} kind="plain" onPress={() => set(q, n)} testID={`log-q${q.id}-pick-${n}`} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
          {values && Object.values(values).some((x) => x) ? problems.map((p) => <ErrorText key={p}>{p}</ErrorText>) : null}
          {note ? <Body>{note}</Body> : null}
          <Button
            label="Save entry (the next one keeps who and the day)"
            disabled={problems.length > 0}
            testID="log-save"
            onPress={async () => {
              setError('');
              try {
                const r = await save(logChange(form, values));
                setNote(SAVED(r.status === 'queued'));
                setValues(keepForNext(form, values, today, who));
                await load();
              } catch (e) {
                setError(`Odoo would not take that. ${why(e)}`);
              }
            }}
          />
        </Card>
      ) : null}
      {entries.length ? (
        <Card title="Latest entries">
          {entries.map((e) => (
            <Row key={e.id} title={`${e.when}${e.by ? ` · ${e.by}` : ''}`} detail={e.answers.map((a) => `${a.question}: ${a.value}`).join('\n')} testID={`log-entry-${e.id}`} />
          ))}
        </Card>
      ) : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function RulesPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const { roles } = useRoles();
  const [settings, setSettings] = useState<Settings>({});
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (client && !offline) loadSettings(client).then(setSettings);
  }, [client, offline]);

  const rules = rulesList(settings);
  return (
    <Screen title="Cottage-food rules" testID="rules-screen">
      <Body muted>These are your own rules, saved by the owner (the Texas list is a starting point). The app does not know the law; check your state’s rules yourself at dshs.texas.gov.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!editing ? (
        <Card title="Read before selling">
          {rules.length ? rules.map((r, i) => <SwitchRow key={i} title={r} value={!!ticked[i]} onChange={(v) => setTicked({ ...ticked, [i]: v })} testID={`rule-${i}`} />) : <Body muted>{roles.owner ? 'No rules yet. Tap Change the rules, then Fill in the Texas rules.' : 'No rules yet. Ask the owner to add them.'}</Body>}
          {rules.length && rules.every((_, i) => ticked[i]) ? <Body>All read. Good to sell.</Body> : null}
        </Card>
      ) : (
        <Card title="Your rules (one per line)">
          <Button label="Fill in the Texas rules" kind="plain" onPress={() => setText(TEXAS_RULES.join('\n'))} testID="rules-texas" />
          <Body muted>{`Texas rules from the state health department's page, read on ${TEXAS_RULES_DATE}. Read them, change anything that is wrong for you, then save.`}</Body>
          <Field label="Rules" value={text} onChangeText={setText} multiline testID="rules-text" />
          {note ? <Body>{note}</Body> : null}
          <Button
            label="Save rules"
            testID="rules-save"
            onPress={async () => {
              try {
                const r = await save(settingChange(RULES_KEY, toLine(text)));
                setNote(SAVED(r.status === 'queued'));
                setSettings({ ...settings, [RULES_KEY]: toLine(text) });
                setEditing(false);
              } catch (e) {
                setError(`Odoo would not take that. ${why(e)}`);
              }
            }}
          />
        </Card>
      )}
      {roles.owner && !editing ? <Button label="Change the rules" kind="plain" onPress={() => { setText(fromLine(settings[RULES_KEY])); setEditing(true); }} testID="rules-edit" /> : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

function NutritionPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [product, setProduct] = useState<{ id: number; name: string } | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const search = useProductSearch(!product);
  useInnerBack(product ? () => setProduct(null) : null);

  if (!product)
    return (
      <Screen title="Nutrition notes" testID="nutrition-screen">
        <Body muted>Type the nutrition facts for a product as notes. The app never calculates them.</Body>
        {offline ? <Body muted>No signal. Pick the product when the phone is back online.</Body> : <Field label="Find a product" value={search.text} onChangeText={search.setText} testID="nutrition-search" />}
        {search.found.map((p) => (
          <Row
            key={p.id}
            title={p.name}
            testID={`nutrition-product-${p.id}`}
            onPress={async () => {
              setProduct(p);
              setNote('');
              setText(client ? nutritionText(await loadSettings(client), p.id) : '');
            }}
          />
        ))}
        <Button label="Back" kind="plain" onPress={onBack} />
      </Screen>
    );
  return (
    <Screen title={product.name} testID="nutrition-form">
      <Field label="Nutrition notes" value={text} onChangeText={setText} multiline testID="nutrition-text" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button
        label="Save notes"
        testID="nutrition-save"
        onPress={async () => {
          try {
            const r = await save(settingChange(nutritionKey(product.id), toLine(text)));
            setNote(SAVED(r.status === 'queued'));
          } catch (e) {
            setError(`Odoo would not take that. ${why(e)}`);
          }
        }}
      />
      <Button label="Back" kind="plain" onPress={() => setProduct(null)} />
    </Screen>
  );
}

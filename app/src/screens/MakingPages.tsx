import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen, Segments } from '../components/ui';
import { loadSettings } from '../lib/appSettings';
import { useInnerBack } from '../lib/innerBack';
import { bringKey, EVENT_SECTIONS, EventRow, loadEvents, loadTests, loadWeek, moveBatchChange, resultsKey, saveTestChange, testBatchChange, testKey, TestBatch, versionChanges, weekDays, WeekBatch } from '../lib/making';
import { fmtQty, loadRecipes, Recipe as RecipeRow } from '../lib/production';
import { fromLine, toLine } from '../lib/records';
import { loadRecipe } from '../lib/recipe';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useRoles } from '../lib/useRoles';
import { GenericForm } from './GenericForm';
import { useTyped } from './MarketDay';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SAVED = (queued: boolean) => (queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
const dayName = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** Planned batches for the next seven days. Tap one to move it to another day. */
export function WeekPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [batches, setBatches] = useState<WeekBatch[] | null>(null);
  const [moving, setMoving] = useState<WeekBatch | null>(null);
  const [error, setError] = useState('');
  const days = weekDays();
  useInnerBack(moving ? () => setMoving(null) : null);
  const load = useCallback(async () => {
    if (!client || offline) return;
    try {
      setBatches(await loadWeek(client));
    } catch (e) {
      setError(`Couldn’t read the week from Odoo. ${why(e)}`);
    }
  }, [client, offline]);
  useEffect(() => {
    load();
  }, [load]);

  const move = async (to: string) => {
    if (!moving) return;
    setError('');
    try {
      await save(moveBatchChange(moving, to));
      setBatches((l) => (l ? l.map((b) => (b.id === moving.id ? { ...b, day: to } : b)) : l));
      setMoving(null);
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };

  if (moving)
    return (
      <Screen title={`Move ${moving.product}`} testID="week-move">
        {days.map((d) => (
          <Row key={d} title={dayName(d)} value={d === moving.day ? 'Now' : ''} onPress={() => move(d)} testID={`move-to-${d}`} />
        ))}
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Cancel" kind="plain" onPress={() => setMoving(null)} />
      </Screen>
    );
  return (
    <Screen title="This week" testID="week-screen">
      {offline ? <Body muted>No signal. The week comes from Odoo.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {days.map((d) => {
        const list = (batches ?? []).filter((b) => b.day === d);
        return (
          <Card key={d} title={dayName(d)}>
            {!list.length ? <Body muted>Nothing planned.</Body> : null}
            {list.map((b) => (
              <Row key={b.id} title={`${fmtQty(b.qty)} ${b.product}`} detail={`${b.name} · ${b.state === 'draft' ? 'planned' : 'started'}`} onPress={() => setMoving(b)} testID={`week-batch-${b.id}`} />
            ))}
          </Card>
        );
      })}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/** Recipe tests: make a small test batch, score it, then keep (new version) or drop. Owner only. */
export function TestsPage({ onBack }: { onBack: () => void }) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const { roles } = useRoles();
  const [tests, setTests] = useState<TestBatch[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [open, setOpen] = useState<TestBatch | 'new' | null>(null);
  const [error, setError] = useState('');
  useInnerBack(open ? () => setOpen(null) : null);
  const load = useCallback(async () => {
    if (!client || offline) return;
    try {
      setTests(loadTests(await loadSettings(client)));
      setRecipes(await loadRecipes(client));
    } catch (e) {
      setError(`Couldn’t read the tests. ${why(e)}`);
    }
  }, [client, offline]);
  useEffect(() => {
    load();
  }, [load]);
  if (!roles.owner)
    return (
      <Screen title="Recipe tests">
        <Body>Only the owner can open this.</Body>
      </Screen>
    );
  if (open) return <TestForm start={open === 'new' ? null : open} recipes={recipes} onBack={() => { setOpen(null); load(); }} />;
  return (
    <Screen title="Recipe tests" testID="tests-screen">
      <Button label="New test batch" onPress={() => setOpen('new')} disabled={offline} testID="new-test" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!tests.length ? <Body muted>No tests yet.</Body> : null}
      {tests.map((t) => (
        <Row key={t.key} title={`${t.recipe}: ${t.change || 'no change noted'}`} detail={`Taste ${t.taste}, texture ${t.texture}, set ${t.set}${t.verdict ? ` · ${t.verdict === 'keep' ? 'Kept' : 'Dropped'}` : ''}`} onPress={() => setOpen(t)} testID={`test-${t.key}`} />
      ))}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

const Stars = ({ label, value, onChange, id }: { label: string; value: number; onChange: (n: number) => void; id: string }) => (
  <>
    <Body>{label}</Body>
    <Segments<string> options={[1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) }))} value={String(value || '')} onChange={(v) => onChange(Number(v))} testID={id} />
  </>
);

function TestForm({ start, recipes, onBack }: { start: TestBatch | null; recipes: RecipeRow[]; onBack: () => void }) {
  const { save } = useQueue();
  const [t, setT] = useState<TestBatch>(start ?? { key: testKey(Date.now().toString(36)), recipeId: 0, recipe: '', change: '', qty: 1, taste: 0, texture: 0, set: 0, notes: '', verdict: '' });
  const [qtyText, setQtyText] = useState(String(t.qty));
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [versioning, setVersioning] = useState(false);
  const set = (p: Partial<TestBatch>) => setT((x) => ({ ...x, ...p }));
  const row = recipes.find((r) => r.id === t.recipeId);

  const go = async (patch: Partial<TestBatch> = {}) => {
    setError('');
    const next = { ...t, ...patch, qty: Number(qtyText.replace(',', '.')) || 0 };
    if (!next.recipeId) return setError('Pick a recipe.');
    if (next.qty <= 0) return setError('Type how many to make.');
    try {
      let queued = false;
      if (!start) {
        const r = recipes.find((x) => x.id === next.recipeId)!;
        if ((await save(testBatchChange({ id: r.id, productId: r.productId, name: r.name }, next.qty, next.key.slice(5)))).status === 'queued') queued = true;
      }
      if ((await save(saveTestChange(next))).status === 'queued') queued = true;
      setT(next);
      setMsg(SAVED(queued));
      return next;
    } catch (e) {
      setError(`Odoo said no: ${why(e)}`);
      return null;
    }
  };

  if (versioning && row)
    return <VersionBox recipe={{ id: row.id, name: row.name }} reason={t.change} onBack={() => setVersioning(false)} onDone={onBack} />;

  return (
    <Screen title="Test batch" testID="test-form">
      {!start ? (
        <Card title="Which recipe">
          {recipes.map((r) => (
            <Row key={r.id} title={r.name} value={t.recipeId === r.id ? 'Chosen' : ''} onPress={() => set({ recipeId: r.id, recipe: r.name })} testID={`test-recipe-${r.id}`} />
          ))}
        </Card>
      ) : (
        <Body>{t.recipe}</Body>
      )}
      <Field label="What did you change?" value={t.change} onChangeText={(v) => set({ change: v })} testID="test-change" />
      {!start ? <Field label="How many to make" value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" testID="test-qty" /> : null}
      <Stars label="Taste" value={t.taste} onChange={(n) => set({ taste: n })} id="test-taste" />
      <Stars label="Texture" value={t.texture} onChange={(n) => set({ texture: n })} id="test-texture" />
      <Stars label="Set" value={t.set} onChange={(n) => set({ set: n })} id="test-set" />
      <Field label="Notes" value={t.notes} onChangeText={(v) => set({ notes: v })} multiline testID="test-notes" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {msg ? <Body>{msg}</Body> : null}
      <Button label="Save" onPress={() => go()} testID="test-save" />
      {start && t.verdict === '' ? (
        <>
          <Button label="Keep: make it a new recipe version" onPress={async () => { if (await go({ verdict: 'keep' })) setVersioning(true); }} testID="test-keep" />
          <Button label="Drop it" kind="danger" onPress={async () => { if (await go({ verdict: 'drop' })) setTimeout(onBack, 600); }} testID="test-drop" />
        </>
      ) : null}
      {start && t.verdict === 'keep' ? <Button label="Make it a new recipe version" onPress={() => setVersioning(true)} testID="test-version" /> : null}
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/** Save as new version: the old recipe is kept, archived, with a note of why. Owner only; the person taps it. */
export function VersionBox({ recipe, reason: first = '', onBack, onDone }: { recipe: { id: number; name: string }; reason?: string; onBack: () => void; onDone: () => void }) {
  const { client } = useOdoo();
  const { save } = useQueue();
  const [code, setCode] = useState<string | null>(null);
  const [reason, setReason] = useState(first);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (client) loadRecipe(client, recipe.id).then((r) => setCode(r?.code ?? '')).catch(() => setCode(''));
  }, [client, recipe.id]);
  const go = async () => {
    setError('');
    if (code === null) return setError('Reading the recipe. Try again in a moment.');
    try {
      let queued = false;
      for (const ch of versionChanges({ ...recipe, code }, reason)) if ((await save(ch)).status === 'queued') queued = true;
      setMsg(SAVED(queued));
      setTimeout(onDone, 900);
    } catch (e) {
      setError(`Odoo said no: ${why(e)}`);
    }
  };
  return (
    <Screen title="New recipe version" testID="version-box">
      <Body>{`This copies ${recipe.name} as a new version and archives the old one. Batches already started keep what they had.`}</Body>
      <Field label="Why the change" value={reason} onChangeText={setReason} multiline testID="version-reason" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {msg ? <Body>{msg}</Body> : null}
      <Button label="Save as new version" onPress={go} testID="version-save" />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

/** Events and booths (the Events app). Owner only. */
export function EventsScreen() {
  const { client, offline } = useOdoo();
  const { roles } = useRoles();
  const [list, setList] = useState<EventRow[] | null>(null);
  const [page, setPage] = useState<{ p: 'list' } | { p: 'form'; id?: number } | { p: 'notes'; id: number; name: string }>({ p: 'list' });
  const [error, setError] = useState('');
  useInnerBack(page.p === 'list' ? null : page.p === 'notes' ? () => setPage({ p: 'form', id: page.id }) : () => setPage({ p: 'list' }));
  const load = useCallback(async () => {
    if (!client || offline) return;
    try {
      setList(await loadEvents(client));
    } catch (e) {
      setError(`Couldn’t read events. Is the Events app installed in Odoo? ${why(e)}`);
    }
  }, [client, offline]);
  useEffect(() => {
    load();
  }, [load, page.p]);
  if (!roles.owner)
    return (
      <Screen title="Events and booths">
        <Body>Only the owner can open this.</Body>
      </Screen>
    );
  if (page.p === 'notes') return <EventNotes id={page.id} name={page.name} onBack={() => setPage({ p: 'form', id: page.id })} />;
  if (page.p === 'form') {
    const id = page.id;
    return (
      <GenericForm
        model="event.event"
        recordId={id ?? null}
        title="Event or booth"
        noun="Event"
        sections={EVENT_SECTIONS}
        required={['name']}
        testID="event-form"
        onBack={() => setPage({ p: 'list' })}
        extraTabs={id ? [{ id: 'notes', label: 'Bring-list and results', render: () => <Button label="Open bring-list and results" onPress={() => setPage({ p: 'notes', id, name: list?.find((e) => e.id === id)?.name ?? 'Event' })} testID="event-notes" /> }] : undefined}
      />
    );
  }
  return (
    <Screen title="Events and booths" testID="events-screen">
      <Button label="New event or booth" onPress={() => setPage({ p: 'form' })} testID="new-event" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {list && !list.length ? <Body muted>No events yet.</Body> : null}
      {(list ?? []).map((e) => (
        <Row key={e.id} title={e.name} detail={[e.start, e.place].filter(Boolean).join(' · ')} onPress={() => setPage({ p: 'form', id: e.id })} testID={`event-${e.id}`} />
      ))}
    </Screen>
  );
}

function EventNotes({ id, name, onBack }: { id: number; name: string; onBack: () => void }) {
  const bring = useTyped(bringKey(id));
  const res = useTyped(resultsKey(id));
  const [b, setB] = useState<string | null>(null);
  const [r, setR] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const bv = b ?? fromLine(bring.value);
  const rv = r ?? fromLine(res.value);
  return (
    <Screen title={name} testID="event-notes-screen">
      <Field label="Bring-list (one per line)" value={bv} onChangeText={setB} multiline testID="event-bring" />
      <Field label="Results (sales, what went well)" value={rv} onChangeText={setR} multiline testID="event-results" />
      <Button
        label="Save"
        testID="event-notes-save"
        onPress={async () => {
          const a = await bring.put(toLine(bv));
          const z = await res.put(toLine(rv));
          setMsg(SAVED(a.status === 'queued' || z.status === 'queued'));
        }}
      />
      {msg ? <Body>{msg}</Body> : null}
      <Body muted>Pay the booth fee as a vendor bill on the Money page.</Body>
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

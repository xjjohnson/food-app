import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Row, Screen } from '../components/ui';
import { Assignee, findLink, loadAssignees, loadFallbackId, loadHistory, loadTasks, doneChange, taskChange, taskProblems, HistoryLine, Task } from '../lib/activities';
import { SPECIAL_KINDS, specialDateChange } from '../lib/activities';
import { validDay } from '../lib/season';
import { useInnerBack } from '../lib/innerBack';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useRoles } from '../lib/useRoles';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Tasks: the owner gives them out, each person ticks theirs done. They are Odoo activities. */
export function TasksScreen() {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const { roles } = useRoles();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  useInnerBack(adding ? () => setAdding(false) : null);

  const load = useCallback(async () => {
    if (!client || offline) return;
    try {
      setTasks(await loadTasks(client, roles.owner));
    } catch (e) {
      setError(`Couldn’t read tasks from Odoo. ${why(e)}`);
    }
  }, [client, offline, roles.owner]);
  useEffect(() => {
    load();
  }, [load]);

  if (adding) return <NewTask onBack={() => { setAdding(false); load(); }} />;

  const done = async (t: Task) => {
    setError('');
    try {
      await save(doneChange(t));
      setTasks((l) => (l ? l.filter((x) => x.id !== t.id) : l));
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };

  return (
    <Screen title="Tasks" testID="tasks-screen">
      {roles.owner ? <Button label="New task" onPress={() => setAdding(true)} testID="new-task" /> : null}
      {offline ? <Body muted>No signal. Tasks come from Odoo.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {tasks && !tasks.length ? <Body>Nothing to do. Nice.</Body> : null}
      {(tasks ?? []).map((t) => (
        <Card key={t.id} testID={`task-${t.id}`}>
          <Row title={t.title} detail={[t.due ? `Due ${t.due}${t.overdue ? ' (late)' : ''}` : '', roles.owner ? t.who : '', t.note].filter(Boolean).join(' · ')} />
          <Button label="Done" onPress={() => done(t)} testID={`task-done-${t.id}`} />
        </Card>
      ))}
    </Screen>
  );
}

function NewTask({ onBack }: { onBack: () => void }) {
  const { client } = useOdoo();
  const { save } = useQueue();
  const [people, setPeople] = useState<Assignee[]>([]);
  const [who, setWho] = useState(0);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(new Date().toISOString().slice(0, 10));
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => {
    if (client) loadAssignees(client).then(setPeople).catch(() => undefined);
  }, [client]);

  const go = async () => {
    if (!client) return;
    setError('');
    const probs = taskProblems({ title, due });
    if (probs.length) return setError(probs.join(' '));
    try {
      const found = link.trim() ? await findLink(client, link) : null;
      if (link.trim() && !found) return setError('No batch or order has that name. Clear it, or type the name exactly.');
      const fallbackId = await loadFallbackId(client);
      if (!found && !fallbackId) return setError('Set up the Food app settings first (Management).');
      const r = await save(taskChange({ title, due, userId: who, note, link: found, fallbackId }, client.session.uid));
      setSaved(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
      setTimeout(onBack, 800);
    } catch (e) {
      setError(`Odoo said no: ${why(e)}`);
    }
  };

  return (
    <Screen title="New task" testID="new-task-screen">
      <Field label="What needs doing" value={title} onChangeText={setTitle} testID="task-title" />
      <Field label="Due date (2026-12-05)" value={due} onChangeText={setDue} testID="task-due" />
      <Card title="Who">
        <Row title="Me" value={who === 0 ? 'Chosen' : ''} onPress={() => setWho(0)} testID="task-who-0" />
        {people.map((p) => (
          <Row key={p.userId} title={p.name} value={who === p.userId ? 'Chosen' : ''} onPress={() => setWho(p.userId)} testID={`task-who-${p.userId}`} />
        ))}
        <Body muted>Only people with an Odoo login are listed. A task for anyone else goes to you.</Body>
      </Card>
      <Field label="Batch or order name (optional)" value={link} onChangeText={setLink} testID="task-link" />
      <Field label="Notes (optional)" value={note} onChangeText={setNote} multiline testID="task-note" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {saved ? <Body>{saved}</Body> : null}
      <Button label="Save task" onPress={go} testID="save-task" />
    </Screen>
  );
}

/** Who changed what and when, for a record page. */
export function HistoryCard({ model, id }: { model: string; id: number }) {
  const { client, offline } = useOdoo();
  const [lines, setLines] = useState<HistoryLine[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    loadHistory(client, model, id).then(setLines).catch((e) => setError(`Couldn’t read the history. ${why(e)}`));
  }, [client, offline, model, id]);
  return (
    <Card title="Changes" testID="history-card">
      {offline ? <Body muted>No signal. The history comes from Odoo.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {lines && !lines.length ? <Body>Nothing recorded yet.</Body> : null}
      {(lines ?? []).map((l) => (
        <Row key={l.id} title={l.text} detail={[l.date.slice(0, 16), l.who].filter(Boolean).join(' · ')} />
      ))}
    </Card>
  );
}

/** Customer page: a birthday or order anniversary. It only reminds you; nothing is sent to the customer. */
export function SpecialDatesBox({ partnerId, name }: { partnerId: number; name: string }) {
  const { client } = useOdoo();
  const { save } = useQueue();
  const [kind, setKind] = useState<string>(SPECIAL_KINDS[0]);
  const [md, setMd] = useState('');
  const [msg, setMsg] = useState('');
  const go = async () => {
    setMsg('');
    if (!validDay(md)) return setMsg('Type the day like 09-15 (month, then day).');
    try {
      const r = await save(specialDateChange({ partnerId, name, kind, md: md.trim() }, client?.session.uid ?? 0));
      setMsg(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved. It will show on Today the week before.');
    } catch (e) {
      setMsg(`Odoo said no: ${why(e)}`);
    }
  };
  return (
    <Card title="Special dates" testID="special-dates">
      {SPECIAL_KINDS.map((k) => (
        <Row key={k} title={k} value={kind === k ? 'Chosen' : ''} onPress={() => setKind(k)} testID={`special-${k}`} />
      ))}
      <Field label="Day, month then day (09-15)" value={md} onChangeText={setMd} testID="special-day" />
      <Button label="Remind me" onPress={go} testID="special-save" />
      {msg ? <Body>{msg}</Body> : null}
      <Body muted>A reminder to you only. Nothing is texted or sent to the customer.</Body>
    </Card>
  );
}

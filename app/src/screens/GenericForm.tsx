import { useInnerBack } from '../lib/innerBack';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Body, Button, ErrorText, Screen, Segments } from '../components/ui';
import { allFields, blankValue, changedValues, formProblems, loadDraft, onlyPresent, presentFields, type Draft, type FieldDef, type Section, type Val } from '../lib/odooForm';
import type { NewChange } from '../lib/queue';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { FormFields, RelationPicker } from './FormFields';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface ExtraTab {
  id: string;
  label: string;
  render: () => ReactNode;
}

export interface GenericFormProps {
  /** The Odoo model, such as 'product.template'. */
  model: string;
  /** The record to change, or null to add one. */
  recordId: number | null;
  title: string;
  sections: Section[];
  /** Fields that must have a value. */
  required?: string[];
  /** The field that tells whether an add was already made (so it isn't made twice). */
  uniqueField?: string;
  /** Values a new record starts with. */
  defaults?: Draft;
  /** The words for the queue, such as "Product". */
  noun: string;
  /** Extra read-only tabs for a record that exists. */
  extraTabs?: ExtraTab[];
  /** Called after the first field loads, for the screen to learn the draft. */
  onBack: () => void;
  testID?: string;
}

/**
 * Any Odoo form: tabs of fields, one Save that sends only what changed, and
 * pickers for linked records. Fields this Odoo doesn't have are left out.
 */
export function GenericForm({ model, recordId, title, sections: all, required = [], uniqueField = 'name', defaults = {}, noun, extraTabs = [], onBack, testID }: GenericFormProps) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [sections, setSections] = useState<Section[]>([]);
  const [before, setBefore] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [tab, setTab] = useState(all[0]?.id ?? '');
  const [picking, setPicking] = useState<FieldDef | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useInnerBack(picking ? () => setPicking(null) : null);

  const blank = (secs: Section[]): Draft => {
    const d: Draft = {};
    for (const f of allFields(secs)) d[f.name] = blankValue(f);
    return { ...d, ...defaults };
  };

  useEffect(() => {
    if (!client || offline) return;
    (async () => {
      try {
        const have = await presentFields(client, model);
        const secs = onlyPresent(all, have);
        setSections(secs);
        if (recordId) {
          const d = await loadDraft(client, model, recordId, allFields(secs));
          setBefore(d);
          setDraft(d);
        } else {
          const b = blank(secs);
          setBefore(b);
          setDraft(b);
        }
      } catch (e) {
        setError(`Couldn’t read this from Odoo. ${why(e)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, offline, model, recordId]);

  // Offline, a new record still works with the first section.
  useEffect(() => {
    if (offline && !recordId && !before) {
      const first = all[0] ? [{ ...all[0], fields: all[0].fields.filter((f) => f.kind !== 'one' && f.kind !== 'many') }] : [];
      setSections(first);
      const b = blank(first);
      setBefore(b);
      setDraft(b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, recordId, before]);

  const defs = useMemo(() => allFields(sections), [sections]);
  const vals = before ? changedValues(defs, before, draft, !recordId) : {};
  const count = Object.keys(vals).length;
  const problems = formProblems(defs, draft, required);
  const ready = !!before && problems.length === 0 && (recordId ? count > 0 : count > 0) && !note;
  const setValue = (name: string, v: Val) => setDraft((d) => ({ ...d, [name]: v }));
  const label = String(draft[uniqueField] && typeof draft[uniqueField] === 'string' ? draft[uniqueField] : (draft[uniqueField] as { name?: string } | null)?.name ?? '').trim();

  if (picking) return <RelationPicker def={picking} selected={draft[picking.name]!} onChange={(v) => setValue(picking.name, v)} onBack={() => setPicking(null)} />;

  const section = sections.find((s) => s.id === tab);
  const extra = recordId ? extraTabs.find((t) => t.id === tab) : undefined;
  const tabs = [...sections.map((s) => ({ id: s.id, label: s.title })), ...(recordId ? extraTabs.map((t) => ({ id: t.id, label: t.label })) : [])];

  const doSave = async () => {
    setBusy(true);
    setError('');
    try {
      const uniq = vals[uniqueField];
      const change: NewChange = recordId
        ? { label: `${noun} ${label}`, model, method: 'write', args: [[recordId], vals] }
        : { label: `New ${noun.toLowerCase()}: ${label}`, model, method: 'create', args: [vals], ...(typeof uniq === 'string' ? { already: { model, domain: [[uniqueField, '=', uniq]] } } : {}) };
      const r = await save(change);
      setNote(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
      setTimeout(onBack, 1000);
    } catch (e) {
      setError(`Odoo said no: ${why(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={recordId ? label || title : `New ${noun.toLowerCase()}`} testID={testID ?? 'generic-form'}>
      {offline && !recordId ? <Body muted>No signal. You can save the basics now and they go to Odoo when signal is back.</Body> : null}
      {offline && recordId ? <Body muted>No signal. The details come from Odoo.</Body> : null}
      {tabs.length > 1 ? <Segments options={tabs} value={tab} onChange={setTab} testID="form-tabs" /> : null}
      {section ? <FormFields section={section} draft={draft} setValue={setValue} pick={setPicking} /> : null}
      {extra ? extra.render() : null}
      {problems.map((p) => (
        <ErrorText key={p}>{p}</ErrorText>
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Body>{note}</Body> : null}
      <Button label={recordId ? (count ? `Save ${count} change${count > 1 ? 's' : ''}` : 'Nothing changed') : `Save ${noun.toLowerCase()}`} disabled={!ready} busy={busy} testID="save-form" onPress={doSave} />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

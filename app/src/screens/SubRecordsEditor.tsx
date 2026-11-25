import { useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Screen } from '../components/ui';
import type { Draft, FieldDef, Val } from '../lib/odooForm';
import type { NewChange } from '../lib/queue';
import { blankRow, loadRows, rowChanges, rowProblems, rowTitle, type SubRow, type SubSpec } from '../lib/subRecords';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { FormFields, RelationPicker } from './FormFields';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Lines of a record, edited as a list with one Save. Needs signal to open,
 * because the lines come from Odoo; a Save without signal is kept and sent
 * later like any other change.
 */
export function SubRecordsEditor({ spec, domain, base, label, addLabel, canEdit = true, lockedNote, createVia, afterPick }: {
  spec: SubSpec;
  domain: unknown[];
  base: Record<string, unknown>;
  label: string;
  addLabel: string;
  canEdit?: boolean;
  lockedNote?: string;
  createVia?: (vals: Record<string, unknown>) => Pick<NewChange, 'model' | 'method' | 'args'>;
  /** After a product is picked: other values to fill in (its unit). */
  afterPick?: (client: NonNullable<ReturnType<typeof useOdoo>['client']>, field: FieldDef, value: Val) => Promise<Draft>;
}) {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [before, setBefore] = useState<SubRow[] | null>(null);
  const [rows, setRows] = useState<SubRow[]>([]);
  const [picking, setPicking] = useState<{ key: string; def: FieldDef } | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client || offline) return;
    loadRows(client, spec, domain)
      .then((r) => {
        setBefore(r);
        setRows(r);
      })
      .catch((e) => setError(`Couldn’t read the lines from Odoo. ${why(e)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, offline]);

  const setValue = (key: string, name: string, v: Val) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, draft: { ...r.draft, [name]: v } } : r)));
  const changes = before ? rowChanges(spec, before, rows, label, base, createVia) : [];
  const problems = rowProblems(spec, rows);

  if (picking) {
    const row = rows.find((r) => r.key === picking.key)!;
    return (
      <RelationPicker
        def={picking.def}
        selected={row.draft[picking.def.name]!}
        onChange={async (v) => {
          setValue(picking.key, picking.def.name, v);
          if (afterPick && client) {
            const more = await afterPick(client, picking.def, v).catch(() => ({}));
            setRows((rs) => rs.map((r) => (r.key === picking.key ? { ...r, draft: { ...r.draft, ...more } } : r)));
          }
        }}
        onBack={() => setPicking(null)}
      />
    );
  }

  if (offline) return <Body muted>No signal. The lines come from Odoo, so they show when the phone is back online.</Body>;
  return (
    <>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!canEdit && lockedNote ? <Body muted>{lockedNote}</Body> : null}
      {rows.map((r) => (
        <Card key={r.key} title={rowTitle(spec, r.draft) || `New ${spec.noun}`} testID={`sub-${r.id ?? r.key}`}>
          <FormFields section={{ id: r.key, title: '', fields: spec.columns.filter((c) => c.name in r.draft) }} draft={r.draft} setValue={(n, v) => setValue(r.key, n, v)} pick={(def) => setPicking({ key: r.key, def })} />
          {canEdit ? <Button label="Remove" kind="danger" onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} testID={`sub-remove-${r.id ?? r.key}`} /> : null}
        </Card>
      ))}
      {before && !rows.length ? <Body muted>None yet.</Body> : null}
      {canEdit ? <Button label={addLabel} kind="plain" onPress={() => setRows((rs) => [...rs, blankRow(spec)])} testID="sub-add" /> : null}
      {problems.map((p) => (
        <ErrorText key={p}>{p}</ErrorText>
      ))}
      {note ? <Body>{note}</Body> : null}
      {canEdit ? (
        <Button
          label={changes.length ? `Save ${changes.length} change${changes.length > 1 ? 's' : ''} to ${label.toLowerCase()}` : 'Nothing changed'}
          disabled={!before || !changes.length || problems.length > 0 || !!note}
          busy={busy}
          testID="sub-save"
          onPress={async () => {
            setBusy(true);
            setError('');
            try {
              let queued = false;
              for (const ch of changes) if ((await save(ch)).status === 'queued') queued = true;
              setNote(queued ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
              setTimeout(() => {
                setNote('');
                if (client) loadRows(client, spec, domain).then((r) => { setBefore(r); setRows(r); }).catch(() => undefined);
              }, 900);
            } catch (e) {
              setError(`Odoo said no: ${why(e)}`);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

/** After a product is picked, its own unit is the starting unit. */
export const unitAfterProduct = (unitField: string) => async (client: { call: (m: string, f: string, a: unknown[], k?: Record<string, unknown>) => Promise<unknown> }, field: FieldDef, value: Val): Promise<Draft> => {
  if (field.name !== 'product_id' || !value || Array.isArray(value) || typeof value !== 'object') return {};
  const [p] = (await client.call('product.product', 'read', [[(value as { id: number }).id]], { fields: ['uom_id'] })) as Record<string, unknown>[];
  const u = p?.uom_id;
  return Array.isArray(u) ? { [unitField]: { id: u[0] as number, name: String(u[1]) } } : {};
};

/** The editor on a screen of its own. */
export function LinesScreen({ title, onBack, ...props }: { title: string; onBack: () => void } & Parameters<typeof SubRecordsEditor>[0]) {
  return (
    <Screen title={title} testID="lines-screen">
      <SubRecordsEditor {...props} />
      <Button label="Back" kind="plain" onPress={onBack} />
    </Screen>
  );
}

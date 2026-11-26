import { useCallback, useEffect, useState } from 'react';
import { Body, Card, ErrorText, SwitchRow } from '../components/ui';
import { loadSteps, loadTicks, StepRow, tickChange } from '../lib/checklist';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The steps to tick on a batch. Each tick is a note on the batch in Odoo with who and when. */
export function ChecklistCard({ batchId, batchName }: { batchId: number; batchName: string }) {
  const { client, offline } = useOdoo();
  const { save, items } = useQueue();
  const [rows, setRows] = useState<StepRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!client || offline) return;
    try {
      setRows(await loadTicks(client, batchId, await loadSteps(client)));
    } catch (e) {
      setError(`Couldn’t read the checklist. ${why(e)}`);
    }
  }, [client, offline, batchId]);

  useEffect(() => {
    load();
  }, [load]);

  const waiting = new Set(items.filter((i) => i.step?.kind === 'note' && (i.step as { resId: number }).resId === batchId).map((i) => (i.step as { tag: string }).tag));

  const tick = async (r: StepRow) => {
    setError('');
    try {
      await save(tickChange(batchId, batchName, r.index, r.name));
      await load();
    } catch (e) {
      setError(`Odoo would not take that. ${why(e)}`);
    }
  };

  return (
    <Card title="Batch checklist" testID="batch-checklist">
      {offline && !rows ? <Body muted>No signal. The checklist shows when the phone is back online.</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows?.map((r) => {
        const pending = waiting.has(`food-app-step-${batchId}-${r.index}`);
        return <SwitchRow key={r.index} title={r.name} detail={r.done ? (r.by ? `Done by ${r.by}` : 'Done') : pending ? 'Saved on the phone' : undefined} value={r.done || pending} disabled={r.done || pending} onChange={() => tick(r)} testID={`step-${r.index}`} />;
      })}
    </Card>
  );
}

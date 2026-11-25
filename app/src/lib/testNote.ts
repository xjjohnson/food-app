/**
 * The Developer screen's "Send a test note": a note on the signed-in
 * person's own contact in Odoo, sent through the offline queue like any other
 * change. It proves the queue end to end without touching stock, orders or
 * batches. Only offered while the phone is on a database marked as a test copy.
 */
import type { NewChange } from './queue';

export function testNoteChange(partnerId: number, now = Date.now()): NewChange {
  const token = `food-app-test-${now.toString(36)}`;
  return {
    label: `Test note on your contact (${new Date(now).toLocaleTimeString()})`,
    model: 'res.partner',
    method: 'message_post',
    args: [[partnerId]],
    kwargs: { body: `Test note from the food app (${token}). Safe to delete.`, message_type: 'comment', subtype_xmlid: 'mail.mt_note' },
    already: { model: 'mail.message', domain: [['model', '=', 'res.partner'], ['res_id', '=', partnerId], ['body', 'ilike', token]] },
  };
}

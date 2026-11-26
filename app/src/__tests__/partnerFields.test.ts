import { loadBoard } from '../lib/deliveryBoard';
import { partnerFields } from '../lib/partnerFields';

/** An Odoo 19 stand-in: contacts have no Mobile field, and asking for it fails. */
function odoo19() {
  const asked: string[][] = [];
  const client = {
    call: async (model: string, method: string, args: unknown[], kw?: { fields?: string[] }) => {
      if (model === 'res.partner' && method === 'fields_get') return { phone: {}, street: {}, city: {}, zip: {}, comment: {}, street2: {} };
      if (model === 'res.partner' && method === 'read') {
        asked.push(kw?.fields ?? []);
        if ((kw?.fields ?? []).includes('mobile')) throw new Error("Invalid field 'mobile' on 'res.partner'");
        return [{ id: 7, phone: '555-0100', street: '1 Main St', city: 'Dallas', zip: '75001', comment: false, street2: false }];
      }
      if (model === 'stock.picking') return method === 'search_read' && (args[0] as unknown[][]).some((d) => d[0] === 'state' && d[1] === 'in') ? [{ id: 1, name: 'WH/OUT/1', origin: 'S00002', partner_id: [7, 'Dana'], state: 'assigned', scheduled_date: '2026-11-26 10:00:00', sale_id: [2, 'S00002'] }] : [];
      return [];
    },
  };
  return { client: client as never, asked };
}

test('contact reads only ask for fields this Odoo has, so the board works without Mobile', async () => {
  const { client, asked } = odoo19();
  expect(await partnerFields(client, ['phone', 'mobile', 'zip'])).toEqual(['phone', 'zip']);
  const board = await loadBoard(client, new Date('2026-11-26T12:00:00Z'));
  expect(board).toHaveLength(1);
  expect(board[0]).toMatchObject({ customer: 'Dana', phone: '555-0100', address: '1 Main St, Dallas, 75001' });
  expect(asked.every((f) => !f.includes('mobile'))).toBe(true);
});

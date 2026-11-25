/**
 * The fields of Odoo's other forms (contacts, batches, reorder rules,
 * purchase orders, production orders), kept short enough for a phone. A
 * field this Odoo doesn't have is skipped when the form opens. Dates are
 * typed as year-month-day.
 */
import type { Section } from './odooForm';

export const CONTACT_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Main',
    fields: [
      { name: 'name', label: 'Name', kind: 'text' },
      { name: 'is_company', label: 'This is a company', kind: 'bool' },
      { name: 'parent_id', label: 'Company', kind: 'one', relation: 'res.partner' },
      { name: 'function', label: 'Job position', kind: 'text' },
      { name: 'phone', label: 'Phone', kind: 'text' },
      { name: 'mobile', label: 'Mobile', kind: 'text' },
      { name: 'email', label: 'Email', kind: 'text' },
      { name: 'website', label: 'Website', kind: 'text' },
      { name: 'vat', label: 'Tax ID', kind: 'text' },
      { name: 'category_id', label: 'Tags', kind: 'many', relation: 'res.partner.category' },
      { name: 'comment', label: 'Notes', kind: 'html' },
    ],
  },
  {
    id: 'address',
    title: 'Address',
    fields: [
      { name: 'street', label: 'Street', kind: 'text' },
      { name: 'street2', label: 'Street 2', kind: 'text' },
      { name: 'city', label: 'City', kind: 'text' },
      { name: 'state_id', label: 'State', kind: 'one', relation: 'res.country.state' },
      { name: 'zip', label: 'Zip', kind: 'text' },
      { name: 'country_id', label: 'Country', kind: 'one', relation: 'res.country' },
    ],
  },
  {
    id: 'terms',
    title: 'Sales and buying',
    fields: [
      { name: 'user_id', label: 'Salesperson', kind: 'one', relation: 'res.users' },
      { name: 'property_payment_term_id', label: 'Customer payment terms', kind: 'one', relation: 'account.payment.term' },
      { name: 'property_product_pricelist', label: 'Price list', kind: 'one', relation: 'product.pricelist', hint: 'Picked from Odoo. The app never works out prices.' },
      { name: 'property_supplier_payment_term_id', label: 'Vendor payment terms', kind: 'one', relation: 'account.payment.term' },
      { name: 'ref', label: 'Reference', kind: 'text' },
    ],
  },
];

export const LOT_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Batch',
    fields: [
      { name: 'name', label: 'Batch number', kind: 'text' },
      { name: 'product_id', label: 'Product', kind: 'one', relation: 'product.product', createOnly: true },
      { name: 'ref', label: 'Internal reference', kind: 'text' },
      { name: 'expiration_date', label: 'Expiration date (year-month-day)', kind: 'date' },
      { name: 'use_date', label: 'Best before (year-month-day)', kind: 'date' },
      { name: 'removal_date', label: 'Take off the shelf (year-month-day)', kind: 'date' },
      { name: 'alert_date', label: 'Alert date (year-month-day)', kind: 'date' },
      { name: 'note', label: 'Notes', kind: 'html' },
    ],
  },
];

export const REORDER_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Rule',
    fields: [
      { name: 'product_min_qty', label: 'Low at', kind: 'num' },
      { name: 'product_max_qty', label: 'Order up to', kind: 'num' },
      { name: 'qty_multiple', label: 'Order in multiples of', kind: 'num' },
      { name: 'trigger', label: 'Trigger', kind: 'select', options: [{ id: 'auto', label: 'Automatic' }, { id: 'manual', label: 'Manual' }] },
      { name: 'route_id', label: 'Route', kind: 'one', relation: 'stock.route' },
      { name: 'warehouse_id', label: 'Warehouse', kind: 'one', relation: 'stock.warehouse' },
      { name: 'location_id', label: 'Location', kind: 'one', relation: 'stock.location' },
    ],
  },
];

export const PURCHASE_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Order',
    fields: [
      { name: 'partner_id', label: 'Vendor', kind: 'one', relation: 'res.partner', createOnly: true },
      { name: 'partner_ref', label: 'Vendor reference', kind: 'text' },
      { name: 'date_order', label: 'Order date (year-month-day)', kind: 'date' },
      { name: 'date_planned', label: 'Expected arrival (year-month-day)', kind: 'date' },
      { name: 'user_id', label: 'Buyer', kind: 'one', relation: 'res.users' },
      { name: 'origin', label: 'Source', kind: 'text' },
      { name: 'notes', label: 'Notes', kind: 'html' },
    ],
  },
];

export const PRODUCTION_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Batch',
    fields: [
      { name: 'product_qty', label: 'Quantity to make', kind: 'num' },
      { name: 'date_start', label: 'Start date (year-month-day)', kind: 'date' },
      { name: 'user_id', label: 'Responsible', kind: 'one', relation: 'res.users' },
      { name: 'origin', label: 'Source', kind: 'text' },
    ],
  },
];

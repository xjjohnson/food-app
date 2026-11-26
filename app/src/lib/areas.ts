/**
 * The work areas on the home screen, and which role sees each. The screens
 * behind them arrive one feature at a time (plans/app-plan.md, "How we'll
 * build it"); until then each opens a page that says what is coming.
 */
import type { RoleId } from './roles';

export interface Area {
  id: string;
  title: string;
  detail: string;
  /** Who sees it. The owner sees every area. */
  role: RoleId;
  /** Which planned step builds it. */
  comingIn: string;
}

export const AREAS: Area[] = [
  { id: 'production', title: 'Production', detail: "Today's batches, start a batch, batch numbers and use-by dates", role: 'production', comingIn: 'Step 2, Production' },
  { id: 'orders', title: 'Website orders', detail: 'Pack orders, oldest batch first, delivered or picked up', role: 'shipping', comingIn: 'Step 3, Website orders' },
  { id: 'stock', title: 'Stock', detail: 'Counts, expiring soon, find a batch', role: 'inventory', comingIn: 'Step 4, Stock' },
  { id: 'ingredients', title: 'Ingredients', detail: 'Low stock, purchase orders, checking deliveries in', role: 'inventory', comingIn: 'Step 5, Ingredients' },
  { id: 'invoices', title: 'Invoices', detail: 'Who owes you, who has paid', role: 'sales', comingIn: 'Release A, Invoices' },
  { id: 'safety', title: 'Safety and records', detail: 'Kitchen checks, tasting log, shelf-life checks, cottage-food rules', role: 'production', comingIn: 'Release F, Safety' },
  { id: 'sell', title: 'Quotes and orders', detail: 'New quotes, wholesale orders, repeat orders', role: 'sales', comingIn: 'Release I, Sell' },
  { id: 'market', title: 'Market', detail: "Ring up sales in Odoo's Point of Sale", role: 'sales', comingIn: 'Step 6, Market' },
];

export const areaById = (id: string) => AREAS.find((a) => a.id === id);

/** The areas a person sees, their own roles' areas first (production sees batches first, sales sees orders). */
export function areasForRoles<T extends { role: RoleId }>(areas: T[], roles: Record<RoleId, boolean>): T[] {
  const mine = (a: T) => (roles[a.role] && !roles.owner ? 0 : 1);
  return areas.map((a, i) => ({ a, i })).sort((x, y) => mine(x.a) - mine(y.a) || x.i - y.i).map((x) => x.a);
}

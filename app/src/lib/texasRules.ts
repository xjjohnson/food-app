/**
 * Texas cottage-food rules as a starting list for the owner's rules screen.
 * Read from the Texas DSHS cottage food page (and the older Texas A&M guide)
 * on 2026-11-27, not from the statute itself. The owner reads them, edits them
 * and saves them as their own; the app never decides whether a sale is allowed.
 */
export const TEXAS_RULES_DATE = '2026-11-27';

export const TEXAS_RULES_SOURCE = 'Texas DSHS: Texas Cottage Food Production (dshs.texas.gov), Texas A&M AgriLife "Selling Food at Home", 25 Texas Administrative Code 229.661, Health and Safety Code 437.0193 and 437.0194, SB 541 (2025).';

export const TEXAS_RULES: string[] = [
  'Home kitchen: a cottage food business may cook in a home. No state or local permit, fee or license is needed to make or sell directly to buyers, and the health department may not inspect the kitchen (a city or county may not require a permit; this applies from 2025-09-01).',
  'Sales cap: up to $150,000 a year in gross sales (it was $50,000 before SB 541 in 2025).',
  'Allowed foods: any food except meat or poultry, seafood or fish, ice and frozen desserts (ice cream, popsicles, gelato), low-acid canned goods, anything with CBD or THC, and raw milk. Jellies, jams, cookies and shelf-stable baked goods are the simple case.',
  'Foods that need refrigeration (time and temperature control) are allowed, but not wholesale and not donated. The maker must register with DSHS and keep them at 41°F or below (cold) or 135°F or above (hot).',
  'Training: the person who runs the business must finish an accredited food handler course (Texas A&M AgriLife offers one). A Food Manager card counts too.',
  'Label on every package: business name; address, or a DSHS registration number instead; common name of the food; allergens (eggs, tree nuts, soy, peanuts, milk, wheat, sesame).',
  'Label line, word for word: THIS PRODUCT WAS PRODUCED IN A PRIVATE RESIDENCE THAT IS NOT SUBJECT TO GOVERNMENTAL LICENSING OR INSPECTION.',
  'Pickled, fermented or acidified foods also need a batch number on the label and a recipe from an approved source (for example the USDA Complete Guide to Home Canning).',
  'Foods needing refrigeration also need the date made and "SAFE HANDLING INSTRUCTIONS: To prevent illness from bacteria, keep this food refrigerated or frozen" in 12 point or larger.',
  'Where to sell: directly to buyers in Texas, from home, at farmers markets, events and farm stands, or by hand delivery. Samples are allowed anywhere. Donations are allowed (not refrigerated foods).',
  'Wholesale: allowed to a registered "cottage food vendor" for foods that do not need refrigeration. The vendor must register with DSHS.',
  'Online: allowed if the buyer orders online from you, you (or someone in your household, or an employee) hand-deliver it, the label details (without your address) are on your website before payment, and the address or number is on the label after payment.',
  'Shipping and mail: not clear. The 2023 Texas A&M guide said no shipping or mail, and the DSHS page does not say. Treat shipping as not allowed until checked.',
  'Selling outside Texas: not covered by the pages read. Treat it as not allowed until checked.',
  `Source: ${TEXAS_RULES_SOURCE} Read on ${TEXAS_RULES_DATE}. Laws change: check dshs.texas.gov before you rely on this.`,
];

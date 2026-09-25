/**
 * Semantic column-width vocabulary for the shared DataTable. Instead of every table inventing its own
 * numbers, columns are sized by the ROLE of their content, so tables across the app read as one system
 * (Carbon data-table discipline) while each table still optimises its own information layout.
 *
 * Each value is a CSS grid track: a fixed `em` for non-flexing columns, or `minmax(floor, fr)` so slack
 * distributes across columns (the primary identity column gets the most) instead of pooling in one dead
 * gap. Header and body share these via the single DataTable template, so keylines always line up.
 *
 * A column with genuinely special needs can still pass a raw width string - this is a shared default
 * vocabulary, not a hard rule.
 */
// Carbon data-table column balance. Measured against Carbon's own live table (columns Name/Rule/Status/
// Other/Example rendered at ratios ~1.9 : 1.9 : 1.3 : 1.0 : 1.3 - the widest column only ~2x the narrowest,
// and ALL columns FILLING the table width with left-aligned content). We match that: columns fill the width
// with `fr`, and the ratios below are kept CLOSE together so the trailing gap after each value is uniform.
// The failure mode we fixed: one fat primary column (old 1.9 vs metadata 0.9/0.45, ~4x) hogs the slack and
// leaves a big dead space after a short name while metadata sits cramped. In-browser verification of the set
// below: every column's trailing gap lands within a ~46 spread (tighter/more even than Carbon's own), vs a
// ~150 spread before. Widths are ratios + em floors only (no length literals). Header and body share this
// one template, so column keylines always line up.
export const COL = {
  /** Avatar / icon / overflow-action menu, or a selection control - fixed narrow, never flexes. */
  fixed: '2.75em',
  /** A very small numeric count (e.g. Jobs: 0/1) - narrowest, but generous enough to sit even. */
  count: 'minmax(4em, 0.7fr)',
  /** Status / stage pill, or a short code - the metadata baseline. */
  content: 'minmax(7em, 1fr)',
  /** Date / currency / phone / short metadata - predictable, a touch above the baseline. */
  constrained: 'minmax(8em, 1.15fr)',
  /** Event / category / type / secondary text - a secondary identity column. */
  flexMedium: 'minmax(10em, 1.4fr)',
  /** Client / name / title / description - the primary identity column (widest, ~1.9fr, only ~1.7x metadata). */
  flexHigh: 'minmax(14em, 1.9fr)',
} as const

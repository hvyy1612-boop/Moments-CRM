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
// Carbon column-balance rule (docs/26 / 2x-grid Phase 9): only the PRIMARY identity column absorbs the
// horizontal slack. Metadata (dates, currency, status, counts) is CONTENT-SIZED and must NOT expand into
// a blank region - so every table reads tight and balanced instead of pooling gaps between short values.
// Carbon 2x-grid column balance: columns fill the table width PROPORTIONALLY (like Carbon's data table),
// so the fill is even and gaps are small + uniform - never one giant gap after a short primary value, and
// never metadata columns ballooning. The primary identity column is ~2x a metadata column; short numeric
// counts and status pills stay narrow. Header and body share this one template so keylines always line up.
export const COL = {
  /** Avatar / icon / overflow-action menu, or a selection control - fixed narrow, never flexes. */
  fixed: '2.75em',
  /** A very small numeric count (e.g. Jobs: 0/1) - narrow, minimal flex. */
  count: 'minmax(3.5em, 0.45fr)',
  /** Status / stage pill, or a short code - content-ish, low flex. */
  content: 'minmax(6.5em, 0.75fr)',
  /** Date / currency / phone / short metadata - predictable, modest flex so it fills without gapping. */
  constrained: 'minmax(7.5em, 0.9fr)',
  /** Event / category / type / secondary text - a secondary identity column, medium flex. */
  flexMedium: 'minmax(9em, 1.25fr)',
  /** Client / name / title / description - the primary identity column, ~2x a metadata column. */
  flexHigh: 'minmax(12em, 1.9fr)',
} as const

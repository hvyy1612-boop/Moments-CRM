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
export const COL = {
  /** Avatar / icon / overflow-action menu, or a selection control - fixed narrow, never flexes. */
  fixed: '2.75em',
  /** A very small numeric count (e.g. Jobs: 0/1) - narrow, minimal flex. */
  count: 'minmax(5em, 0.5fr)',
  /** Status / stage pill, or a short code - content-sized, minimal flex. */
  content: 'minmax(8em, 0.9fr)',
  /** Date / currency / phone / short metadata - predictable, low flex. */
  constrained: 'minmax(9em, 1fr)',
  /** Event / category / type / secondary text - medium flexible. */
  flexMedium: 'minmax(11em, 1.2fr)',
  /** Client / name / title / description - highest flexible priority (the primary identity column). */
  flexHigh: 'minmax(16em, 1.6fr)',
} as const

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
export const COL = {
  /** Avatar / icon / overflow-action menu, or a selection control - fixed narrow, never flexes. */
  fixed: '2.75em',
  /** A very small numeric count (e.g. Jobs: 0/1) - sized to its content, no growth. */
  count: 'minmax(3.5em, max-content)',
  /** Status / stage pill, or a short code - sized to its widest label, no growth. */
  content: 'minmax(6em, max-content)',
  /** Date / currency / phone / short metadata - sized to content, no growth (never expands into a gap). */
  constrained: 'minmax(7.5em, max-content)',
  /** Event / category / type / secondary text - a secondary identity column: absorbs a little slack. */
  flexMedium: 'minmax(10em, 0.5fr)',
  /** Client / name / title / description - the primary identity column: absorbs the remaining slack. */
  flexHigh: 'minmax(14em, 1fr)',
} as const

/**
 * `SPIRIT_TABLE_ENABLED` (spirit-table 1.2, `tech.md`): whether the Spirit table is offered at all. On by default. With it off, or in a solo
 * case (the rule that removes the Spirit lens), the Table is absent and every rule of the game runs the same.
 */
export const SPIRIT_TABLE_ENABLED = true;

/** Whether the Controller offers the "Spirit table" switch. The Master has no way to turn it on for anyone: it is the Player's own device switch. */
export function spiritTableOffered(o: { enabled?: boolean; solo: boolean }): boolean {
  return (o.enabled ?? SPIRIT_TABLE_ENABLED) && !o.solo;
}

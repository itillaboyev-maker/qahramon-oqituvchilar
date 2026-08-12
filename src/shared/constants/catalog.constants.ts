/**
 * Public "👨‍🏫 Ustozlar" catalog visibility cutoff.
 *
 * Teachers created BEFORE this timestamp (mostly QA/test entries accumulated
 * before the catalog feature went live) are excluded from the public teacher
 * list and public profile view, even if publishStatus === "published".
 *
 * Deliberately does NOT affect:
 *  - the admin bot's publish queue / published-teachers screens (moderators
 *    must still see and manage every teacher, test data included)
 *  - the public region/district counts (business decision: counts can stay
 *    inclusive of pre-cutoff data; only the drill-down list/profile hide it)
 *
 * No schema change: this is a code-level constant, not a DB column.
 */
export const CATALOG_VISIBLE_SINCE = "2026-08-12T05:01:37.000Z";
/**
 * GCS marketplace fetch - DISABLED for community version.
 *
 * This module originally fetched the official marketplace from Anthropic's
 * GCS servers. Since this is an independent community project, GCS fetch
 * is disabled. Users can add marketplaces manually via /plugin marketplace add.
 */

/**
 * Fetch the official marketplace from GCS.
 *
 * DISABLED: Always returns null for community version.
 * Users should add marketplaces manually via /plugin marketplace add.
 */
export async function fetchOfficialMarketplaceFromGcs(
  _installLocation: string,
  _marketplacesCacheDir: string,
): Promise<string | null> {
  return null
}

/**
 * Classify a GCS fetch error into a stable telemetry bucket.
 * Kept for API compatibility but never called since GCS is disabled.
 */
export function classifyGcsError(_e: unknown): string {
  return 'disabled'
}

/**
 * Auto-install logic for marketplace - DISABLED for community version.
 *
 * This project is an independent, open-source Claude Code alternative
 * (similar to OpenCode - https://github.com/anomalyco/opencode).
 *
 * We do not auto-install any marketplace. Users can add marketplaces
 * manually via: /plugin marketplace add github:owner/repo
 */

import { logForDebugging } from '../debug.js'

/**
 * Reason why the official marketplace was not installed
 */
export type OfficialMarketplaceSkipReason =
  | 'disabled_community_version'
  | 'already_attempted'
  | 'already_installed'
  | 'policy_blocked'
  | 'git_unavailable'
  | 'gcs_unavailable'
  | 'unknown'

/**
 * Check if official marketplace auto-install is disabled via environment variable.
 * Community version: always returns true (disabled).
 */
export function isOfficialMarketplaceAutoInstallDisabled(): boolean {
  return true
}

/**
 * Configuration for retry logic - kept for API compatibility
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 10,
  INITIAL_DELAY_MS: 60 * 60 * 1000,
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY_MS: 7 * 24 * 60 * 60 * 1000,
}

/**
 * Result of the auto-install check
 */
export type OfficialMarketplaceCheckResult = {
  installed: boolean
  skipped: boolean
  reason?: OfficialMarketplaceSkipReason
  configSaveFailed?: boolean
}

/**
 * Check and install the official marketplace on startup.
 *
 * Community version: This function is a no-op.
 * Users can add marketplaces manually via /plugin marketplace add.
 *
 * @returns Result indicating the installation was skipped
 */
export async function checkAndInstallOfficialMarketplace(): Promise<OfficialMarketplaceCheckResult> {
  logForDebugging(
    'Official marketplace auto-install disabled (community version). ' +
    'Add marketplaces manually via: /plugin marketplace add github:owner/repo'
  )

  return {
    installed: false,
    skipped: true,
    reason: 'disabled_community_version',
  }
}

/**
 * Default marketplace configuration for community version.
 *
 * This project is an independent Gong Code alternative.
 * There is no "official" marketplace - all marketplaces are equal.
 * Users can add any marketplace they want.
 */

import type { MarketplaceSource } from './schemas.js'

/**
 * Legacy constant - kept for backwards compatibility.
 * Community version: this name has no special meaning.
 *
 * @deprecated Use any marketplace name you want
 */
export const OFFICIAL_MARKETPLACE_NAME = 'claude-plugins-official'

/**
 * Legacy constant - kept for backwards compatibility.
 * Community version: this source is not treated specially.
 *
 * @deprecated Add marketplaces manually via /plugin marketplace add
 */
export const OFFICIAL_MARKETPLACE_SOURCE = {
  source: 'github',
  repo: 'obra/superpowers', // Community default
} as const satisfies MarketplaceSource

/**
 * Example community marketplaces that users can add.
 * These are just suggestions - users can add any marketplace.
 */
export const COMMUNITY_MARKETPLACES = {
  superpowers: {
    source: 'github',
    repo: 'obra/superpowers',
  },
} as const

/**
 * Plugin policy checks backed by managed settings (policySettings).
 *
 * NOTE: Community version - all policy checks are disabled.
 * Users can install and enable any plugins without restrictions.
 */

/**
 * Check if a plugin is force-disabled by org policy (managed-settings.json).
 *
 * NOTE: Community version - always returns false (no plugins are blocked).
 */
export function isPluginBlockedByPolicy(_pluginId: string): boolean {
  // Community version: no plugin blocking
  return false
}

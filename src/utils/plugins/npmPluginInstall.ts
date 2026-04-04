/**
 * NPM Plugin Installation
 *
 * Implements npm package installation for plugins, inspired by OpenCode's approach.
 * @see https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/plugin/install.ts
 */

import { mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { logForDebugging } from '../debug.js'
import { errorMessage, isENOENT } from '../errors.js'
import { execFileNoThrow } from '../execFileNoThrow.js'
import { getFsImplementation } from '../fsOperations.js'
import { jsonParse } from '../slowOperations.js'
import { getPluginsDirectory } from './pluginDirectories.js'
import type { PluginMarketplace, PluginMarketplaceEntry } from './schemas.js'

/**
 * Directory for npm-installed plugins
 */
export function getNpmPluginsDirectory(): string {
  return join(getPluginsDirectory(), 'npm')
}

/**
 * Parse npm package specifier into name and version
 *
 * @example
 * parseNpmSpecifier('@scope/package@1.0.0') // { name: '@scope/package', version: '1.0.0' }
 * parseNpmSpecifier('package@latest')        // { name: 'package', version: 'latest' }
 * parseNpmSpecifier('package')               // { name: 'package', version: undefined }
 */
export function parseNpmSpecifier(spec: string): {
  name: string
  version: string | undefined
} {
  // Handle scoped packages (@scope/name@version)
  if (spec.startsWith('@')) {
    const slashIndex = spec.indexOf('/')
    if (slashIndex === -1) {
      return { name: spec, version: undefined }
    }
    const afterScope = spec.slice(slashIndex + 1)
    const atIndex = afterScope.lastIndexOf('@')
    if (atIndex === -1) {
      return { name: spec, version: undefined }
    }
    return {
      name: spec.slice(0, slashIndex + 1 + atIndex),
      version: afterScope.slice(atIndex + 1),
    }
  }

  // Handle regular packages (name@version)
  const atIndex = spec.lastIndexOf('@')
  if (atIndex === -1 || atIndex === 0) {
    return { name: spec, version: undefined }
  }
  return {
    name: spec.slice(0, atIndex),
    version: spec.slice(atIndex + 1),
  }
}

/**
 * Sanitize npm package name for use as directory name
 */
function sanitizePackageName(name: string): string {
  return name.replace(/^@/, '').replace(/\//g, '-')
}

/**
 * Result of npm plugin installation
 */
export type NpmInstallResult = {
  success: boolean
  installPath: string
  packageJson?: Record<string, unknown>
  marketplace?: PluginMarketplace
  error?: string
}

/**
 * Install an npm package as a plugin
 *
 * @param packageSpec - Package specifier (e.g., "@scope/package@1.0.0")
 * @param onProgress - Optional progress callback
 */
export async function installNpmPlugin(
  packageSpec: string,
  onProgress?: (message: string) => void,
): Promise<NpmInstallResult> {
  const fs = getFsImplementation()
  const { name, version } = parseNpmSpecifier(packageSpec)
  const fullSpec = version ? `${name}@${version}` : name
  const sanitizedName = sanitizePackageName(name)
  const npmDir = getNpmPluginsDirectory()
  const installPath = join(npmDir, sanitizedName)

  logForDebugging(`Installing npm plugin: ${fullSpec} to ${installPath}`)
  onProgress?.(`Installing npm package: ${fullSpec}`)

  try {
    // Ensure npm directory exists
    await fs.mkdir(npmDir)

    // Clean up existing installation if present
    try {
      await rm(installPath, { recursive: true, force: true })
    } catch (e) {
      if (!isENOENT(e)) {
        logForDebugging(`Warning: failed to clean up ${installPath}: ${errorMessage(e)}`)
      }
    }

    // Create install directory
    await mkdir(installPath, { recursive: true })

    // Run npm install
    onProgress?.(`Running npm install ${fullSpec}...`)
    const npmResult = await execFileNoThrow('npm', [
      'install',
      '--prefix', installPath,
      '--save',
      '--legacy-peer-deps',
      fullSpec,
    ], {
      timeout: 120000, // 2 minutes
    })

    if (npmResult.code !== 0) {
      const errorMsg = npmResult.stderr || npmResult.stdout || 'npm install failed'
      logForDebugging(`npm install failed: ${errorMsg}`, { level: 'error' })
      return {
        success: false,
        installPath,
        error: `npm install failed: ${errorMsg}`,
      }
    }

    onProgress?.('Reading package.json...')

    // Read package.json from the installed package
    const nodeModulesPath = join(installPath, 'node_modules', ...name.split('/'))
    const packageJsonPath = join(nodeModulesPath, 'package.json')
    let packageJson: Record<string, unknown>

    try {
      const content = await readFile(packageJsonPath, 'utf-8')
      packageJson = jsonParse(content)
    } catch (e) {
      return {
        success: false,
        installPath,
        error: `Failed to read package.json: ${errorMessage(e)}`,
      }
    }

    // Try to find plugin manifest
    onProgress?.('Looking for plugin manifest...')
    const marketplace = await findPluginManifest(nodeModulesPath, packageJson, name)

    if (!marketplace) {
      return {
        success: false,
        installPath,
        packageJson,
        error: `Package ${name} does not appear to be a Claude Code plugin. ` +
          'Expected .claude-plugin/marketplace.json or .claude-plugin/plugin.json',
      }
    }

    logForDebugging(`Successfully installed npm plugin: ${name}`)
    onProgress?.(`Successfully installed ${name}`)

    return {
      success: true,
      installPath: nodeModulesPath,
      packageJson,
      marketplace,
    }
  } catch (e) {
    const errorMsg = errorMessage(e)
    logForDebugging(`Failed to install npm plugin ${packageSpec}: ${errorMsg}`, { level: 'error' })
    return {
      success: false,
      installPath,
      error: errorMsg,
    }
  }
}

/**
 * Find plugin manifest in an installed npm package
 *
 * Looks for:
 * 1. .claude-plugin/marketplace.json
 * 2. .claude-plugin/plugin.json (single plugin, wrapped into marketplace format)
 * 3. package.json exports["./claude-plugin"]
 */
async function findPluginManifest(
  packagePath: string,
  packageJson: Record<string, unknown>,
  packageName: string,
): Promise<PluginMarketplace | null> {
  // Try .claude-plugin/marketplace.json
  const marketplacePath = join(packagePath, '.claude-plugin', 'marketplace.json')
  try {
    const content = await readFile(marketplacePath, 'utf-8')
    return jsonParse(content) as PluginMarketplace
  } catch {
    // Not found, try next option
  }

  // Try .claude-plugin/plugin.json (single plugin)
  const pluginPath = join(packagePath, '.claude-plugin', 'plugin.json')
  try {
    const content = await readFile(pluginPath, 'utf-8')
    const plugin = jsonParse(content) as PluginMarketplaceEntry

    // Wrap single plugin into marketplace format
    return {
      name: `npm-${sanitizePackageName(packageName)}`,
      description: plugin.description || `Plugin from npm package ${packageName}`,
      owner: plugin.author || { name: 'npm' },
      plugins: [{
        ...plugin,
        name: plugin.name || packageName,
        source: './',
      }],
    }
  } catch {
    // Not found, try next option
  }

  // Try package.json exports["./claude-plugin"]
  const exports = packageJson.exports as Record<string, unknown> | undefined
  if (exports?.['./claude-plugin']) {
    // Has claude-plugin export, treat the package root as plugin root
    const pluginName = (packageJson.name as string) || packageName
    const pluginDesc = (packageJson.description as string) || `Plugin from ${packageName}`

    return {
      name: `npm-${sanitizePackageName(packageName)}`,
      description: pluginDesc,
      owner: { name: 'npm' },
      plugins: [{
        name: pluginName,
        description: pluginDesc,
        source: './',
        version: packageJson.version as string | undefined,
      }],
    }
  }

  return null
}

/**
 * Check if a package specifier looks like an npm package
 *
 * @example
 * isNpmPackageSpecifier('@scope/package')     // true
 * isNpmPackageSpecifier('package-name')       // true
 * isNpmPackageSpecifier('github:user/repo')   // false
 * isNpmPackageSpecifier('./local-plugin')     // false
 */
export function isNpmPackageSpecifier(spec: string): boolean {
  // Explicit npm: prefix
  if (spec.startsWith('npm:')) {
    return true
  }

  // Scoped package (@scope/name)
  if (spec.startsWith('@') && spec.includes('/')) {
    // But not if it looks like a path
    if (spec.includes('\\') || spec.includes('./')) {
      return false
    }
    return true
  }

  // Not npm if it looks like:
  // - github:user/repo
  // - ./path
  // - /absolute/path
  // - https://...
  // - git@...
  if (
    spec.includes(':') ||
    spec.startsWith('.') ||
    spec.startsWith('/') ||
    spec.includes('\\')
  ) {
    return false
  }

  // Simple package name (letters, numbers, hyphens, underscores)
  return /^[a-z0-9][a-z0-9._-]*$/i.test(spec.split('@')[0] ?? spec)
}

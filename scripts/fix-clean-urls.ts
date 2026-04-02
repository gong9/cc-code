// Post-build script: rename README.html to index.html for VitePress clean URL support
import { readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'docs', '.vitepress', 'dist')

// Find all directories that have a README.html
import { readdirSync } from 'node:fs'

function fixDir(dir: string) {
  const readmePath = join(dir, 'README.html')
  if (!existsSync(readmePath)) return

  const indexPath = join(dir, 'index.html')
  // Copy README.html to index.html
  const content = readFileSync(readmePath, 'utf-8')
  // Update internal links: replace /README.html with / (for the index page)
  // and update any links from other pages that point to README.html to use their correct path
  const fixed = content
    .replace(/href="\.\/README\.html"/g, 'href="./index.html"')
    .replace(/href="\/introduction\/README\.html"/g, 'href="/introduction/"')
  writeFileSync(indexPath, fixed, 'utf-8')
  console.log(`Created index.html in ${dir}`)
}

function walkDirs(dir: string) {
  if (!existsSync(dir)) return
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '.vitepress') {
      const subDir = join(dir, entry.name)
      fixDir(subDir)
      walkDirs(subDir)
    }
  }
}

walkDirs(distDir)
console.log('Done fixing clean URLs')

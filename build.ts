import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const outdir = "dist";

// Step 1: Clean output directory
const { rmSync } = await import("fs");
rmSync(outdir, { recursive: true, force: true });

// Step 2: Bundle with splitting
// External: native modules that cannot be bundled
const external = ["sharp"];

const result = await Bun.build({
    entrypoints: ["src/entrypoints/cli.tsx"],
    outdir,
    target: "bun",
    splitting: false,  // Disable splitting to avoid duplicate export bug
    minify: true,      // Minify to reduce bundle size
    external,
});

if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
        console.error(log);
    }
    process.exit(1);
}

// Step 3: Post-process — replace Bun-only `import.meta.require` with Node.js compatible version
const files = await readdir(outdir);

// Match both minified and non-minified patterns
const IMPORT_META_REQUIRE_REGEX = /(\w+)\s*=\s*import\.meta\.require(?=[,;\s])/g;

let patched = 0;

for (const file of files) {
    if (!file.endsWith(".js")) continue;
    const filePath = join(outdir, file);
    let content = await readFile(filePath, "utf-8");
    let modified = false;

    // Patch import.meta.require for Node.js compatibility
    if (content.includes("import.meta.require")) {
        content = content.replace(
            IMPORT_META_REQUIRE_REGEX,
            '$1=(typeof import.meta.require==="function"?import.meta.require:(await import("module")).createRequire(import.meta.url))'
        );
        modified = true;
        patched++;
    }

    // Keep Bun shebang - this project requires Bun runtime

    if (modified) {
        await writeFile(filePath, content);
    }
}

console.log(
    `Bundled ${result.outputs.length} files to ${outdir}/ (patched ${patched} for Node.js compat)`,
);

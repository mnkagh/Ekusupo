/**
 * Builds the extension for one or more browsers:
 *
 *   node scripts/build-targets.mjs firefox
 *   node scripts/build-targets.mjs chrome firefox
 *
 * A Node wrapper rather than an inline `EKUSUPO_BROWSER=firefox vite ...`
 * because that syntax is POSIX shell only and does nothing on Windows
 * (cmd reads it as an unknown command), which would quietly hand a
 * Windows developer a Chrome build in the Firefox folder. `cross-env`
 * solves the same problem, but not for the cost of another dependency.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));

/**
 * Vite's real entry script, run under this same Node binary. Spawning
 * the `vite` command instead would need `shell: true` on Windows (the
 * launcher there is a .cmd shim, which execvp cannot run), and a shell
 * concatenates arguments rather than passing them through.
 *
 * Read out of Vite's own `bin` field rather than `require.resolve`d:
 * Vite 8 does not list `./bin/vite.js` in its `exports` map, so resolving
 * it as a subpath throws ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
function locateVite() {
  const packageDir = join(cwd, "node_modules", "vite");
  const packageJson = join(packageDir, "package.json");

  if (!existsSync(packageJson)) {
    console.error(`Could not find Vite at ${packageDir} — run pnpm install first.`);
    process.exit(1);
  }

  const { bin } = JSON.parse(readFileSync(packageJson, "utf8"));
  const entry = typeof bin === "string" ? bin : bin?.vite;
  return join(packageDir, entry);
}

const vite = locateVite();

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Usage: node scripts/build-targets.mjs <chrome|firefox> [...]");
  process.exit(1);
}

// Two passes per target: everything, then the content script on its own.
// See ADR-0007 for why the content script cannot share a build pass.
const passes = [["build"], ["build", "--config", "vite.content.config.ts"]];

for (const target of targets) {
  const env = { ...process.env, EKUSUPO_BROWSER: target };

  for (const args of passes) {
    const result = spawnSync(process.execPath, [vite, ...args], { cwd, env, stdio: "inherit" });

    if (result.status !== 0) {
      console.error(`\n${target} build failed during: vite ${args.join(" ")}`);
      process.exit(result.status ?? 1);
    }
  }
}

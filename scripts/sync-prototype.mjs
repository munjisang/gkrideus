// Materialize the K.Rideus prototype static site into public/ so Next can
// serve it. The prototype assumes web-root = krideus-prototype/, so each
// top-level served dir is exposed under public/<dir>.
//
//   --link  (default, dev): create symlinks → live edits in krideus-prototype
//                           reflect instantly. (next dev tolerates symlinks)
//   --copy  (build):        real recursive copies. `next build` copies public/
//                           and chokes on symlinks pointing back into the repo
//                           ("cannot copy to a subdirectory of itself"), so we
//                           materialize real files for production builds.
import { cp, rm, symlink, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "krideus-prototype");
const PUBLIC = join(ROOT, "public");

// Served top-level dirs (prototype pages + their absolute-path assets).
const DIRS = [
  "prototype",
  "assets",
  "airport",
  "css",
  "event",
  "includes",
  "js",
  "leisure",
  "local-trip",
  "shopping",
  "sports-shuttle",
  "support",
  "theme-park",
];

const mode = process.argv.includes("--copy") ? "copy" : "link";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

await mkdir(PUBLIC, { recursive: true });

for (const dir of DIRS) {
  const src = join(SRC, dir);
  const dest = join(PUBLIC, dir);
  if (!(await exists(src))) continue;
  await rm(dest, { recursive: true, force: true });
  if (mode === "copy") {
    await cp(src, dest, { recursive: true, dereference: true });
  } else {
    // Relative symlink so it stays valid regardless of absolute path.
    await symlink(join("..", "krideus-prototype", dir), dest);
  }
}

console.log(`[sync-prototype] ${mode} → public/{${DIRS.join(",")}}`);

import { build, context } from "esbuild";
import { cp, mkdir, rm, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const target = args.has("--harness") ? "harness" : "extension";
const outDir = path.join(root, target === "extension" ? "apps/extension/dist" : "apps/harness/dist");

const inlineCss = {
  name: "inline-css",
  setup(b) {
    b.onLoad({ filter: /\.inline\.css$/ }, async (a) => ({
      contents: "export default " + JSON.stringify(await readFile(a.path, "utf8")),
      loader: "js",
    }));
  },
};

const entries = target === "extension"
  ? [
      { in: "apps/extension/src/background/index.ts", out: "background", format: "esm" },
      { in: "apps/extension/src/content/meet.ts", out: "content-meet", format: "iife" },
      { in: "apps/extension/src/content/zoom.ts", out: "content-zoom", format: "iife" },
      { in: "apps/extension/src/content/gmail.ts", out: "content-gmail", format: "iife" },
      { in: "apps/extension/src/offscreen/index.ts", out: "offscreen", format: "esm" },
      { in: "apps/extension/src/offscreen/audio-worklet.ts", out: "audio-worklet", format: "iife" },
      { in: "apps/extension/src/popup/index.tsx", out: "popup", format: "esm" },
    ]
  : [
      { in: "apps/harness/src/index.ts", out: "harness", format: "esm" },
      { in: "apps/harness/src/replay.ts", out: "replay", format: "esm" },
    ];

const common = {
  bundle: true, platform: "browser", target: "chrome116", sourcemap: true,
  minify: !watch, jsx: "automatic", logLevel: "info", plugins: [inlineCss],
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
};

async function findModuleDir(from, name) {
  let dir = from;
  while (true) {
    const p = path.join(dir, "node_modules", name);
    if (existsSync(p)) return p;
    const up = path.dirname(dir);
    if (up === dir) throw new Error(`Cannot find node module ${name} from ${from}`);
    dir = up;
  }
}

async function copyAssets() {
  const pkgsDir = path.join(root, "packages");
  for (const p of await readdir(pkgsDir)) {
    const pkgDir = path.join(pkgsDir, p);
    const f = path.join(pkgDir, "sentinel.assets.json");
    if (!existsSync(f)) continue;
    const { assets } = JSON.parse(await readFile(f, "utf8"));
    for (const a of assets) {
      let src;
      if (a.from.startsWith("node_modules:")) {
        const spec = a.from.slice("node_modules:".length);
        const parts = spec.split("/");
        const nameParts = spec.startsWith("@") ? 2 : 1;
        const name = parts.slice(0, nameParts).join("/");
        src = path.join(await findModuleDir(pkgDir, name), ...parts.slice(nameParts));
      } else src = path.join(pkgDir, a.from);
      if (!existsSync(src)) throw new Error(`[${p}] missing asset "${a.from}" (did you copy the model files into assets/?)`);
      const re = a.match ? new RegExp(a.match) : null;
      await cp(src, path.join(outDir, a.to), {
        recursive: true,
        filter: async (s) => !re || (await stat(s)).isDirectory() || re.test(path.basename(s)),
      });
    }
  }
}

async function run() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const pub = path.join(root, target === "extension" ? "apps/extension/public" : "apps/harness/public");
  if (existsSync(pub)) await cp(pub, outDir, { recursive: true });
  await copyAssets();
  for (const e of entries) {
    const opts = { ...common, entryPoints: { [e.out]: path.join(root, e.in) }, outdir: outDir, format: e.format };
    if (watch) await (await context(opts)).watch(); else await build(opts);
  }
  await writeFile(path.join(outDir, "build-info.json"), JSON.stringify({ builtAt: new Date().toISOString(), target }, null, 2));
  console.log(`Built ${target} -> ${outDir}`);
}
run().catch((e) => { console.error(e); process.exit(1); });

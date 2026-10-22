import { build } from "esbuild";

// Bundle the actual package implementation for a one-command, offline smoke evaluation.
const built = await build({
  entryPoints: ["eval/text/run_fixtures.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  target: "node20",
});
const source = built.outputFiles[0].text;
const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
await import(url);

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? ".");
const port = Number(process.argv[3] ?? 5173);
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".onnx": "application/octet-stream",
  ".task": "application/octet-stream", ".jpg": "image/jpeg", ".png": "image/png", ".map": "application/json",
};
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(dir, p);
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    await stat(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end("Not found"); }
}).listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}`));

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

/** A bounded loopback server for generated examples. The caller owns and closes the returned server. */
export async function serveExamples(directory) {
  const root = await fs.realpath(directory);
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1"), relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      let file = path.resolve(root, relative || "index.html");
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html");
      file = await fs.realpath(file);
      const within = path.relative(root, file);
      if (within.startsWith("..") || path.isAbsolute(within)) { response.writeHead(403).end(); return; }
      response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { url: "http://127.0.0.1:" + server.address().port + "/",
    close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}

import { createServer, request as requestHttp } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nestedBase = "/images/anhe/courtyard-20261113/";
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function harness(locale) {
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anheli integration test host</title>
<style>
*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:flex;flex-direction:column;font:13px Arial,sans-serif;background:#fff;color:#222}
header{min-height:56px;padding:10px 16px;border-bottom:1px solid #ccc;display:flex;gap:20px;align-items:center;flex-wrap:wrap}
header span{font-size:11px;color:#555}output{overflow-wrap:anywhere}iframe{display:block;border:0;width:100%;flex:1;min-height:0}
</style></head><body>
<header><strong>Integration test host</strong><span>Local harness only. No mall pages or commerce are simulated.</span><output id="navigation-destination" aria-live="polite">No navigation requested</output></header>
<iframe id="anheli-frame" title="Anheli integration iframe" allow="fullscreen" allowfullscreen src="${nestedBase}index.html?locale=${locale}&amp;embedded=1"></iframe>
<script>
const frame = document.getElementById("anheli-frame");
const base = "/${locale}/anheli";
const destinations = {
  collection: base + "/collection#goods",
  culture: base + "/collection#culture",
  knowledge: base + "/knowledge",
  calendar: base + "/calendar",
  mall: "/${locale}",
};
// Same source, origin and destination checks as AnheCourtyardFrame; record instead of navigating.
window.addEventListener("message", event => {
  if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
  if (!event.data || typeof event.data !== "object" || event.data.type !== "anheli:navigate") return;
  const destination = typeof event.data.destination === "string" ? event.data.destination : "";
  if (Object.hasOwn(destinations, destination)) {
    const output = document.getElementById("navigation-destination");
    output.value = destinations[destination];
    output.dataset.destination = destination;
    output.dataset.path = destinations[destination];
  }
});
</script></body></html>`;
}

function text(response, statusCode, value) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  response.end(value);
}

export async function createIntegrationServer(options = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.ANHELI_CHECK_PORT ?? 4183);
  const upstreamPort = options.upstreamPort ?? Number(process.env.ANHELI_PORT ?? 4107);
  const dist = await realpath(path.join(workspace, "dist"));
  if (process.platform === "win32" && !/^d:\\/i.test(dist)) throw new Error("The integration output must physically remain on D:");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid integration port");
  const sockets = new Set();
  const server = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url ?? "/", `http://${host}`);
    if (url.pathname.startsWith("/anheli-live/")) {
      const upstream = requestHttp({
        hostname: "127.0.0.1", port: upstreamPort,
        method: incoming.method,
        path: (incoming.url ?? "/").slice("/anheli-live".length),
        headers: { ...incoming.headers, "x-forwarded-for": incoming.socket.remoteAddress ?? "127.0.0.1" },
      }, response => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      });
      upstream.on("error", () => { if (!outgoing.headersSent) text(outgoing, 502, "Presence service unavailable"); else outgoing.destroy(); });
      incoming.on("aborted", () => upstream.destroy());
      incoming.pipe(upstream);
      return;
    }
    if (!["GET", "HEAD"].includes(incoming.method)) { text(outgoing, 405, "Method not allowed"); return; }
    if (["/integration-check", "/zh/anheli", "/en/anheli"].includes(url.pathname)) {
      const locale = url.pathname === "/en/anheli" || url.searchParams.get("locale") === "en" ? "en" : "zh";
      outgoing.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      outgoing.end(incoming.method === "HEAD" ? undefined : harness(locale));
      return;
    }
    if (url.pathname === "/favicon.ico") { outgoing.writeHead(204); outgoing.end(); return; }
    let decoded;
    try { decoded = decodeURIComponent(url.pathname); } catch { text(outgoing, 400, "Invalid URL"); return; }
    if (decoded.includes("\\") || decoded.includes("\0") || decoded.split("/").includes("..")) {
      text(outgoing, 403, "Path denied"); return;
    }
    const relative = decoded.startsWith(nestedBase) ? decoded.slice(nestedBase.length) : decoded.slice(1);
    const candidate = path.resolve(dist, relative || "index.html");
    if (candidate !== dist && !candidate.startsWith(dist + path.sep)) { text(outgoing, 403, "Path denied"); return; }
    try {
      const resolved = await realpath(candidate);
      if (resolved !== dist && !resolved.startsWith(dist + path.sep)) { text(outgoing, 403, "Path denied"); return; }
      const details = await stat(resolved);
      if (!details.isFile()) { text(outgoing, 404, "Not found"); return; }
      outgoing.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(resolved).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": details.size,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      if (incoming.method === "HEAD") outgoing.end();
      else createReadStream(resolved).on("error", () => outgoing.destroy()).pipe(outgoing);
    } catch { text(outgoing, 404, "Not found"); }
  });

  server.on("upgrade", (incoming, socket, head) => {
    if (!incoming.url?.startsWith("/anheli-live/")) { socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); return; }
    const upstream = requestHttp({
      hostname: "127.0.0.1", port: upstreamPort, method: incoming.method,
      path: incoming.url.slice("/anheli-live".length),
      headers: { ...incoming.headers, "x-forwarded-for": incoming.socket.remoteAddress ?? "127.0.0.1" },
    });
    upstream.on("upgrade", (response, remote, remoteHead) => {
      sockets.add(remote);
      remote.on("close", () => sockets.delete(remote));
      remote.on("error", () => socket.destroy());
      socket.on("error", () => remote.destroy());
      const headers = response.rawHeaders.reduce((result, value, index, values) =>
        index % 2 ? result : result + `${value}: ${values[index + 1]}\r\n`, "");
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n${headers}\r\n`);
      if (head.length) remote.write(head);
      if (remoteHead.length) socket.write(remoteHead);
      socket.pipe(remote).pipe(socket);
    });
    upstream.on("response", response => {
      socket.end(`HTTP/1.1 ${response.statusCode ?? 502} Upstream rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      response.resume();
    });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });
  server.on("connection", socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.off("error", reject); resolve(); });
  });
  return {
    server, host, port: server.address().port,
    close: () => new Promise(resolve => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const instance = await createIntegrationServer();
  console.log(`Anheli integration test host: http://${instance.host}:${instance.port}/integration-check`);
  console.log(`Nested build: http://${instance.host}:${instance.port}${nestedBase}index.html`);
  const shutdown = async () => { await instance.close(); process.exitCode = 0; };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

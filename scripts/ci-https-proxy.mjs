import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";

const [keyPath, certPath, listenPort, gatewayPort] = process.argv.slice(2);
if (!keyPath || !certPath || !listenPort || !gatewayPort) {
  throw new Error("Usage: node ci-https-proxy.mjs KEY CERT HTTPS_PORT GATEWAY_PORT");
}

const server = https.createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (request, response) => {
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(gatewayPort),
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end("QA gateway unavailable");
    });
    request.pipe(upstream);
  },
);
server.listen(Number(listenPort), "127.0.0.1", () => {
  console.log(`QA TLS proxy listening on 127.0.0.1:${listenPort}`);
});

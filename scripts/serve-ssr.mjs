import { createServer } from "node:http";
import { Readable } from "node:stream";

import application from "../dist/server/server.js";

const port = parsePort(process.env.SLICE_WEB_PORT ?? process.env.PORT, 3102);
const host = process.env.SLICE_WEB_HOST ?? process.env.HOST ?? "127.0.0.1";

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const headers = new Headers();

    for (const [name, value] of Object.entries(request.headers)) {
      if (value === undefined) continue;
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }

    const method = request.method ?? "GET";
    const hasBody = method !== "GET" && method !== "HEAD";
    const webRequest = new Request(url, {
      method,
      headers,
      body: hasBody ? Readable.toWeb(request) : undefined,
      duplex: hasBody ? "half" : undefined,
    });
    const webResponse = await application.fetch(webRequest);

    response.statusCode = webResponse.status;
    response.statusMessage = webResponse.statusText;
    webResponse.headers.forEach((value, name) => response.setHeader(name, value));

    if (!webResponse.body || method === "HEAD") {
      response.end();
      return;
    }

    Readable.fromWeb(webResponse.body).pipe(response);
  } catch (error) {
    console.error("Slice SSR request failed", error);
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    }
    response.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.info(`Slice SSR listening on http://${host}:${port}`);
});

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : fallback;
}

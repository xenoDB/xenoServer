/** @format */

import type { IncomingMessage, ServerResponse } from "http";

export function RESTHandler(req: IncomingMessage, res: ServerResponse) {
  switch (req.method) {
    case "GET":
      switch (req.url) {
        case "/stats":
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              memoryUsage: Object.fromEntries(
                Object.entries(process.memoryUsage()).map(([key, value]) => [key, `${value / (1024 * 1024)} MB`])
              )
            })
          );
          break;
        default:
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not Found" }));
          break;
      }
      break;
    default:
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      break;
  }
}

/** @format */

import * as fs from "node:fs";
import * as os from "node:os";
import { WebSocketServer } from "ws";
import { WSHandler } from "./helpers/WS.js";
import { RESTHandler } from "./helpers/REST.js";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";

import type { SSLOptions } from "./types.js";

export class DatabaseServer {
  onStdout = (data: string) => console.log(data);

  constructor(options: { port: number; auth: string; ssl?: SSLOptions }) {
    const { port, auth, ssl } = options;

    if (options.ssl && !(options.ssl.cert && options.ssl.key))
      throw new Error("If you decide to provide an SSL configuration, you must provide both a certificate and a key");

    let ip: string;
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces))
      for (const iface of interfaces[name]!) if (iface.family === "IPv4" && !iface.internal) ip = iface.address;

    ip ||= "localhost";

    const SSL: SSLOptions | null = ssl
      ? {
          ...ssl,
          key: fs.readFileSync(ssl.key).toString(),
          cert: fs.readFileSync(ssl.cert).toString(),
          ca: ssl.ca
            ? Array.isArray(ssl.ca)
              ? ssl.ca.map((ca) => fs.readFileSync(ca)).toString()
              : fs.readFileSync(ssl.ca).toString()
            : undefined,
          dhparam: ssl.dhparam ? fs.readFileSync(ssl.dhparam).toString() : undefined
        }
      : null;

    const server = SSL ? createHttpsServer(SSL, RESTHandler) : createHttpServer(RESTHandler);

    server.listen(options.port, () =>
      this.onStdout(
        `HTTP${SSL ? "S" : ""} server started on port ${port} | URI : http${SSL ? "s" : ""}://${ip}:${port}/stats`
      )
    );

    const wss = new WebSocketServer({
      server: server,
      verifyClient: (info, callback) =>
        info.req.headers["authorization"] === auth ? callback(true) : callback(false, 401, "Unauthorized")
    });

    wss.on("listening", async () =>
      this.onStdout(`WS${SSL ? "S" : ""} server started on port ${port} | URI : ${SSL ? "wss" : "ws"}://${ip}:${port}`)
    );

    wss.on("connection", (ws, req) => {
      ws.on("message", WSHandler.bind(null, ws));
      ws.on("error", (err) => console.error(JSON.stringify(err.stack)));
      ws.on("close", () => this.onStdout(`Connection closed from ${req.socket.remoteAddress}`));
      this.onStdout(`Established a new connection established from ${req.socket.remoteAddress}`);
    });
  }
}

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

  get #ip() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces))
      for (const iface of interfaces[name]!) if (iface.family === "IPv4" && !iface.internal) return iface.address;

    return "localhost";
  }

  constructor(options: { port: number; auth: string; ssl?: SSLOptions }) {
    if (options.ssl && !(options.ssl.cert && options.ssl.key))
      throw new Error("If you decide to provide an SSL configuration, you must provide both a certificate and a key");

    const sslConfig: Partial<SSLOptions> | undefined = options.ssl
      ? {
          ...options.ssl,
          key: fs.readFileSync(options.ssl.key).toString(),
          cert: fs.readFileSync(options.ssl.cert).toString(),
          ca: options.ssl.ca
            ? Array.isArray(options.ssl.ca)
              ? options.ssl.ca.map((ca) => fs.readFileSync(ca)).toString()
              : fs.readFileSync(options.ssl.ca).toString()
            : undefined,
          dhparam: options.ssl.dhparam ? fs.readFileSync(options.ssl.dhparam).toString() : undefined
        }
      : undefined;

    const server = sslConfig ? createHttpsServer(sslConfig, RESTHandler) : createHttpServer(RESTHandler);

    server.listen(options.port, () =>
      this.onStdout(
        `HTTP${sslConfig ? "S" : ""} server started on port ${options.port}` +
          ` | ` +
          `URI : http${sslConfig ? "s" : ""}://${this.#ip}:${options.port}/stats`
      )
    );

    const wss = new WebSocketServer({
      server: server,
      verifyClient: (info, callback) =>
        info.req.headers["authorization"] === options.auth ? callback(true) : callback(false, 401, "Unauthorized")
    });

    wss.on("listening", async () =>
      this.onStdout(
        `WS${sslConfig ? "S" : ""} server started on port ${options.port} | URI : ${sslConfig ? "wss" : "ws"}://${
          this.#ip
        }:${options.port}`
      )
    );

    wss.on("connection", (ws, req) => {
      ws.on("message", WSHandler.bind(null, ws));
      ws.on("error", (err) => console.error(JSON.stringify(err.stack)));
      ws.on("close", () => this.onStdout(`Connection closed from ${req.socket.remoteAddress}`));
      this.onStdout(`Established a new connection established from ${req.socket.remoteAddress}`);
    });
  }
}

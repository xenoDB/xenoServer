/** @format */

import * as fs from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { CoreDatabase } from "./coreDatabase.js";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";

import type { Server } from "node:http";
import type { Payload, SSLOptions } from "./types.js";
import type { RawData, WebSocket, ServerOptions } from "ws";
import type { IncomingMessage, ServerResponse } from "node:http";

export class DatabaseServer {
  #server?: Server;
  #wss: WebSocketServer;
  #sslConfig?: SSLOptions;
  #databases = new Map<string, CoreDatabase<unknown>>();

  constructor(options: { port: number; auth: string; ssl?: SSLOptions }) {
    const verifyClient: NonNullable<ServerOptions["verifyClient"]> = (info, callback) =>
      info.req.headers["authorization"] === options.auth ? callback(true) : callback(false, 401, "Unauthorized");

    if (options.ssl && !(options.ssl.cert && options.ssl.key))
      throw new Error("If you decide to provide an SSL configuration, you must provide both a certificate and a key");

    this.#sslConfig = options.ssl
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

    this.#server = this.#sslConfig
      ? createHttpsServer(this.#sslConfig, this.#handleRESTRequests.bind(this))
      : createHttpServer(this.#handleRESTRequests.bind(this));

    this.#server.listen(options.port, () =>
      console.log(
        `HTTP${this.#sslConfig ? "S" : ""} server started on port ${options.port}` +
          ` | ` +
          `URI : http${this.#sslConfig ? "s" : ""}://${this.#ip}:${options.port}/stats`
      )
    );

    this.#wss = new WebSocketServer({ server: this.#server, verifyClient });

    this.#wss.on("listening", async () =>
      console.log(
        `WS${this.#sslConfig ? "S" : ""} server started on port ${options.port} | URI : ${
          this.#sslConfig ? "wss" : "ws"
        }://${this.#ip}:${options.port}`
      )
    );

    this.#wss.on("connection", (ws, req) => {
      ws.on("error", (err) => console.error(JSON.stringify(err.stack)));
      ws.on("message", async (message) => this.#handleWebsocketMessages(ws, message));
      ws.on("close", () => console.log(`Connection closed from ${req.socket.remoteAddress}`));
      console.log(`Established a new connection established from ${req.socket.remoteAddress}`);
    });
  }

  get #ip() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces))
      for (const iface of interfaces[name]!) if (iface.family === "IPv4" && !iface.internal) return iface.address;

    return "localhost";
  }

  #handleRESTRequests(req: IncomingMessage, res: ServerResponse) {
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

  #validatePayload(payload: Payload) {
    if (!("path" in payload)) throw new Error("Missing path");
    if (payload.path === ".") throw new Error("Invalid path !! Path cannot be '.'");
    if (payload.path.includes("..")) throw new Error("Invalid path !! Path cannot contain '..'");

    if (!("method" in payload)) throw new Error("Missing method");
    if (!("requestId" in payload)) throw new Error("Missing requestId");

    switch (payload.method) {
      case "ALL":
        break;

      case "HAS":
      case "GET":
      case "DELETE":
        if (!("key" in payload)) throw new Error("Missing key");
        if (typeof payload.key !== "string") throw new Error("Invalid key");
        break;

      case "SET":
        if (!("key" in payload)) throw new Error("Missing key");
        if (typeof payload.key !== "string") throw new Error("Invalid key");
        if (!("value" in payload)) throw new Error("Missing value");
        break;

      case "GET_MANY":
      case "DELETE_MANY":
        if (!("keys" in payload)) throw new Error("Missing keys");
        if (!Array.isArray(payload.keys)) throw new Error("Invalid keys");
        payload.keys.forEach((key) => {
          if (typeof key !== "string") throw new Error("Invalid key");
        });
        break;

      case "SET_MANY":
        if (!("data" in payload)) throw new Error("Missing data");
        if (!Array.isArray(payload.data)) throw new Error("Invalid data");
        payload.data.forEach((element) => {
          if (!("key" in element)) throw new Error("Missing key");
          if (!("value" in element)) throw new Error("Missing value");
          if (typeof element.key !== "string") throw new Error("Invalid key");
        });
        break;
    }
  }

  async #handleWebsocketMessages(ws: WebSocket, message: RawData) {
    const PL: Payload = JSON.parse(message.toString());

    try {
      this.#validatePayload(PL);
    } catch (e) {
      return ws.send(JSON.stringify({ requestId: PL.requestId, error: e.message }));
    }

    PL.path = join("./", "storage", PL.path);

    const db = this.#databases.get(PL.path) || this.#databases.set(PL.path, new CoreDatabase(PL.path)).get(PL.path)!;

    switch (PL.method) {
      case "ALL":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.all() }));
        break;

      case "HAS":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.has(PL.key) }));
        break;

      case "GET":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.get(PL.key) }));
        break;

      case "DELETE":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.delete(PL.key) }));
        break;

      case "GET_MANY":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.getMany(PL.keys) }));
        break;

      case "SET_MANY":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.setMany(PL.data) }));
        break;

      case "DELETE_MANY":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.deleteMany(PL.keys) }));
        break;

      case "SET":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.set(PL.key, PL.value) }));
        break;
    }

    db.recoveryEngine.recordRequest(PL);
  }
}

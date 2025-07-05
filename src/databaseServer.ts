/** @format */

import * as fs from "node:fs";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { createServer } from "node:https";
import { CoreDatabase } from "./coreDatabase.js";

import type { Server } from "node:http";
import type { Payload, SSLOptions } from "./types.js";
import type { RawData, WebSocket, ServerOptions } from "ws";

export class DatabaseServer {
  #server?: Server;
  #wss: WebSocketServer;
  #databases = new Map<string, CoreDatabase<unknown>>();

  constructor(options: { port: number; auth: string; ssl?: SSLOptions }) {
    const verifyClient: NonNullable<ServerOptions["verifyClient"]> = (info, callback) =>
      info.req.headers["authorization"] === options.auth ? callback(true) : callback(false, 401, "Unauthorized");

    if (options.ssl) {
      if (options.ssl.dhparam && !fs.existsSync(options.ssl.dhparam))
        throw new Error(`No SSL DH parameter found at path : ${options.ssl.dhparam}`);

      if (options.ssl.ca && typeof options.ssl.ca === "string" && !fs.existsSync(options.ssl.ca))
        throw new Error(`No SSL CA found at path : ${options.ssl.ca}`);

      if (!fs.existsSync(options.ssl.key)) throw new Error(`No SSL key found at path : ${options.ssl.key}`);

      if (options.ssl.ca && Array.isArray(options.ssl.ca))
        for (const ca of options.ssl.ca) if (!fs.existsSync(ca)) throw new Error(`No SSL CA found at path : ${ca}`);

      if (!fs.existsSync(options.ssl.cert)) throw new Error(`No SSL certificate found at path : ${options.ssl.cert}`);

      const sslConfig: Partial<SSLOptions> = {
        key: fs.readFileSync(options.ssl.key).toString(),
        cert: fs.readFileSync(options.ssl.cert).toString()
      };

      if (options.ssl.ca)
        sslConfig.ca = Array.isArray(options.ssl.ca)
          ? options.ssl.ca.map((ca) => fs.readFileSync(ca)).toString()
          : fs.readFileSync(options.ssl.ca).toString();

      if (options.ssl.ciphers) sslConfig.ciphers = options.ssl.ciphers;
      if (options.ssl.passphrase) sslConfig.passphrase = options.ssl.passphrase;
      if (options.ssl.requestCert) sslConfig.requestCert = options.ssl.requestCert;
      if (options.ssl.secureProtocol) sslConfig.secureProtocol = options.ssl.secureProtocol;
      if (options.ssl.honorCipherOrder) sslConfig.honorCipherOrder = options.ssl.honorCipherOrder;
      if (options.ssl.dhparam) sslConfig.dhparam = fs.readFileSync(options.ssl.dhparam).toString();
      if (options.ssl.rejectUnauthorized) sslConfig.rejectUnauthorized = options.ssl.rejectUnauthorized;

      this.#server = createServer(sslConfig).listen(options.port);
    }

    this.#wss = new WebSocketServer(
      this.#server ? { server: this.#server, verifyClient } : { port: options.port, verifyClient }
    );

    this.#wss.on("listening", async () => console.log(`WSS started on port ${options.port}`));

    this.#wss.on("connection", (ws, req) => {
      ws.on("error", (err) => console.error(JSON.stringify(err.stack)));
      ws.on("message", async (message) => this.#handleMessage(ws, message));
      ws.on("close", () => console.log(`Connection closed from ${req.socket.remoteAddress}`));
      console.log(`Established a new connection established from ${req.socket.remoteAddress}`);
    });
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

  async #handleMessage(ws: WebSocket, message: RawData) {
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

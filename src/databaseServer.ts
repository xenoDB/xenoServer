/** @format */

import * as fs from "node:fs";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { CoreDatabase } from "./coreDatabase.js";

import type { Payload } from "./types.js";
import type { RawData, WebSocket } from "ws";

export class DatabaseServer {
  #wss: WebSocketServer;
  #databases = new Map<string, CoreDatabase<unknown>>();

  constructor(options: { port: number; auth: string }) {
    this.#wss = new WebSocketServer({
      port: options.port,
      verifyClient: (info, callback) =>
        info.req.headers["authorization"] === options.auth ? callback(true) : callback(false, 401, "Unauthorized")
    });

    this.#wss.on("connection", (ws, req) => {
      ws.on("error", (err) => console.error(JSON.stringify(err.stack)));
      ws.on("message", async (message) => this.#handleMessage(ws, message));
      ws.on("close", () => console.log(`Connection closed from ${req.socket.remoteAddress}`));
      console.log(`Established a new connection established from ${req.socket.remoteAddress}`);
    });

    this.#wss.on("listening", async () => console.log(`Server started on port ${options.port}`));
  }

  #validatePayload(payload: Payload) {
    if (!("path" in payload)) throw new Error("Missing path");
    if (!("method" in payload)) throw new Error("Missing method");
    if (!("requestId" in payload)) throw new Error("Missing requestId");

    if (!payload.path || payload.path === "." || payload.path === "..") throw new Error("Invalid path");

    switch (payload.method) {
      case "ALL":
      case "NUKE":
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

    PL.path = join(
      "./",
      "storage",
      !PL.path || PL.path === "." || PL.path.includes("..") ? "( Uncategorized )" : PL.path
    );

    const db = this.#databases.get(PL.path) || this.#databases.set(PL.path, new CoreDatabase(PL.path)).get(PL.path)!;

    switch (PL.method) {
      case "NUKE":
        const exists = fs.existsSync(PL.path);
        if (exists) fs.rmSync(PL.path, { recursive: true });
        ws.send(JSON.stringify({ requestId: PL.requestId, data: exists }));
        this.#databases.set(PL.path, new CoreDatabase(PL.path));
        break;

      case "ALL":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.all() }));
        break;

      case "HAS":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.has(PL.key) }));
        break;

      case "GET":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.get(PL.key) }));
        break;

      case "SET":
        ws.send(JSON.stringify({ requestId: PL.requestId, data: db.set(PL.key, PL.value) }));
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
    }

    db.recoveryEngine.recordRequest(PL);
  }
}

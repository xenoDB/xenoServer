/** @format */

import { join } from "path";
import { CoreDatabase } from "../coreDatabase";
import { validatePayload } from "../helpers/validatePayload";

import type { Payload } from "../types";
import type { WebSocket, RawData } from "ws";

const databases = new Map<string, CoreDatabase<unknown>>();

export async function WSHandler(ws: WebSocket, message: RawData) {
  const PL: Payload = JSON.parse(message.toString());

  try {
    validatePayload(PL);
  } catch (e) {
    return ws.send(JSON.stringify({ requestId: PL.requestId, error: e.message }));
  }

  PL.path = join("./", "storage", PL.path);

  const db = databases.get(PL.path) || databases.set(PL.path, new CoreDatabase(PL.path)).get(PL.path)!;

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

/** @format */

import { join } from "path";
import { CoreDatabase } from "../coreDatabase";

import type { Payload } from "../types";
import type { WebSocket, RawData } from "ws";

const databases = new Map<string, CoreDatabase<unknown>>();

export async function WSHandler(ws: WebSocket, message: RawData) {
  const PL: Payload = JSON.parse(message.toString());

  PL.path = join("./", "storage", PL.path);

  const db = databases.get(PL.path) || databases.set(PL.path, new CoreDatabase(PL.path)).get(PL.path)!;

  function wrapWSResponse<R>(fn: () => R) {
    try {
      const result = fn();
      ws.send(JSON.stringify({ requestId: PL.requestId, data: result }));
    } catch (error) {
      ws.send(JSON.stringify({ requestId: PL.requestId, error }));
    }
  }

  switch (PL.method) {
    case "ALL":
      wrapWSResponse(() => db.all());
      break;

    case "HAS":
      wrapWSResponse(() => db.has(PL.key));
      break;

    case "GET":
      wrapWSResponse(() => db.get(PL.key));
      break;

    case "DELETE":
      wrapWSResponse(() => db.delete(PL.key));
      break;

    case "GET_MANY":
      wrapWSResponse(() => db.getMany(PL.keys));
      break;

    case "SET_MANY":
      wrapWSResponse(() => db.setMany(PL.data));
      break;

    case "DELETE_MANY":
      wrapWSResponse(() => db.deleteMany(PL.keys));
      break;

    case "SET":
      wrapWSResponse(() => db.set(PL.key, PL.value));
      break;

    case "POP":
      wrapWSResponse(() => (<CoreDatabase<any[]>>db).pop(PL.key));
      break;

    case "SHIFT":
      wrapWSResponse(() => (<CoreDatabase<any[]>>db).shift(PL.key));
      break;

    case "PUSH":
      wrapWSResponse(() => (<CoreDatabase<any[]>>db).push(PL.key, PL.value));
      break;

    case "UNSHIFT":
      wrapWSResponse(() => (<CoreDatabase<any[]>>db).unshift(PL.key, PL.value));
      break;

    case "SLICE":
      wrapWSResponse(() => (<CoreDatabase<any[]>>db).slice(PL.key, PL.start, PL.end));
      break;
  }
}

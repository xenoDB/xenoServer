/** @format */

import type { Payload } from "../types";

export function validatePayload(payload: Payload) {
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

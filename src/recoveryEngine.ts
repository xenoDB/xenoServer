/** @format */

import * as fs from "node:fs";
import { CoreDatabase } from "./coreDatabase.js";
import { ThreadedFileWriter } from "./threadedFileWriter.js";

import type { Payload } from "./types.js";

export class RecoveryEngine<T> {
  #logFile: string;
  #requestCount = 500;
  #database: CoreDatabase<T>;
  #threadedFileWriter = new ThreadedFileWriter();

  constructor(database: CoreDatabase<T>) {
    this.#database = database;
    this.#logFile = `${database.path}/logs.csv`;
  }

  async run() {
    if (!fs.existsSync(this.#logFile))
      return fs.writeFileSync(this.#logFile, "Timestamp,\tRequestId,\tMethod,\tKey,\tValue\t\n");

    const requests = fs
      .readFileSync(this.#logFile, "utf-8")
      .trim()
      .split("\n")
      .splice(0)
      .map((line) => {
        const _ = line.split(",\t");
        return {
          timestamp: _[0]!,
          requestId: _[1]!,
          method: _[2]!,
          key: _[3],
          value: _[4]
        };
      });

    requests
      .filter((req) => req.method === "SET" || req.method === "DELETE")
      .slice(-this.#requestCount)
      .forEach((request) => {
        if (request.method === "SET") this.#database.set(request.key!, JSON.parse(request.value!));
        else if (request.method === "DELETE") this.#database.delete(request.key!);
      });

    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000;

    fs.writeFileSync(
      this.#logFile,
      "Timestamp,\tRequestId,\tMethod,\tKey,\tValue\t\n" +
        requests
          .filter((req) => parseInt(req.timestamp) >= threshold)
          .map((req) => `${req.timestamp},\t${req.requestId},\t${req.method},\t${req.key || ""},\t${req.value || ""}`)
          .join("\n") +
        "\n"
    );
  }

  recordRequest(PL: Payload) {
    const logs: string[] = [];
    const prefix = `${Date.now()},\t${PL.requestId},\t`;

    switch (PL.method) {
      case "ALL":
        logs.push(prefix + `ALL`);
        break;

      case "GET":
      case "HAS":
      case "DELETE":
        logs.push(prefix + `${PL.method},\t${PL.key}`);
        break;

      case "SET_MANY":
        for (const { key, value } of Object.values(PL.data))
          logs.push(prefix + `SET,\t${key},\t${JSON.stringify(value)}`);
        break;

      case "SET":
        logs.push(prefix + `SET,\t${PL.key},\t${JSON.stringify(PL.value)}`);
        break;

      case "GET_MANY":
      case "DELETE_MANY":
        for (const key of PL.keys) logs.push(prefix + `${PL.method.split("_")[0]},\t${key}`);
        break;
    }

    this.#threadedFileWriter.appendFile(this.#logFile, logs.join("\n") + "\n");
  }
}

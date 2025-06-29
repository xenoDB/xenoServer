/** @format */

import * as fs from "fs";
import { CoreDatabase } from "./coreDatabase.js";
import { ThreadedFileWriter } from "./threadedFileWriter.js";

import type { Payload } from "./types.js";

export class RecoveryEngine<T> {
  #logFile: string;
  #requestCount = 250;
  #database: CoreDatabase<T>;
  #threadedFileWriter = new ThreadedFileWriter();

  constructor(database: CoreDatabase<T>) {
    this.#database = database;
    this.#logFile = `${database.path}/logs.csv`;
  }

  async run() {
    if (!fs.existsSync(this.#logFile)) {
      fs.writeFileSync(this.#logFile, "Timestamp,\tRequestId,\tMethod,\tKey,\tValue\t\n");
      return console.log(`Skipping RE !!! ${this.#logFile} is N/A !!!`);
    }

    const start = Date.now();
    const requests = fs
      .readFileSync(this.#logFile, "utf-8")
      .trim()
      .split("\n")
      .splice(0)
      .filter((req) => req.includes("\tSET,") || req.includes("\tDELETE,"))
      .slice(-this.#requestCount);

    for (const request of requests) {
      const [, , , method, key, value] = request.split(",\t");

      method === "SET" ? this.#database.set(key!, JSON.parse(value!)) : this.#database.delete(key!);
    }

    console.log(`RE completed running the last ${requests.length} requests in ${Date.now() - start}ms`, "success");
  }

  recordRequest(PL: Payload) {
    const logs: string[] = [];
    const prefix = `${Date.now()},\t${PL.requestId},\t`;

    switch (PL.method) {
      case "ALL":
        logs.push(prefix + `ALL`);
        break;

      case "GET":
        logs.push(prefix + `GET,\t${PL.key}`);
        break;

      case "DELETE":
        logs.push(prefix + `DELETE,\t${PL.key}`);
        break;

      case "GET_MANY":
        for (const key of PL.keys) logs.push(prefix + `GET,\t${key}`);
        break;

      case "SET_MANY":
        for (const { key, value } of Object.values(PL.data))
          logs.push(prefix + `SET,\t${key},\t${JSON.stringify(value)}`);
        break;

      case "DELETE_MANY":
        for (const key of PL.keys) logs.push(prefix + `DELETE,\t${key}`);
        break;

      case "SET":
        logs.push(prefix + `SET,\t${PL.key},\t${JSON.stringify(PL.value)}`);
        break;
    }

    this.#threadedFileWriter.appendFile(this.#logFile, logs.join("\n") + "\n");
  }
}

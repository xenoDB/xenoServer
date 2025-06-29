/** @format */

import { resolve } from "node:path";
import { Worker } from "worker_threads";

export class ThreadedFileWriter {
  worker: Worker;

  appendFile(path: string, data: string) {
    this.worker.postMessage({ path, data });
  }

  constructor() {
    this.worker = new Worker(resolve(import.meta.dirname, resolve(import.meta.dirname, "./worker.js")));
    this.worker.on("error", (err) => console.error("FileWriter error:", err));
  }
}

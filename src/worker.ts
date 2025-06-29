/** @format */

import * as fs from "node:fs";
import { parentPort } from "worker_threads";

parentPort?.on("message", ({ path, data }) => fs.appendFileSync(path, data));

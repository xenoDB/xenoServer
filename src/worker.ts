/** @format */

import * as fs from "node:fs";
import { parentPort } from "node:worker_threads";

parentPort?.on("message", ({ path, data }) => fs.appendFileSync(path, data));

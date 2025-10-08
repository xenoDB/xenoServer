import * as fs2 from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import * as os from 'node:os';
import { WebSocketServer } from 'ws';
import { join } from 'path';
import { createServer as createServer$1 } from 'node:http';
import { createServer } from 'node:https';

// src/coreDatabase.ts
var ThreadedFileWriter = class {
  worker;
  appendFile(path, data) {
    this.worker.postMessage({ path, data });
  }
  constructor() {
    this.worker = new Worker(resolve(import.meta.dirname || __dirname, "./worker.mjs"));
    this.worker.on("error", (err) => console.error("FileWriter error:", err));
  }
};

// src/recoveryEngine.ts
var RecoveryEngine = class {
  #logFile;
  #requestCount = 500;
  #database;
  #threadedFileWriter = new ThreadedFileWriter();
  constructor(database) {
    this.#database = database;
    this.#logFile = `${database.path}/logs.csv`;
  }
  async run() {
    if (!fs2.existsSync(this.#logFile))
      return fs2.writeFileSync(this.#logFile, "Timestamp,	RequestId,	Method,	Key,	Value	\n");
    const requests = fs2.readFileSync(this.#logFile, "utf-8").trim().split("\n").splice(0).map((line) => {
      const _ = line.split(",	");
      return {
        timestamp: _[0],
        requestId: _[1],
        method: _[2],
        key: _[3],
        value: _[4]
      };
    });
    requests.filter((req) => req.method === "SET" || req.method === "DELETE").slice(-this.#requestCount).forEach((request) => {
      if (request.method === "SET") this.#database.set(request.key, JSON.parse(request.value));
      else if (request.method === "DELETE") this.#database.delete(request.key);
    });
    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1e3;
    fs2.writeFileSync(
      this.#logFile,
      "Timestamp,	RequestId,	Method,	Key,	Value	\n" + requests.filter((req) => parseInt(req.timestamp) >= threshold).map((req) => `${req.timestamp},	${req.requestId},	${req.method},	${req.key || ""},	${req.value || ""}`).join("\n") + "\n"
    );
  }
  recordRequest(PL) {
    const logs = [];
    const prefix = `${Date.now()},	${PL.requestId},	`;
    switch (PL.method) {
      case "ALL":
        logs.push(prefix + `ALL`);
        break;
      case "HAS":
      case "DELETE":
        logs.push(prefix + `${PL.method},	${PL.key}`);
        break;
      case "SET_MANY":
        for (const { key, value } of Object.values(PL.data))
          logs.push(prefix + `SET,	${key},	${JSON.stringify(value)}`);
        break;
      case "SET":
        logs.push(prefix + `SET,	${PL.key},	${JSON.stringify(PL.value)}`);
        break;
      case "DELETE_MANY":
        for (const key of PL.keys) logs.push(prefix + `DELETE,	${key}`);
        break;
    }
    this.#threadedFileWriter.appendFile(this.#logFile, logs.join("\n") + "\n");
  }
};

// src/coreDatabase.ts
var CoreDatabase = class {
  #maxKeysInFile = 100;
  #isWriting = false;
  #debounceCount = 0;
  #debounceTime = 250;
  #maxDebounceCount = 250;
  #writeQueue = /* @__PURE__ */ new Set();
  #path;
  #timer;
  #recoveryEngine;
  #index;
  #cache = /* @__PURE__ */ new Map();
  get path() {
    return this.#path;
  }
  get recoveryEngine() {
    return this.#recoveryEngine;
  }
  constructor(path) {
    this.#path = path;
    this.#recoveryEngine = new RecoveryEngine(this);
    if (!fs2.existsSync(this.#path)) fs2.mkdirSync(this.#path, { recursive: true });
    if (!fs2.existsSync(`${this.#path}/index.json`)) fs2.writeFileSync(`${this.#path}/index.json`, "{}");
    this.#index = JSON.parse(fs2.readFileSync(`${this.#path}/index.json`, "utf-8"));
    for (const [fileName] of Object.entries(this.#index))
      this.#cache.set(fileName, JSON.parse(fs2.readFileSync(`${this.#path}/${fileName}`, "utf-8")));
    this.#recoveryEngine.run();
  }
  // ----------------------------------------------- Private Helper Functions -----------------------------------------------
  #getLastFile() {
    const files = Object.keys(this.#index);
    const lastFile = files[files.length - 1];
    return lastFile;
  }
  #checkNumberOfKeysInFile(fileName) {
    const keysInFile = this.#index[fileName];
    const numberOfKeysInFile = keysInFile.length;
    return numberOfKeysInFile;
  }
  #searchIndexForKey(key) {
    for (const [fileName, keysInFile] of Object.entries(this.#index))
      if (keysInFile.includes(key)) return { fileName, keysInFile };
  }
  #lookforSpaciousFile() {
    for (const [fileName, keysInFile] of Object.entries(this.#index))
      if (keysInFile.length < this.#maxKeysInFile) return fileName;
  }
  #createFile() {
    const fileName = `data_${Object.keys(this.#index).length + 1}.json`;
    fs2.writeFileSync(`${this.#path}/${fileName}`, JSON.stringify({}));
    this.#index[fileName] = [];
    return fileName;
  }
  #getSuitableFile() {
    const lastFile = this.#lookforSpaciousFile() || this.#getLastFile() || this.#createFile();
    if (this.#checkNumberOfKeysInFile(lastFile) >= this.#maxKeysInFile) return this.#createFile();
    else return lastFile;
  }
  #write() {
    const _ = [...this.#writeQueue];
    this.#writeQueue.clear();
    this.#isWriting = true;
    for (const file of _) fs2.writeFileSync(`${this.#path}/${file}`, JSON.stringify(this.#cache.get(file)));
    fs2.writeFileSync(`${this.#path}/index.json`, JSON.stringify(this.#index));
    this.#isWriting = false;
  }
  #debouncedWrite() {
    this.#debounceCount++;
    if (this.#debounceCount >= this.#maxDebounceCount) return this.#debounceCount = 0, this.#write();
    this.#timer?.refresh();
    this.#timer ||= setTimeout(() => this.#isWriting ? this.#debouncedWrite() : this.#write(), this.#debounceTime);
  }
  // ------------------------------------------------------------------------------------------------------------------------
  has(key) {
    return !!this.get(key);
  }
  get(key) {
    const res = this.#searchIndexForKey(key);
    return res ? this.#cache.get(res.fileName)[key] : null;
  }
  getMany(keys) {
    return keys.map((key) => this.get(key));
  }
  set(key, value, isInvokerInternal = false) {
    const res = this.#searchIndexForKey(key);
    const file = res ? res.fileName : this.#getSuitableFile();
    if (!res?.keysInFile?.includes(key)) (this.#index[file] ||= []).push(key);
    const data = this.#cache.get(file) ?? this.#cache.set(file, {}).get(file);
    if (!isInvokerInternal) {
      if (data[key] == value) return value;
    }
    data[key] = value;
    this.#writeQueue.add(file);
    this.#debouncedWrite();
    return value;
  }
  setMany(data) {
    return data.map(({ key, value }) => this.set(key, value));
  }
  delete(key) {
    const res = this.#searchIndexForKey(key);
    if (!res) return false;
    const file = res.fileName;
    const data = this.#cache.get(file);
    delete data[key];
    this.#index[file] = this.#index[file].filter((k) => k !== key);
    this.#writeQueue.add(file);
    this.#debouncedWrite();
    return true;
  }
  deleteMany(keys) {
    return keys.map((key) => this.delete(key));
  }
  all() {
    return this.#cache.values().reduce(
      (prev, curr) => {
        for (const [key, value] of Object.entries(curr)) prev[key] = value;
        return prev;
      },
      {}
    );
  }
  shift = (key) => {
    const array = this.get(key) || [];
    if (!Array.isArray(array)) throw new Error("Stored value is not an array.");
    const shifted = array.shift();
    this.set(key, array, true);
    return { length: array.length, element: shifted };
  };
  unshift = (key, dataToPush) => {
    const array = this.get(key) || [];
    if (!Array.isArray(array)) throw new Error("Stored value is not an array.");
    array.unshift(dataToPush);
    this.set(key, array, true);
    return { length: array.length, element: dataToPush };
  };
  pop = (key) => {
    const array = this.get(key) || [];
    if (!Array.isArray(array)) throw new Error("Stored value is not an array.");
    const popped = array.pop();
    this.set(key, array, true);
    return { length: array.length, element: popped };
  };
  push = (key, dataToPush) => {
    const array = this.get(key) || [];
    if (!Array.isArray(array)) throw new Error("Stored value is not an array.");
    array.push(dataToPush);
    this.set(key, array, true);
    return { length: array.length, element: dataToPush };
  };
  slice = (key, start, end) => {
    const array = this.get(key);
    if (!array) return null;
    if (!Array.isArray(array)) throw new Error("Stored value is not an array.");
    return array.slice(start, end);
  };
};
var databases = /* @__PURE__ */ new Map();
async function WSHandler(ws, message) {
  const PL = JSON.parse(message.toString());
  PL.path = join("./", "storage", PL.path);
  const db = databases.get(PL.path) || databases.set(PL.path, new CoreDatabase(PL.path)).get(PL.path);
  function wrapWSResponse(fn) {
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
      wrapWSResponse(() => db.pop(PL.key));
      break;
    case "SHIFT":
      wrapWSResponse(() => db.shift(PL.key));
      break;
    case "PUSH":
      wrapWSResponse(() => db.push(PL.key, PL.value));
      break;
    case "UNSHIFT":
      wrapWSResponse(() => db.unshift(PL.key, PL.value));
      break;
    case "SLICE":
      wrapWSResponse(() => db.slice(PL.key, PL.start, PL.end));
      break;
  }
  db.recoveryEngine.recordRequest(PL);
}

// src/handlers/REST.ts
function RESTHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  switch (req.method) {
    case "GET":
      switch (req.url) {
        case "/stats":
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              memoryUsage: Object.fromEntries(
                Object.entries(process.memoryUsage()).map(([key, value]) => [key, `${value / (1024 * 1024)} MB`])
              )
            })
          );
          break;
        default:
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not Found" }));
          break;
      }
      break;
    default:
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      break;
  }
}
var DatabaseServer = class {
  onStdout = (data) => console.log(data);
  constructor(options) {
    const { port, auth, ssl } = options;
    if (options.ssl && !(options.ssl.cert && options.ssl.key))
      throw new Error("If you decide to provide an SSL configuration, you must provide both a certificate and a key");
    let ip;
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces))
      for (const iface of interfaces[name]) if (iface.family === "IPv4" && !iface.internal) ip = iface.address;
    ip ||= "localhost";
    const SSL = ssl ? {
      ...ssl,
      key: fs2.readFileSync(ssl.key).toString(),
      cert: fs2.readFileSync(ssl.cert).toString(),
      ca: ssl.ca ? Array.isArray(ssl.ca) ? ssl.ca.map((ca) => fs2.readFileSync(ca)).toString() : fs2.readFileSync(ssl.ca).toString() : void 0,
      dhparam: ssl.dhparam ? fs2.readFileSync(ssl.dhparam).toString() : void 0
    } : null;
    const server = SSL ? createServer(SSL, RESTHandler) : createServer$1(RESTHandler);
    server.listen(
      options.port,
      () => this.onStdout(
        `HTTP${SSL ? "S" : ""} server started on port ${port} | URI : http${SSL ? "s" : ""}://${ip}:${port}`
      )
    );
    const wss = new WebSocketServer({
      server,
      verifyClient: (info, callback) => info.req.headers["authorization"] === auth ? callback(true) : callback(false, 401, "Unauthorized")
    });
    wss.on(
      "listening",
      async () => this.onStdout(`WS${SSL ? "S" : ""} server started on port ${port} | URI : ${SSL ? "wss" : "ws"}://${ip}:${port}`)
    );
    wss.on("connection", (ws, req) => {
      ws.on("message", WSHandler.bind(null, ws));
      ws.on("error", (err) => console.error(JSON.stringify(err.stack)));
      ws.on("close", () => this.onStdout(`Connection closed from ${req.socket.remoteAddress}`));
      this.onStdout(`Established a new connection established from ${req.socket.remoteAddress}`);
    });
  }
};

export { CoreDatabase, DatabaseServer };

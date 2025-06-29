<!-- @format -->

# 📦 File-Based WebSocket Database Documentation

## Overview

This project implements a lightweight file-based key-value database accessible via WebSocket. It supports CRUD operations, recovery from logs, and batched operations with debounce and threading optimizations.

---

## 📁 Folder Structure

```
.
├── coreDatabase.ts
├── databaseServer.ts
├── recoveryEngine.ts
├── threadedFileWriter.ts
├── types.ts
├── index.ts
└── storage/
```

---

## ✅ Features

- WebSocket API for real-time communication
- Automatic file-based sharding
- Request recovery using log files
- Debounced disk writing to prevent excessive I/O
- Multithreaded file logging using `worker_threads`
- Supports single and batch operations
- Authorization support

---

## 📘 `CoreDatabase<T>`

A generic file-backed database storing key-value pairs across multiple files.

### Methods

- `get(key: string): T | null`
  Returns a value by key.

- `getMany(keys: string[]): (T | null)[]`
  Fetch multiple values.

- `set(key: string, value: T): T`
  Insert or update a key-value pair.

- `setMany(data: { key: string; value: T }[]): T[]`
  Insert or update many items.

- `delete(key: string): boolean`
  Remove a key-value pair.

- `deleteMany(keys: string[]): boolean[]`
  Remove multiple keys.

- `all(): { [key: string]: T }`
  Get all key-value pairs.

### Constructor

```ts
new CoreDatabase(path: string)
```

---

## 🖁 `RecoveryEngine<T>`

Handles log-based recovery of the last 250 operations upon server start.

### Methods

- `run(): Promise<void>`
  Reads the last 250 `SET` or `DELETE` operations from a CSV log and replays them.

- `recordRequest(payload: Payload)`
  Logs incoming operations to a CSV file.

---

## 🧵 `ThreadedFileWriter`

A helper that offloads file logging to a worker thread to prevent blocking the main event loop.

### Methods

- `appendFile(path: string, data: string): void`

---

## 📡 `DatabaseServer`

Wraps a WebSocket server that listens for payload messages and applies them to the appropriate `CoreDatabase`.

### Constructor

```ts
new DatabaseServer({ port: number, auth: string });
```

### Internal Logic

- Validates incoming payload
- Routes to a `CoreDatabase` instance (per path)
- Calls respective `CoreDatabase` methods
- Responds with `{ requestId, data | error }`

---

## 📒 `Payload` Types

```ts
type Payload<T = unknown> =
  | { path: string; requestId: string; method: "ALL" }
  | { path: string; requestId: string; method: "SET"; key: string; value: T }
  | { path: string; requestId: string; method: "GET" | "DELETE"; key: string }
  | { path: string; requestId: string; method: "GET_MANY" | "DELETE_MANY"; keys: string[] }
  | { path: string; requestId: string; method: "SET_MANY"; data: { key: string; value: T }[] };
```

---

## 📂 Example Payload

```json
{
  "path": "mydb",
  "requestId": "12345",
  "method": "SET",
  "key": "username",
  "value": "chatgpt"
}
```

---

## 🔐 Authentication

Each WebSocket request must include a valid `Authorization` header matching the server's configured token.

```ts
verifyClient: (info, callback) => {
  const isAuthorized = info.req.headers["authorization"] === options.auth;
  callback(isAuthorized, isAuthorized ? undefined : 401, "Unauthorized");
};
```

---

## 🚀 Setup

```bash
node index.js
```

This starts a `DatabaseServer` on the configured port and prepares storage directories automatically.

---

## 🥺 Testing

Use any WebSocket client:

```js
const ws = new WebSocket("ws://localhost:PORT", {
  headers: {
    Authorization: "your-token"
  }
});

ws.send(
  JSON.stringify({
    path: "test",
    requestId: "uuid-1",
    method: "SET",
    key: "foo",
    value: "bar"
  })
);
```

---

## 📝 Notes

- Recovery logs are stored in `logs.csv` inside the database directory.
- Data is split across `data_N.json` files to reduce write load per file.
- `index.json` maps each key to its respective data file.
- File writes are batched and debounced for performance.
- Threaded log writing ensures minimal main thread blocking.

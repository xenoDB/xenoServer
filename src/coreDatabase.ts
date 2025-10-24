/** @format */

import * as fs from "node:fs";

import type * as Types from "./types.js";

export class CoreDatabase<T> {
  #maxKeysInFile = 100;

  #isWriting = false;
  #debounceCount = 0;
  #debounceTime = 250;
  #maxDebounceCount = 250;

  #writeQueue = new Set<string>();

  #path: string;
  #timer?: NodeJS.Timeout;
  #index: { [fileName: string]: string[] };

  #cache = new Map<string, { [key: string]: T }>();

  get path() {
    return this.#path;
  }

  constructor(path: string) {
    this.#path = path;

    if (!fs.existsSync(this.#path)) fs.mkdirSync(this.#path, { recursive: true });

    if (!fs.existsSync(`${this.#path}/index.json`)) fs.writeFileSync(`${this.#path}/index.json`, "{}");

    this.#index = JSON.parse(fs.readFileSync(`${this.#path}/index.json`, "utf-8"));

    for (const [fileName] of Object.entries(this.#index))
      this.#cache.set(fileName, JSON.parse(fs.readFileSync(`${this.#path}/${fileName}`, "utf-8")));
  }

  // ----------------------------------------------- Private Helper Functions -----------------------------------------------

  #getLastFile() {
    const files = Object.keys(this.#index);
    const lastFile = files[files.length - 1];
    return lastFile;
  }

  #checkNumberOfKeysInFile(fileName: string) {
    const keysInFile = this.#index[fileName];
    const numberOfKeysInFile = keysInFile!.length;
    return numberOfKeysInFile;
  }

  #searchIndexForKey(key: string) {
    for (const [fileName, keysInFile] of Object.entries(this.#index))
      if (keysInFile.includes(key)) return { fileName, keysInFile };
  }

  #lookforSpaciousFile() {
    for (const [fileName, keysInFile] of Object.entries(this.#index))
      if (keysInFile.length < this.#maxKeysInFile) return fileName;
  }

  #createFile() {
    const fileName = `data_${Object.keys(this.#index).length + 1}.json`;
    fs.writeFileSync(`${this.#path}/${fileName}`, JSON.stringify({}));
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

    for (const file of _) fs.writeFileSync(`${this.#path}/${file}`, JSON.stringify(this.#cache.get(file)));
    fs.writeFileSync(`${this.#path}/index.json`, JSON.stringify(this.#index));

    this.#isWriting = false;
  }

  #debouncedWrite() {
    this.#debounceCount++;

    if (this.#debounceCount >= this.#maxDebounceCount) return (this.#debounceCount = 0), this.#write();

    this.#timer?.refresh();

    this.#timer ||= setTimeout(() => (this.#isWriting ? this.#debouncedWrite() : this.#write()), this.#debounceTime);
  }

  // ------------------------------------------------------------------------------------------------------------------------

  has(key: string): boolean {
    return !!this.get(key);
  }

  get(key: string): T | null {
    const res = this.#searchIndexForKey(key);
    return res ? (this.#cache.get(res.fileName)![key] as T) : null;
  }

  getMany(keys: string[]): (T | null)[] {
    return keys.map((key) => this.get(key));
  }

  set(key: string, value: T, isInvokerInternal = false): T {
    const res = this.#searchIndexForKey(key);

    const file = res ? res.fileName : this.#getSuitableFile();

    if (!res?.keysInFile?.includes(key)) (this.#index[file] ||= []).push(key);

    const data = this.#cache.get(file) ?? this.#cache.set(file, {}).get(file)!;

    if (!isInvokerInternal) if (data[key] == value) return value;

    data[key] = value;

    this.#writeQueue.add(file);
    this.#debouncedWrite();

    return value;
  }

  setMany(data: { key: string; value: T }[]): T[] {
    return data.map(({ key, value }) => this.set(key, value));
  }

  delete(key: string): boolean {
    const res = this.#searchIndexForKey(key);

    if (!res) return false;

    const file = res.fileName;
    const data = this.#cache.get(file)!;

    delete data![key];

    this.#index[file] = this.#index[file]!.filter((k) => k !== key);

    this.#writeQueue.add(file);
    this.#debouncedWrite();

    return true;
  }

  deleteMany(keys: string[]): boolean[] {
    return keys.map((key) => this.delete(key));
  }

  all(): { [K: string]: T } {
    return this.#cache.values().reduce((prev, curr) => {
      for (const [key, value] of Object.entries(curr)) prev[key] = value;
      return prev;
    }, {} as { [K: string]: T });
  }

  shift = <Types.ShiftMethod<T>>((key: string) => {
    const array = (this.get(key) || []) as unknown;
    if (!Array.isArray(array)) throw new Error("Stored value is not an array.");
    const shifted = array.shift();
    this.set(key, array as T, true);
    return { length: array.length, element: shifted };
  });

  unshift = <Types.UnshiftMethod<T>>((key: string, dataToPush: unknown) => {
    const array = (this.get(key) || []) as any[];
    if (!Array.isArray(array)) throw new Error("Stored value is not an array.");
    array.unshift(dataToPush);
    this.set(key, <T>array, true);
    return { length: array.length, element: dataToPush };
  });

  pop = <Types.PopMethod<T>>((key: string) => {
    const array = (this.get(key) || []) as unknown;
    if (!Array.isArray(array)) throw new Error("Stored value is not an array.");
    const popped = array.pop();
    this.set(key, array as T, true);
    return { length: array.length, element: popped };
  });

  push = <Types.PushMethod<T>>((key: string, dataToPush: unknown) => {
    const array = (this.get(key) || []) as any[];
    if (!Array.isArray(array)) throw new Error("Stored value is not an array.");
    array.push(dataToPush);
    this.set(key, <T>array, true);
    return { length: array.length, element: dataToPush };
  });

  slice = <Types.SliceMethod<T>>((key: string, start: number, end?: number) => {
    const array = this.get(key) as unknown;
    if (!array) return null;
    if (!Array.isArray(array)) throw new Error("Stored value is not an array.");
    return array.slice(start, end);
  });
}

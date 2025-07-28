/** @format */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export interface BasePayload {
  path: string;
  requestId: string;
}

export interface SSLOptions {
  key: string;
  cert: string;
  ciphers?: string;
  dhparam?: string;
  passphrase?: string;
  requestCert?: boolean;
  ca?: string | string[];
  secureProtocol?: string;
  honorCipherOrder?: boolean;
  rejectUnauthorized?: boolean;
}

export type Payload<T = unknown> = Prettify<
  BasePayload &
    (
      | { method: "ALL" }
      //-------------------------------------------------------------------------
      | { method: "SET"; key: string; value: T }
      | { method: "GET" | "DELETE" | "HAS"; key: string }
      //-------------------------------------------------------------------------
      | { method: "GET_MANY" | "DELETE_MANY"; keys: string[] }
      | { method: "SET_MANY"; data: { key: string; value: T }[] }
      //-------------------------------------------------------------------------
      | { method: "POP"; key: string }
      | { method: "SHIFT"; key: string }
      //-------------------------------------------------------------------------
      | { method: "PUSH"; key: string; value: T }
      | { method: "UNSHIFT"; key: string; value: T }
      //-------------------------------------------------------------------------
      | { method: "SLICE"; key: string; start: number; end?: number }
    )
>;

export type ArrayElement<T> = T extends (infer U)[] ? U : never;

export type SliceMethod<T> = T extends any[]
  ? (key: string, start: number, end?: number) => ArrayElement<T>[] | null
  : never;

export type PushMethod<T> = T extends any[]
  ? (key: string, dataToPush: ArrayElement<T>) => { length: number; element: ArrayElement<T> }
  : never;

export type UnshiftMethod<T> = T extends any[]
  ? (key: string, dataToPush: ArrayElement<T>) => { length: number; element: ArrayElement<T> }
  : never;

export type PopMethod<T> = T extends any[] ? (key: string) => { length: number; element: ArrayElement<T> } : never;

export type ShiftMethod<T> = T extends any[] ? (key: string) => { length: number; element: ArrayElement<T> } : never;

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
      | { method: "SET"; key: string; value: T }
      | { method: "GET" | "DELETE" | "HAS"; key: string }
      | { method: "GET_MANY" | "DELETE_MANY"; keys: string[] }
      | { method: "SET_MANY"; data: { key: string; value: T }[] }
    )
>;

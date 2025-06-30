/** @format */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export interface BasePayload {
  path: string;
  requestId: string;
}

export type Payload<T = unknown> = Prettify<
  BasePayload &
    (
      | { method: "ALL" | "NUKE" }
      | { method: "SET"; key: string; value: T }
      | { method: "GET" | "DELETE" | "HAS"; key: string }
      | { method: "GET_MANY" | "DELETE_MANY"; keys: string[] }
      | { method: "SET_MANY"; data: { key: string; value: T }[] }
    )
>;

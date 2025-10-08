type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};
interface BasePayload {
    path: string;
    requestId: string;
}
interface SSLOptions {
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
type Payload<T = unknown> = Prettify<BasePayload & ({
    method: "ALL";
} | {
    method: "SET";
    key: string;
    value: T;
} | {
    method: "GET" | "DELETE" | "HAS";
    key: string;
} | {
    method: "GET_MANY" | "DELETE_MANY";
    keys: string[];
} | {
    method: "SET_MANY";
    data: {
        key: string;
        value: T;
    }[];
} | {
    method: "POP";
    key: string;
} | {
    method: "SHIFT";
    key: string;
} | {
    method: "PUSH";
    key: string;
    value: T;
} | {
    method: "UNSHIFT";
    key: string;
    value: T;
} | {
    method: "SLICE";
    key: string;
    start: number;
    end?: number;
})>;
type ArrayElement<T> = T extends (infer U)[] ? U : never;
type SliceMethod<T> = T extends any[] ? (key: string, start: number, end?: number) => ArrayElement<T>[] | null : never;
type PushMethod<T> = T extends any[] ? (key: string, dataToPush: ArrayElement<T>) => {
    length: number;
    element: ArrayElement<T>;
} : never;
type UnshiftMethod<T> = T extends any[] ? (key: string, dataToPush: ArrayElement<T>) => {
    length: number;
    element: ArrayElement<T>;
} : never;
type PopMethod<T> = T extends any[] ? (key: string) => {
    length: number;
    element: ArrayElement<T>;
} : never;
type ShiftMethod<T> = T extends any[] ? (key: string) => {
    length: number;
    element: ArrayElement<T>;
} : never;

declare class RecoveryEngine<T> {
    #private;
    constructor(database: CoreDatabase<T>);
    run(): Promise<void>;
    recordRequest(PL: Payload): void;
}

declare class CoreDatabase<T> {
    #private;
    get path(): string;
    get recoveryEngine(): RecoveryEngine<T>;
    constructor(path: string);
    has(key: string): boolean;
    get(key: string): T | null;
    getMany(keys: string[]): (T | null)[];
    set(key: string, value: T, isInvokerInternal?: boolean): T;
    setMany(data: {
        key: string;
        value: T;
    }[]): T[];
    delete(key: string): boolean;
    deleteMany(keys: string[]): boolean[];
    all(): {
        [K: string]: T;
    };
    shift: ShiftMethod<T>;
    unshift: UnshiftMethod<T>;
    pop: PopMethod<T>;
    push: PushMethod<T>;
    slice: SliceMethod<T>;
}

declare class DatabaseServer {
    onStdout: (data: string) => void;
    constructor(options: {
        port: number;
        auth: string;
        ssl?: SSLOptions;
    });
}

export { CoreDatabase, DatabaseServer, type Payload };

<!-- @format -->

## Docs for [@xenodb/server](https://github.com/xenodb/xenoserver). To be used with [@xenodb/client](https://github.com/xenodb/xenoclient)

```bash
npm install @xenodb/server
```

```ts
import { DatabaseServer } from "@xenodb/server"; // For ES Module
const { DatabaseServer } = require("@xenodb/server"); // For CommonJS

const server = new DatabaseServer({
  port: 8080,
  auth: "YOUR_SECRET_TOKEN"
});

server.onStdout = (msg) => console.log(`${new Date().toLocaleString()} - [DATABASE_SERVER] - ${msg}`);
```

```ts
type ConstructorOptions = {
  auth: string; // Authentication token/secret
  port: number; // Server port (e.g., 8080, 443)
  ssl?: SSLOptions; // SSL configuration (Optional)
};

type SSLOptions = {
  key: string; // Private key content
  cert: string; // Certificate content
  ciphers?: string; // Allowed cipher suites
  dhparam?: string; // Diffie-Hellman parameters
  passphrase?: string; // Private key passphrase
  requestCert?: boolean; // Request client certificate
  ca?: string | string[]; // Certificate Authority
  secureProtocol?: string; // SSL/TLS protocol version
  honorCipherOrder?: boolean; // Use server cipher preferences
  rejectUnauthorized?: boolean; // Reject unauthorized connections
};
```

**Issues & Support :** [Discord](https://discord.gg/1st-952570101784281139) | [Github](https://github.com/xenodb/xenoserver)

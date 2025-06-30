/** @format */

import { defineConfig } from "tsup";

export default defineConfig({
  dts: true,
  clean: true,
  outDir: "lib",
  minify: false,
  treeshake: true,
  target: "esnext",
  platform: "node",
  format: ["cjs", "esm"],
  experimentalDts: false,
  entry: ["src/index.ts"],
  publicDir: "app/public",
  removeNodeProtocol: false,
  skipNodeModulesBundle: true
});

// Bundles src/client/index.jsx into lib/client.js in the
// window.__ModuleLoader__.load shape the DSH browser kernel expects.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

const MODULE_ID = "dsh-delegate-router";

const header = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(MODULE_ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
`;
const footer = `\n\t\treturn module.exports;
\t}
});
`;

const result = await build({
  entryPoints: ["src/client/index.jsx"],
  bundle: true,
  format: "cjs",
  platform: "browser",
  external: ["react", "react-dom", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives"],
  jsx: "automatic",
  target: "es2020",
  write: false,
  logLevel: "info",
});

if (result.outputFiles.length !== 1) {
  throw new Error(`build-client: expected exactly one output file, got ${result.outputFiles.length}`);
}

mkdirSync("lib", { recursive: true });
writeFileSync("lib/client.js", header + result.outputFiles[0].text + footer);
console.log(`build-client: wrote lib/client.js (${result.outputFiles[0].contents.length} bytes bundled body)`);

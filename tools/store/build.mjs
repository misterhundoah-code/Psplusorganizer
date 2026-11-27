// Builds store/store.js. The three.js add-ons (GLTFLoader, SkeletonUtils) import "three"; pointing that at
// "three/webgpu" keeps one copy of three.js in the bundle instead of two.
import * as esbuild from "esbuild";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const webgpu = require.resolve("three/webgpu");
await esbuild.build({
  entryPoints: ["main.js"], bundle: true, format: "esm", minify: true, target: "es2022", outfile: "../../store/store.js",
  plugins: [{ name: "one-three", setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: webgpu })); } }],
});

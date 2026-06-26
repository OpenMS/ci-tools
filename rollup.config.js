import { defineConfig } from "rollup"
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";


export default defineConfig([
  "actions/rsync-cache/src/restore.js",
  "actions/rsync-cache/src/commit.js",
].map(path => {
  return {
    input: path,
    output: {
      esModule: true,
      file: path.replace("/src/", "/dist/"),
      format: "es",
      sourcemap: true,
    },
    plugins: [commonjs(), nodeResolve({ preferBuiltins: true })],
  }
}));

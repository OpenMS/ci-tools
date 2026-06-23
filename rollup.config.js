import { defineConfig } from "rollup"
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";


export default defineConfig([
  {
    input: "actions/rsync-cache/src/restore.js",
    output: {
      esModule: true,
      file: "actions/rsync-cache/dist/restore.js",
      format: "es",
      sourcemap: true,
    },
    plugins: [commonjs(), nodeResolve({ preferBuiltins: true })],
  }
]);

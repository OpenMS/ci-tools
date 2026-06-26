import Rsync from "./rsync.js";
import * as core from "@actions/core";

async function main() {
  try {
    const rsync = new Rsync();
    await rsync.push();
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();

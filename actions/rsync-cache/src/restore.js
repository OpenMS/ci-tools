import * as core from "@actions/core";
import * as github from "@actions/github";
import * as exec from "@actions/exec";

class RestoreHelper {
  constructor() {
    this.path = core.getInput("path", {required: true});
    this.key = core.getInput("key", {required: true});
  }

  /// Pull directory from server.  It is not a failure if the
  /// directory doesn't exist.
  async run() {
    await exec.exec("echo", ["hello"]);
  }
}

async function main() {
  try {
    const restore = new RestoreHelper();
    await restore.run();
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();

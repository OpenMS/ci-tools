import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Rsync from "../src/rsync.js";

class Deps {
  constructor() {
    this.ssh_port = "2222";

    this.inputs = new Map([
      ["name", "vcpkg-cache"],
      ["path", "/dev/null"],
      ["key", "linux-gcc"],
      ["ssh_key", "SSH_KEY_TEXT"],
      ["ssh_host", "ssh.example.com"],
      ["ssh_port", this.ssh_port],
      ["ssh_user", "root"],
    ]);
  }

  rsync() {
    this.exec = new (class {
      constructor() {
        this.commands = [];
        this.exit_code = 0;
      }

      async exec() {
        this.commands.push(Array.from(arguments));
        return this.exit_code;
      }

      // Assert that the last command was `name`.
      assert_last_command(name) {
        assert(this.commands.length > 0);
        assert.equal(name, this.commands.at(-1).at(0));
      }

      // Return the last two command line arguments for the last
      // command that was executed.
      get_final_args() {
        return this.commands.at(-1).at(1).slice(-2);
      }
    })();

    this.core = new (class {
      constructor(inputs) {
        this.inputs = inputs;
        this.notices = [];
      }

      getInput(key, options = {}) {
        const val = this.inputs.get(key);

        if (options["required"] && !val) {
          throw `missing required input: ${key}`;
        }

        return val;
      }

      notice(message) {
        this.notices.push(message);
      }
    })(this.inputs);

    this.io = new (class {
      constructor() {
        this.mkdir_paths = [];
      }

      async mkdirP(path) {
        this.mkdir_paths.push(path);
      }
    })();

    this.fs = new (class {
      constructor() {
        this.files = new Map();
        this.modes = new Map();
        this.unlinked = [];
      }

      async writeFile(name, content, encoding) {
        this.files.set(name, content);
      }

      async chmod(name, mode) {
        this.modes.set(name, mode);
      }

      async unlink(file) {
        this.unlinked.push(file);
      }
    })();

    return new Rsync({
      exec: this.exec,
      core: this.core,
      io: this.io,
      fs: this.fs,
    });
  }
}

function validate_rsync_paths(rsync, server, directory) {
  assert(server && directory);
  assert.equal(rsync.ssh_dir, server);
  assert.equal(rsync.path, directory);

  // The server should start with a username and contain a colon.
  assert.match(server, /^[\w]+@/);
  assert.match(server, /\w+:\w+/);

  // The directory should only have normal path characters:
  assert.match(directory, /^[\w_/-]+$/);

  // Both should end with a slash.
  for (const s of [server, directory]) {
    assert.match(s, /\/$/);
  }
}

test("creates and removes SSH key", async () => {
  let deps = new Deps();
  let rsync = deps.rsync();
  const file_name = rsync.ssh_key_file;
  const key_text = deps.inputs.get("ssh_key");

  // Basic sanity checking.
  assert(key_text && key_text.length > 0);
  assert(deps.fs.files);
  assert.equal(deps.fs.files.size, 0);
  assert.equal(rsync.ssh_port, deps.ssh_port);

  await rsync.run();

  // File was created.
  assert(file_name);
  assert.equal(deps.fs.files.size, 1);
  assert(deps.fs.files.has(file_name));
  assert.equal(deps.fs.files.get(file_name), key_text + "\n");
  assert.equal(deps.fs.modes.get(file_name), 0o600);

  // File was also deleted.
  assert(deps.fs.unlinked.length > 0);
  assert.equal(file_name, deps.fs.unlinked[0]);
});

test("failure triggers a notice", async () => {
  let deps = new Deps();
  let rsync = deps.rsync();

  deps.exec.exit_code = 1;
  await rsync.pull();
  await rsync.push();

  assert.equal(deps.exec.commands.length, 2);
  assert.equal(deps.core.notices.length, 2);
});

test("can pull the cache", async () => {
  let deps = new Deps();
  let rsync = deps.rsync();

  // Pulling means the ssh server should be listed first, then the
  // local directory.
  await rsync.pull();
  deps.exec.assert_last_command("rsync");

  const [server, directory] = deps.exec.get_final_args();
  validate_rsync_paths(rsync, server, directory);
  assert(deps.core.notices.length == 0);
});

test("can push the cache", async () => {
  let deps = new Deps();
  let rsync = deps.rsync();

  // Pushing means the local directory ssh server should be listed
  // first, then the ssh server.
  await rsync.push();
  deps.exec.assert_last_command("rsync");

  const [directory, server] = deps.exec.get_final_args();
  validate_rsync_paths(rsync, server, directory);
  assert(deps.core.notices.length == 0);
});

test("disabled on missing ssh key", async () => {
  for (const key of [null, "", "   "]) {
    let deps = new Deps();
    deps.inputs.set("ssh_key", key);

    let rsync = deps.rsync();
    assert(rsync.disabled, `when ssh_key is ${key}`);

    const exit_code = await rsync.run();
    assert.equal(exit_code, 0);
    assert.equal(deps.exec.commands.length, 0);
    assert.equal(deps.core.notices.length, 1);

    // But fetching should try to run rclone:
    await rsync.pull();
    deps.exec.assert_last_command("rclone");
  }
});

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";

export default class Rsync {
  constructor(options = { exec, core, io, fs }) {
    // Dependency injection.
    this.exec = options.exec;
    this.core = options.core;
    this.io = options.io;
    this.fs = options.fs;

    // Tracking if we actually run or not.
    this.disabled = false;

    // Cache settings:
    this.name = this.core.getInput("name", { required: true });
    this.path = this.core.getInput("path", { required: true });
    this.key = this.core.getInput("key", { required: true });

    // SSH settings:
    this.ssh_key_dir = os.homedir() + "/.ssh";
    this.ssh_key_file = this.ssh_key_dir + "/." + crypto.randomUUID();
    this.ssh_key = this.core.getInput("ssh_key", { required: false });

    if (
      !this.ssh_key ||
      this.ssh_key.length == 0 ||
      this.ssh_key.match(/^\s*$/)
    ) {
      this.disabled = true;
      this.core.notice("Caching disabled due to missing SSH key.");
      return;
    }

    this.ssh_host = this.core.getInput("ssh_host", { required: true });
    this.ssh_port = this.core.getInput("ssh_port", { required: false });
    this.ssh_user = this.core.getInput("ssh_user", { required: true });
    this.ssh_dir = `${this.ssh_user}@${this.ssh_host}:${this.name}/${this.key}/`;

    // Add a trailing slash to the path if necessary.
    if (!this.path.match(/\/$/)) {
      this.path += "/";
    }

    this._validate();
    this._set_vars();
  }

  // Ensure all our settings look good.
  _validate() {
    if (!this.ssh_port || !this.ssh_port.match(/^\d+$/)) {
      this.ssh_port = "22";
    }

    if (!path.isAbsolute(this.path)) {
      throw new Error(`path to cache must be absolute: ${this.path}`);
    }
  }

  // Prepare some variables.
  _set_vars() {
    // The SSH command line.
    const ssh_command = [
      "ssh",
      "-i",
      this.ssh_key_file,
      "-p",
      this.ssh_port,
      "-o",
      "StrictHostKeyChecking=accept-new",
    ].join(" ");

    // The base rsync command:
    this.command = "rsync";
    this.args = [
      "-e",
      ssh_command,
      "--progress",
      "--human-readable",
      "--archive",
      "--verbose",
      "--compress",

      // We need this so we can create sub-directories, one for each
      // cache key (OS, architecture, compiler, etc.)
      "--mkpath",
    ];
  }

  // Run rsync with extra arguments and return its exit code.
  async run(additional_arguments = []) {
    if (this.disabled) {
      return 0;
    }

    let exit_code = -1;

    try {
      await this.io.mkdirP(this.path);
      await this.io.mkdirP(this.ssh_key_dir);
      await this.fs.writeFile(this.ssh_key_file, this.ssh_key, "utf8");
      await this.fs.chmod(this.ssh_key_file, 0o600);

      // Run rsync.
      const options = { ignoreReturnCode: true };
      exit_code = await this.exec.exec(
        this.command,
        [...this.args, ...additional_arguments],
        options,
      );
    } finally {
      // Remove the key file.
      await this.fs.unlink(this.ssh_key_file);
    }

    // Let callers decide what to do with the exit code.
    return exit_code;
  }

  // Pull the cache from the remote server.
  async pull() {
    const rsync_args = [
      this.ssh_dir, // FROM
      this.path, // TO
    ];

    const exit_code = await this.run(rsync_args);

    if (exit_code != 0) {
      this.core.notice(`Cache ${this.name}: error fetching remote cache`);
    }
  }

  // Push the cache to the remote server.
  async push() {
    const rsync_args = [
      "--delete-before",
      this.path, // FROM
      this.ssh_dir, // TO
    ];

    const exit_code = await this.run(rsync_args);

    if (exit_code != 0) {
      this.core.notice(`Cache ${this.name}: error pushing to remote cache`);
    }
  }
}

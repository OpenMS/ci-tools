import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as core from "@actions/core";
import * as github from "@actions/github";
import * as exec from "@actions/exec";
import * as io from "@actions/io";

export default class Rsync {
  constructor() {
    // Cache settings:
    this.name = core.getInput("name", {required: true});
    this.path = core.getInput("path", {required: true});
    this.key = core.getInput("key", {required: true});

    // SSH settings:
    this.ssh_key_dir = os.homedir() + "/.ssh"
    this.ssh_key_file = this.ssh_key_dir + "/private.key";

    this.ssh_key = core.getInput("ssh_key", {required: true});
    this.ssh_host = core.getInput("ssh_host", {required: true});
    this.ssh_port = core.getInput("ssh_port", {required: false});
    this.ssh_user = core.getInput("ssh_user", {required: true});
    this.ssh_dir = `${this.ssh_user}@${this.ssh_host}:${this.name}/${this.key}/`;

    this._validate();
    this._set_vars();
  }

  // Ensure all our settings look good.
  _validate() {
    if (!this.ssh_port) {
      this.ssh_port = "22"
    }

    if (!path.isAbsolute(this.path)) {
      throw new Error(`path to cache must be absolute: ${this.path}`)
    }
  }

  // Prepare some variables.
  _set_vars() {
    // The SSH command line.
    const ssh_command = [
      "ssh",
      "-i", this.ssh_key_file,
      "-p", this.ssh_port,
      "-o", "StrictHostKeyChecking=accept-new",
    ].join(" ")

    // The base rsync command:
    this.command = "rsync"
    this.args = [
      "-e", ssh_command,
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
  async run(additional_arguments=[]) {
    await io.mkdirP(this.path);
    await io.mkdirP(this.ssh_key_dir);
    await fs.writeFile(this.ssh_key_file, this.ssh_key, 'utf8');
    await fs.chmod(this.ssh_key_file, 0o600);

    // Run rsync.
    const options = {ignoreReturnCode: true};
    const exit_code = await exec.exec(this.command,
      [...this.args, ...additional_arguments], options);

    // Remove the key file.
    await fs.unlink(this.ssh_key_file);

    // Let callers decide what to do with the exit code.
    return exit_code;
  }

  // Pull the cache from the remote server.
  async pull() {
    const rsync_args = [
      this.ssh_dir, // FROM
      this.path,    // TO
    ];

    const exit_code = await this.run(rsync_args);

    if (exit_code != 0) {
      core.notice(`Cache ${this.name}: error fetching remote cache`);
    }
  }

  // Push the cache to the remote server.
  async push() {
    const rsync_args = [
      "--delete-before",
      this.path,    // FROM
      this.ssh_dir, // TO
    ];

    const exit_code = await this.run(rsync_args);

    if (exit_code != 0) {
      core.notice(`Cache ${this.name}: error pushing to remote cache`);
    }
  }
}

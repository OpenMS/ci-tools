# OpenMS CI Tools

Scripts used in the OpenMS CI/CD system.

## Actions

To build the actions:

```sh
npm ci
npm run build
```

### Cache via rsync

Push/pull a directory via rsync.

To use, put something like this in your workflow YAML:

```yml
- uses: OpenMS/ci-tools/actions/rsync-cache@XXXX
  with:
    name: vcpkg-cache
    path: ${{ github.workspace }}/.vcpkg-cache
    key: ${{ runner.os }}-${{ runner.arch }}-${{ matrix.compiler }}
    ssh_key: ${{ secrets.ARCHIVE_RRSYNC_SSH }}
    ssh_host: ${{ secrets.ARCHIVE_RRSYNC_HOST }}
    ssh_port: ${{ secrets.ARCHIVE_RRSYNC_PORT }}
    ssh_user: ${{ secrets.ARCHIVE_RRSYNC_USER }}
```

#!/usr/bin/env bash

################################################################################
# Because GitHub runners don't set these:
export LANG=en_US.UTF-8
export LC_ALL=$LANG
export LC_COLLATE=$LANG

################################################################################
# Strip whitespace and delete blank lines from STDIN to STDOUT.
function strip_space() {
  sed -E \
    -e 's/^[[:space:]]+//' \
    -e 's/[[:space:]]+$//' \
    -e 's/[[:space:]]+/ /' \
    -e '/^[[:space:]]*$/d'
}

################################################################################
# Resolve a `git` commit name given on the command line.
#
# When a repository is cloned in a GitHub action the main branch isn't
# available directly, even though `$GITHUB_BASE_REF` references it.
# So we need to fully qualify any symbolic revision name we are given.
function resolve_git_commit() {
  local name=$1
  local commit

  local possible=(
    "$name"
    "origin/$name"
    "remotes/origin/$name"
  )

  for rev in "${possible[@]}"; do
    commit=$(git rev-parse --verify --quiet "$rev" || :)

    if [ -n "$commit" ]; then
      break
    fi
  done

  if [ -z "$commit" ]; then
    echo >&2 "ERROR: invalid revision: $name"
    exit 1
  fi

  echo "$commit"
}

#!/usr/bin/env bash

################################################################################
set -eu
set -o pipefail

################################################################################
script_dir=$(realpath "$(dirname "$0")")
source "$script_dir/../lib/ci-tools.sh"

################################################################################
option_from="HEAD^"
option_to="HEAD"
option_authors_file="AUTHORS"
option_only_git_authors=0

################################################################################
function usage() {
  cat <<EOF
Usage: $(basename "$0") [options] [from-commit to-commit]

  -f FILE Use FILE as the AUTHORS file
  -g      Print authors from git then exit
  -h      This message
  -p USER Print a pull request comment directed to USER
  -r      Replace the existing AUTHORS file without checking it

NOTE: Must be exeucted from within a git repository.

EOF
}

################################################################################
# Ask `git` for a list of authors.
function authors_from_git() {
  git log \
    --pretty=format:%an \
    "${option_from}..${option_to}" |
    strip_space |
    sort -u |
    grep -E -v 'Copilot|\[bot\]'
}

################################################################################
# Fetch the list of authors from the `AUTHORS` file.
function authors_from_file() {
  if [ ! -e "$option_authors_file" ]; then
    echo >&2 "ERROR: file does not exist: $option_authors_file"
    exit 1
  fi

  grep -E '^[[:space:]]*-' "$option_authors_file" |
    sed -E 's/^[[:space:]]*-//' |
    strip_space |
    sort -u
}

################################################################################
# List all authors from all sources.
function authors_from_all() {
  (
    authors_from_file
    authors_from_git
  ) | sort -u
}

################################################################################
# Generate a new `AUTHORS` file.
function generate_authors_file() {
  local new_file=$1

  (
    grep -E -v '^[[:space:]]*-' "$option_authors_file"
    authors_from_all | sed -E -e 's/^/ - /'
  ) >"$new_file"
}

################################################################################
# Check to see if the authors file and `git` agree.
function diff_authors_file() {
  local new_file=$1
  local out_file=$2

  generate_authors_file "$new_file"

  diff -u \
    --ignore-case \
    --ignore-all-space \
    "$option_authors_file" "$new_file" >"$out_file"
}

################################################################################
# Report the results of running a `diff`.
function diff_report() {
  local new_file="${option_authors_file}.new"
  local out_file="${option_authors_file}.diff"

  if ! diff_authors_file "$new_file" "$out_file"; then
    cat "$out_file"
    echo >&2 "ERROR: missing authors"
    exit 100
  fi
}

################################################################################
# Produce a comment for a GitHub pull request.
function pr_comment() {
  local username=$1
  local diff_file="${option_authors_file}.diff"
  local authors=()

  if [ ! -e "$diff_file" ]; then
    diff_authors_file "${option_authors_file}.new" "$diff_file" || :
  fi

  while read -r name; do
    authors+=("$name")
  done < <(authors_from_git)

  if [ "${#authors[@]}" -gt 0 ] && [ -s "$diff_file" ]; then
    echo "@${username} The following names *might* be missing from the \`AUTHORS\` file:"
    echo

    for name in "${authors[@]}"; do
      echo " - ${name}"
      echo
    done

    echo "Please consider applying the following patch:"
    echo
    echo '```diff'
    cat "$diff_file"
    echo '```'
  elif [ -s "$diff_file" ]; then
    echo "@${username} The \`AUTHORS\` file isn't sorted correctly."
    echo
    echo "Please consider applying the following patch:"
    echo
    echo '```diff'
    cat "$diff_file"
    echo '```'
  fi
}

################################################################################
function main() {
  if [ ! -e ".git" ]; then
    echo >&2 "ERROR: must be run from a git repository"
    exit 1
  fi

  while getopts "f:ghp:r" o; do
    case "${o}" in
    f)
      option_authors_file=$OPTARG
      ;;

    g)
      option_only_git_authors=1
      ;;

    h)
      usage
      exit
      ;;

    p)
      pr_comment "$OPTARG"
      exit
      ;;

    r)
      generate_authors_file "$option_authors_file.new"
      mv "$option_authors_file.new" "$option_authors_file"
      exit
      ;;

    *)
      exit 1
      ;;
    esac
  done

  shift $((OPTIND - 1))

  if [ $# -gt 0 ]; then
    if [ $# -eq 2 ]; then
      option_from=$(resolve_git_commit "$1")
      option_to=$(resolve_git_commit "$2")
    else
      echo >&2 "ERROR: provide exactly two commits"
      exit 1
    fi
  fi

  if [ "$option_only_git_authors" -eq 1 ]; then
    authors_from_git
  else
    diff_report
  fi
}

################################################################################
main "$@"

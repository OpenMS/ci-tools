#!/usr/bin/env bash

################################################################################
set -eu
set -o pipefail

################################################################################
script_dir=$(realpath "$(dirname "$0")")
source "$script_dir/../lib/ci-tools.sh"

################################################################################
declare -A topp_exceptions=(
  ["FeatureLinkerBase.cpp"]=1
)

################################################################################
option_from="HEAD^"
option_to="HEAD"
option_for_pr=""
option_tool_handler_cpp="src/openms/source/APPLICATIONS/ToolHandler.cpp"
option_topp_dir="src/topp"

################################################################################
function usage() {
  cat <<EOF
Usage: $(basename "$0") [options] [from-commit to-commit]

  -f      Force checking, ignoring from-commit and to-commit
  -h      This message
  -p USER Create a PR comment message directed to USER

Check to see if all OpenMS tools are properly listed in the
ToolHandler.cpp source file.  By default, only run if a commit in the
given range added a tool.

NOTE: This tool must be run from the top of the OpenMS source tree.

EOF
}

################################################################################
# Return the list of tools recorded in the `ToolHandler.cpp` file.
function tools_map_cpp() {
  grep -E 'tools_map\["[^"]+"\]\s*=' "$option_tool_handler_cpp" |
    sed -E -e 's/^.*\["([^"]+)"\].*$/\1.cpp/'
}

################################################################################
# Test if a file is in the tools map.
function is_in_tools_map_cpp() {
  local file
  file="$(basename "$1")"

  tools_map_cpp | grep --fixed-strings --quiet "$file"
}

################################################################################
# Test all of the TOPP source files.
function topp_files_in_map() {
  local base

  while IFS= read -r -d "" file; do
    base="$(basename "$file")"

    if [ "${topp_exceptions[$base]:-0}" -ne 1 ] && ! is_in_tools_map_cpp "$base"; then
      echo >&2 "ERROR: $base is not listed in $option_tool_handler_cpp"
      exit 100
    fi
  done < <(find "$option_topp_dir" -type f -name '*.cpp' -print0)
}

################################################################################
# Test if the git commit range includes new tools.
function git_has_new_tools() {
  # shellcheck disable=SC2016
  git log \
    --diff-filter=A \
    --name-only \
    --pretty="format:" \
    "${option_from}..${option_to}" |
    grep --fixed-strings "$option_topp_dir" |
    sed -E 's/(.+)/- `\1`/'
}

################################################################################
# Produce a PR comment.
function pr_comment() {
  local username=$1

  cat <<EOF
@${username} The following new tools were found, yet at least one of
them are not listed in the ${option_tool_handler_cpp} file:

$(git_has_new_tools)

Please consider updating the tool handler file.
EOF
}

################################################################################
function main() {
  while getopts "fhp:" o; do
    case "${o}" in
    f)
      topp_files_in_map
      exit
      ;;

    h)
      usage
      exit
      ;;

    p)
      option_for_pr=$OPTARG
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

  if [ -n "$option_for_pr" ]; then
    pr_comment "$option_for_pr"
  elif git_has_new_tools >/dev/null; then
    echo "==> New tools found in git, checking tool handler file"
    topp_files_in_map
  fi
}

################################################################################
main "$@"

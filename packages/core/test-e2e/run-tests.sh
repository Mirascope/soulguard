#!/usr/bin/env bash
# E2E snapshot test runner for soulguard CLI.
#
# Each test case is a directory under cases/ containing:
#   test.sh       — shell script to run (executed as `agent` user)
#   expected.txt  — exact expected stdout+stderr output
#
# Usage:
#   ./run-tests.sh                  # run all tests, diff against snapshots
#   ./run-tests.sh --update         # regenerate all snapshots

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CASES_DIR="$SCRIPT_DIR/cases"
UPDATE="${1:-}"
PASS=0
FAIL=0

for case_dir in "$CASES_DIR"/*/; do
  test_name="$(basename "$case_dir")"
  test_script="$case_dir/test.sh"
  expected_file="$case_dir/expected.txt"

  if [ ! -f "$test_script" ]; then
    echo "SKIP: $test_name (no test.sh)"
    continue
  fi

  # Snapshot system state before test (init tests modify sudoers)
  sudo cp /etc/sudoers.d/soulguard /tmp/soulguard-sudoers-backup 2>/dev/null || true

  # Run test in a clean temp workspace
  workspace=$(mktemp -d /tmp/soulguard-e2e-XXXX)
  
  # Execute test script, capture all output, normalize temp paths
  # Execute test script, capture all output, normalize variable paths
  actual=$(cd "$workspace" && NO_COLOR=1 bash "$test_script" 2>&1 | \
    sed "s|$workspace|/workspace|g" | \
    sed "s|$test_script|test.sh|g") || true

  # Clean up workspace (may need sudo if init created soulguardian-owned files)
  rm -rf "$workspace" 2>/dev/null || sudo rm -rf "$workspace"

  # Restore sudoers to pre-test state (init tests overwrite it)
  if [ -f /tmp/soulguard-sudoers-backup ]; then
    sudo cp /tmp/soulguard-sudoers-backup /etc/sudoers.d/soulguard
  fi

  if [ "$UPDATE" = "--update" ]; then
    echo "$actual" > "$expected_file"
    echo "UPDATED: $test_name"
    continue
  fi

  if [ ! -f "$expected_file" ]; then
    echo "FAIL: $test_name (no expected.txt — run with --update)"
    echo "--- actual output ---"
    echo "$actual"
    echo "---"
    FAIL=$((FAIL + 1))
    continue
  fi

  expected=$(cat "$expected_file")

  if [ "$actual" = "$expected" ]; then
    echo "PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $test_name"
    diff --color=auto <(echo "$expected") <(echo "$actual") || true
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "$PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

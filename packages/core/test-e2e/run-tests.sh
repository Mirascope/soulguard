#!/usr/bin/env bash
# E2E snapshot test runner for soulguard CLI.
#
# Runs each test case in a separate Docker container for full isolation.
# No shared state between tests — each gets a fresh filesystem.
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
IMAGE="soulguard-e2e"
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

  # Run test in a fresh container — complete isolation
  actual=$(docker run --rm "$IMAGE" bash -c "
    workspace=\$(mktemp -d /tmp/soulguard-e2e-XXXX)
    chmod 755 \"\$workspace\"
    cd \"\$workspace\"
    NO_COLOR=1 bash /app/packages/core/test-e2e/cases/$test_name/test.sh 2>&1 | \
      sed \"s|\$workspace|/workspace|g\" | \
      sed 's|/app/packages/core/test-e2e/cases/$test_name/test.sh|test.sh|g'
  ") || true

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

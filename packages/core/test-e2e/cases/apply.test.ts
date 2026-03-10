import { e2e } from "../harness";

// ── Basic apply with -y flag ─────────────────────────────────────────

e2e("apply: applies staged changes with -y", (t) => {
  // Setup: create a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Initialize soulguard
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);

  // Mark file as protect-tier
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Stage files for editing
  t.$(`soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0);

  // Modify staging copy
  t.$(`echo '# My Updated Soul' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Apply with -y flag (no hash verification required)
  t.$(`sudo soulguard apply . -y`)
    .expect(`
      exit 0

      Applied 1 file(s):
        ✅ SOUL.md

      Protect-tier files updated. Staging synced.
    `)
    .exits(0)
    .outputs(/Applied 1 file/);

  // Verify protected file was updated with staged content
  t.$(`cat SOUL.md`)
    .expect(`
      exit 0
      # My Updated Soul
    `)
    .exits(0)
    .outputs(/My Updated Soul/);
});

e2e("apply: handles file deletion through staging", (t) => {
  // Setup: create and protect a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Stage file for deletion (using DELETE_SENTINEL)
  t.$(`soulguard stage -d SOUL.md`)
    .expect(`
      exit 0
        🗑️  SOUL.md (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0);

  // Apply deletion with -y flag
  t.$(`sudo soulguard apply . -y`)
    .expect(`
      exit 0

      Applied 1 file(s):
        ✅ SOUL.md

      Protect-tier files updated. Staging synced.
    `)
    .exits(0)
    .outputs(/Applied 1 file/);

  // Verify file was actually deleted from workspace
  t.$(`test -f SOUL.md && echo "exists" || echo "gone"`)
    .expect(`
      exit 0
      gone
    `)
    .exits(0)
    .outputs(/gone/);
});

e2e("apply: applies modified file inside protected directory", (t) => {
  // Setup: create directory with multiple files
  t.$(`mkdir memories && echo 'what a day' > memories/today.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Initialize and protect entire directory
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect memories`)
    .expect(`
      exit 0
        + memories → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Stage file within protected dir for modification
  t.$(`soulguard stage memories/today.md`)
    .expect(`
      exit 0
        📝 memories/today.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/Staged 1 file/);

  // Modify staging copy
  t.$(`echo 'It was great' >> .soulguard-staging/memories/today.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Apply changes with -y flag
  t.$(`sudo soulguard apply . -y`)
    .expect(`
      exit 0

      Applied 1 file(s):
        ✅ memories/today.md

      Protect-tier files updated. Staging synced.
    `)
    .exits(0);

  // Verify only modified file was updated
  t.$(`cat memories/today.md`)
    .expect(`
      exit 0
      what a day
      It was great
    `)
    .exits(0)
    .outputs(/It was great/);
});

// ── Hash verification mode (--hash) ──────────────────────────────────

e2e("apply: verifies hash with --hash flag", (t) => {
  // Setup: create and protect a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Stage files and modify staging copy
  t.$(`soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0);
  t.$(`echo '# Modified' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Extract hash from diff output and apply with cryptographic verification
  // This ensures the frozen pending state matches what was reviewed
  t.$(
    `HASH=$(soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && sudo soulguard apply . --hash "$HASH"`,
  )
    .expect(`
      exit 0

      Applied 1 file(s):
        ✅ SOUL.md

      Protect-tier files updated. Staging synced.
    `)
    .exits(0);
});

e2e("apply: rejects with wrong hash", (t) => {
  // Setup: create and protect a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Stage and modify files
  t.$(`soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0);
  t.$(`echo '# Modified' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Attempt to apply with incorrect hash → should fail with hash mismatch error
  t.$(`sudo soulguard apply . --hash "deadbeef" 2>&1`)
    .expect(`
      exit 1
      Expected hash deadbeef but got hash 0ef9a3b0ec7982fa7f92305d99c74e10bb74bebb0a0114d74e797c53f0618052
      Please run \`soulguard diff\` again and re-review.
    `)
    .exits(1)
    .outputs(/hash|mismatch|invalid/i);
});

// ── Error cases ──────────────────────────────────────────────────────

e2e("apply: rejects using both --yes and --hash", (t) => {
  // Setup: create and protect a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
    exit 0
  `)
    .exits(0);
  t.$(`sudo soulguard init .`)
    .expect(`
    exit 0
    ✓ Soulguard initialized.
  `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
    exit 0
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `)
    .exits(0);

  // Attempt to use both --yes and --hash flags → should fail
  // (these flags are mutually exclusive)
  t.$(`sudo soulguard apply . --yes --hash "abc123" 2>&1`)
    .expect(`
      exit 1
      Cannot use both --yes and --hash flags
    `)
    .exits(1)
    .outputs(/cannot/i);
});

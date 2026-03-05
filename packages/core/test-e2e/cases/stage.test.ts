import { e2e } from "../harness";

// ── Basic file staging ───────────────────────────────────────────────

e2e("stage: stages a protected file for editing", (t) => {
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

  // Stage the file → should copy to staging
  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for editing/);

  // Verify staging copy contains original content
  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      # My Soul
    `)
    .exits(0)
    .outputs(/# My Soul/);
});

e2e("stage: no-op when staging copy already exists", (t) => {
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

  // Stage file once
  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  // Stage again → should skip (already staged)
  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
      exit 0
        · SOUL.md (already staged)
      Nothing to stage.
    `)
    .exits(0)
    .outputs(/already staged/);
});

// ── Error cases ──────────────────────────────────────────────────────

e2e("stage: errors on watch-tier file", (t) => {
  // Setup: create a watch-tier file (not protect-tier)
  t.$(`echo '# Notes' > notes.md`)
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
  t.$(`sudo soulguard watch notes.md`)
    .expect(`
    exit 0
      + notes.md → watch

    Updated. 1 file(s) now watch-tier.
  `)
    .exits(0);

  // Attempt to stage watch-tier file → should error
  t.$(`sudo soulguard stage notes.md 2>&1`)
    .expect(`
      exit 1
      notes.md is not in the protect tier.
    `)
    .exits(1)
    .outputs(/not in the protect tier/);
});

// ── File deletion staging ────────────────────────────────────────────

e2e("stage: stages file for deletion with -d", (t) => {
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

  // Stage for deletion → writes DELETE_SENTINEL instead of copying content
  t.$(`sudo soulguard stage -d SOUL.md`)
    .expect(`
      exit 0
        🗑️  SOUL.md (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for deletion/);

  // Verify staging contains DELETE_SENTINEL
  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      {
        "__soulguard_delete_sentinel__": true
      }
    `)
    .exits(0)
    .outputs(/__soulguard_delete_sentinel__/);
});

e2e("stage: stages subdirectory path for deletion with -d", (t) => {
  // Setup: create nested file
  t.$(`mkdir -p docs && echo '# Guide' > docs/guide.md`)
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
  t.$(`sudo soulguard protect docs/guide.md`)
    .expect(`
    exit 0
      + docs/guide.md → protect

    Updated. 1 file(s) now protect-tier.
  `)
    .exits(0);

  // Stage nested file for deletion
  t.$(`sudo soulguard stage -d docs/guide.md`)
    .expect(`
      exit 0
        🗑️  docs/guide.md (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for deletion/);

  // Verify DELETE_SENTINEL in nested staging path
  t.$(`cat .soulguard-staging/docs/guide.md`)
    .expect(`
      exit 0
      {
        "__soulguard_delete_sentinel__": true
      }
    `)
    .exits(0)
    .outputs(/__soulguard_delete_sentinel__/);
});

e2e("stage: nonexistent file fails", (t) => {
  // Initialize without any protected files
  t.$(`sudo soulguard init .`)
    .expect(`
    exit 0
    ✓ Soulguard initialized.
  `)
    .exits(0);

  // Attempt to stage file that doesn't exist and isn't protected → should error
  t.$(`sudo soulguard stage nonexistent.md 2>&1`)
    .expect(`
      exit 1
      nonexistent.md is not in the protect tier.
    `)
    .exits(1)
    .outputs(/not in the protect tier/);
});

e2e("stage: -d nonexistent file fails", (t) => {
  // Initialize without any protected files
  t.$(`sudo soulguard init .`)
    .expect(`
    exit 0
    ✓ Soulguard initialized.
  `)
    .exits(0);

  // Attempt to stage nonexistent file for deletion → should error
  t.$(`sudo soulguard stage -d nonexistent.md 2>&1`)
    .expect(`
      exit 1
      nonexistent.md is not in the protect tier.
    `)
    .exits(1)
    .outputs(/not in the protect tier/);
});

// ── Special cases ────────────────────────────────────────────────────

e2e("stage: soulguard.json succeeds (always protect-tier)", (t) => {
  // Initialize (soulguard.json is auto-created as protect-tier)
  t.$(`sudo soulguard init .`)
    .expect(`
    exit 0
    ✓ Soulguard initialized.
  `)
    .exits(0);

  // Stage soulguard.json (special file that's always protect-tier)
  t.$(`sudo soulguard stage soulguard.json`)
    .expect(`
      exit 0
        📝 soulguard.json (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for editing/);

  // Verify staging copy exists with config content
  t.$(`cat .soulguard-staging/soulguard.json`)
    .expect(`
      exit 0
      {
        "version": 1,
        "files": {
          "soulguard.json": "protect"
        }
      }
    `)
    .exits(0)
    .outputs(/"version"/);
});

// ── New files in protected directories ───────────────────────────────

e2e("stage: non-existent file in protected directory succeeds", (t) => {
  // Setup: create protected directory with existing file
  t.$(`mkdir -p skills && echo '# Python' > skills/python.md`)
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
  t.$(`sudo soulguard protect skills`)
    .expect(`
      exit 0
        + skills → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Stage new file that doesn't exist yet (but is in protected directory)
  t.$(`sudo soulguard stage skills/new-skill.md`)
    .expect(`
      exit 0
        📝 skills/new-skill.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for editing/);

  // Verify empty staging file was created
  t.$(`cat .soulguard-staging/skills/new-skill.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
});

e2e("stage: non-existent file at nested path in protected directory succeeds", (t) => {
  // Setup: create protected directory
  t.$(`mkdir -p skills && echo '# Python' > skills/python.md`)
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
  t.$(`sudo soulguard protect skills`)
    .expect(`
      exit 0
        + skills → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Stage deeply nested new file (in protected directory)
  t.$(`sudo soulguard stage skills/advanced/new-skill.md`)
    .expect(`
      exit 0
        📝 skills/advanced/new-skill.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for editing/);

  // Verify empty staging file with nested directories created
  t.$(`cat .soulguard-staging/skills/advanced/new-skill.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
});

// ── Multiple files and directories ───────────────────────────────────

e2e("stage: multiple files at once", (t) => {
  // Setup: create multiple files
  t.$(`echo '# Soul' > SOUL.md && echo '# Goals' > GOALS.md`)
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
  t.$(`sudo soulguard protect SOUL.md GOALS.md`)
    .expect(`
    exit 0
      + SOUL.md → protect
      + GOALS.md → protect

    Updated. 2 file(s) now protect-tier.
  `)
    .exits(0);

  // Stage multiple files in one command
  t.$(`sudo soulguard stage SOUL.md GOALS.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)
        📝 GOALS.md (staged for editing)

      Staged 2 file(s).
    `)
    .exits(0)
    .outputs(/Staged 2 file/);

  // Verify both files were staged
  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      # Soul
    `)
    .exits(0);

  t.$(`cat .soulguard-staging/GOALS.md`)
    .expect(`
      exit 0
      # Goals
    `)
    .exits(0);
});

e2e("stage: directory staging recursively stages all files", (t) => {
  // Setup: create protected directory with multiple files
  t.$(`mkdir -p memory && echo '# Notes' > memory/notes.md && echo '# Ideas' > memory/ideas.md`)
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
  t.$(`sudo soulguard protect memory`)
    .expect(`
      exit 0
        + memory → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Stage entire directory → should recursively stage all files
  t.$(`sudo soulguard stage memory`)
    .expect(`
      exit 0
        📝 memory/ideas.md (staged for editing)
        📝 memory/notes.md (staged for editing)

      Staged 2 file(s).
    `)
    .exits(0)
    .outputs(/Staged 2 file/);

  // Verify both files in directory were staged
  t.$(`cat .soulguard-staging/memory/notes.md`)
    .expect(`
      exit 0
      # Notes
    `)
    .exits(0);

  t.$(`cat .soulguard-staging/memory/ideas.md`)
    .expect(`
      exit 0
      # Ideas
    `)
    .exits(0);
});

e2e("stage: directory for deletion with -d", (t) => {
  // Setup: create protected directory
  t.$(`mkdir -p memory && echo '# Notes' > memory/notes.md`)
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
  t.$(`sudo soulguard protect memory`)
    .expect(`
      exit 0
        + memory → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Stage directory for deletion → writes DELETE_SENTINEL as a file (not directory)
  t.$(`sudo soulguard stage -d memory`)
    .expect(`
      exit 0
        🗑️  memory (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for deletion/);

  // Verify DELETE_SENTINEL written as file (not staging individual files)
  t.$(`cat .soulguard-staging/memory`)
    .expect(`
      exit 0
      {
        "__soulguard_delete_sentinel__": true
      }
    `)
    .exits(0)
    .outputs(/__soulguard_delete_sentinel__/);
});

// ── Sentinel overwrite behavior ──────────────────────────────────────

e2e("stage: staging for edit after staging for delete overwrites sentinel", (t) => {
  // Setup: create and protect a file
  t.$(`echo '# Soul' > SOUL.md`)
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

  // First stage for deletion
  t.$(`sudo soulguard stage -d SOUL.md`)
    .expect(`
      exit 0
        🗑️  SOUL.md (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0);

  // Then stage for editing → should overwrite DELETE_SENTINEL with file content
  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for editing/);

  // Verify staging now contains actual file content (not sentinel)
  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      # Soul
    `)
    .exits(0)
    .outputs(/# Soul/);
});

e2e("stage: staging for delete after staging for edit overwrites with sentinel", (t) => {
  // Setup: create and protect a file
  t.$(`echo '# Soul' > SOUL.md`)
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

  // First stage for editing
  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0);

  // Then stage for deletion → should overwrite file content with DELETE_SENTINEL
  t.$(`sudo soulguard stage -d SOUL.md`)
    .expect(`
      exit 0
        🗑️  SOUL.md (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for deletion/);

  // Verify staging now contains DELETE_SENTINEL (not file content)
  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      {
        "__soulguard_delete_sentinel__": true
      }
    `)
    .exits(0)
    .outputs(/__soulguard_delete_sentinel__/);
});

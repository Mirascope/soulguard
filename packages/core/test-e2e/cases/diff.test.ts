import { e2e } from "../harness";

// ── Single file: no changes ─────────────────────────────────────────

e2e("diff: shows no changes for unmodified staging", (t) => {
  // Create a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect
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

  // Stage the file (creates user-writable copy)
  t.$(`soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0);

  // Diff — staging copy is identical → no changes
  t.$(`soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace

        ⚠️ soulguard.json (no staging copy)
        ✅ SOUL.md (no changes)

      No changes
    `)
    .exits(0)
    .outputs(/[Nn]o changes/);

  // Status — everything should be ok
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ✓ SOUL.md (protect, ok, 1 staged change)

      All files ok.
    `)
    .exits(0)
    .outputs(/ok/);
});

// ── Single file: modified staging ───────────────────────────────────

e2e("diff: shows unified diff for modified staging", (t) => {
  // Create a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect
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

  // Stage, then modify the staging copy
  t.$(`soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0);
  t.$(`echo '# My Modified Soul' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Diff — should show unified diff + apply hash
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ⚠️ soulguard.json (no staging copy)
        📝 SOUL.md
            ===================================================================
            --- a/SOUL.md
            +++ b/SOUL.md
            @@ -1,1 +1,1 @@
            -# My Soul
            +# My Modified Soul
            

      2 file(s) changed
      Apply hash: 3ef797046758a06b4f4cae5b20fdca383f4baff6ec653abe6b42597618a0b577
    `)
    .exits(1)
    .outputs(/SOUL\.md/)
    .outputs(/Apply hash:/);

  // Status — should indicate staged changes
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ✓ SOUL.md (protect, ok, 1 staged change)

      All files ok.
    `)
    .exits(0)
    .outputs(/staged/);
});

// ── Single file: protect-tier copy missing (new file) ───────────────

e2e("diff: shows new file when protect-tier copy is missing", (t) => {
  // Create a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect
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

  // Stage, then delete the protect-tier original
  t.$(`soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0);
  t.$(`sudo rm SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Diff — protect-tier file is gone, staging copy exists → new file
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ⚠️ soulguard.json (no staging copy)
        ⚠️ SOUL.md (protect-tier file missing — new file)

      2 file(s) changed
      Apply hash: ddc1ac8615d0e23d031c518f50b17bacc02fd15e5e5cd1a6e2993978f50221a0
    `)
    .exits(1)
    .outputs(/missing|new file/);

  // Status — should report the missing file
  t.$(`soulguard status`)
    .expect(`
      exit 1
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ❌ SOUL.md (protect, missing)

      0 drifted, 1 missing
    `)
    .outputs(/missing|SOUL\.md/);
});

// ── Directory: stage recursive, no diffs → clean ────────────────────

e2e("diff: directory staged recursively with no changes shows clean", (t) => {
  // Create a directory with two files
  t.$(
    `mkdir -p memory && echo 'day one notes' > memory/day1.md && echo 'day two notes' > memory/day2.md`,
  )
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect + sync (enforces ownership)
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
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  // Stage entire directory (recursive copy of all files)
  t.$(`soulguard stage memory`)
    .expect(`
      exit 0
        📝 memory/day1.md (staged for editing)
        📝 memory/day2.md (staged for editing)

      Staged 2 file(s).
    `)
    .exits(0)
    .outputs(/Staged/);

  // Diff — staging copies are identical → no changes
  t.$(`soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace

        ⚠️ soulguard.json (no staging copy)

      No changes
    `)
    .exits(0)
    .outputs(/[Nn]o changes/);

  // Status — everything should be ok
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ✓ memory (protect, ok, 2 staged changes)

      All files ok.
    `)
    .exits(0)
    .outputs(/ok/);
});

// ── Directory: stage recursive, modify one file → shows diff ────────

e2e("diff: directory staged recursively with modified file shows diff", (t) => {
  // Create a directory with one file
  t.$(`mkdir -p memory && echo 'day one notes' > memory/day1.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect + sync
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
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  // Stage entire directory, then modify one file in staging
  t.$(`soulguard stage memory`)
    .expect(`
      exit 0
        📝 memory/day1.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/Staged/);
  t.$(`echo 'modified notes' > .soulguard-staging/memory/day1.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Diff — should show unified diff for the modified file
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ⚠️ soulguard.json (no staging copy)
        📝 memory/day1.md
            ===================================================================
            --- a/memory/day1.md
            +++ b/memory/day1.md
            @@ -1,1 +1,1 @@
            -day one notes
            +modified notes
            

      2 file(s) changed
      Apply hash: 9a65c0ca63eff83363483059ad5c33c737fab5552b2ca59767c891054181a195
    `)
    .exits(1)
    .outputs(/memory\/day1\.md/)
    .outputs(/Apply hash:/);

  // Status — should indicate staged changes
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ✓ memory (protect, ok, 1 staged change)

      All files ok.
    `)
    .exits(0)
    .outputs(/staged/);
});

// ── soulguard.json staged with no changes → clean ───────────────────

e2e("diff: soulguard.json staged with no changes shows clean", (t) => {
  // Create a directory so the config has more than just itself
  t.$(`mkdir -p memory && echo 'day one notes' > memory/day1.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect + sync
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
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  // Stage the config file (always protect-tier)
  t.$(`soulguard stage soulguard.json`)
    .expect(`
      exit 0
        📝 soulguard.json (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for editing/);

  // Diff — staging copy is identical → no changes
  t.$(`soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace

        ✅ soulguard.json (no changes)

      No changes
    `)
    .exits(0)
    .outputs(/[Nn]o changes/);

  // Status — everything should be ok
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok, 1 staged change)
        ✓ memory (protect, ok)

      All files ok.
    `)
    .exits(0)
    .outputs(/ok/);
});

// ── New file in protected directory ─────────────────────────────────

e2e("diff: new file staged in protected directory shows new file diff", (t) => {
  // Create a protected directory with one existing file
  t.$(`mkdir -p skills && echo '# Python' > skills/python.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect + sync
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
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  // Stage a new file that doesn't exist yet in the protected directory
  t.$(`soulguard stage skills/new-skill.md`)
    .expect(`
      exit 0
        📝 skills/new-skill.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for editing/);

  // Write content into the new staged file
  t.$(`echo '# New Skill' > .soulguard-staging/skills/new-skill.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Diff — new file with content → shows diff + apply hash
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ⚠️ soulguard.json (no staging copy)
        ⚠️ skills/new-skill.md (protect-tier file missing — new file)

      2 file(s) changed
      Apply hash: 89535457fb4d5b10a4d265731791c45a6980b5915d1161833716c9782b0d9086
    `)
    .exits(1)
    .outputs(/new-skill\.md/)
    .outputs(/Apply hash:/);

  // Status — should indicate staged changes
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ✓ skills (protect, ok, 1 staged change)

      All files ok.
    `)
    .exits(0)
    .outputs(/staged/);
});

// ── stage -d file → diff shows deletion ─────────────────────────────

e2e("diff: stage -d file shows deletion cleanly", (t) => {
  // Create a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect
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

  // Stage file for deletion (writes DELETE_SENTINEL, not a copy)
  t.$(`soulguard stage -d SOUL.md`)
    .expect(`
      exit 0
        🗑️  SOUL.md (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for deletion/);

  // Diff — sentinel means deletion pending → shows diff + apply hash
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ⚠️ soulguard.json (no staging copy)
        🗑️ SOUL.md (staged for deletion)

      2 file(s) changed
      Apply hash: 0ccb3f8699af8879e159343eb76c545f6ac782d6678a97edbf5473dca31184ea
    `)
    .exits(1)
    .outputs(/SOUL\.md/)
    .outputs(/Apply hash:/);

  // Status — should indicate staged changes
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ✓ SOUL.md (protect, ok, 1 staged change)

      All files ok.
    `)
    .exits(0)
    .outputs(/staged/);
});

// ── stage -d directory → diff shows deletion ────────────────────────

e2e("diff: stage -d directory shows deletion cleanly", (t) => {
  // Create a directory with two files
  t.$(
    `mkdir -p memory && echo 'day one notes' > memory/day1.md && echo 'day two notes' > memory/day2.md`,
  )
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect + sync
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
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  // Stage entire directory for deletion (single DELETE_SENTINEL file)
  t.$(`soulguard stage -d memory`)
    .expect(`
      exit 0
        🗑️  memory (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for deletion/);

  // Diff — directory deletion pending → shows diff + apply hash
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ⚠️ soulguard.json (no staging copy)
        🗑️ memory/day1.md (staged for deletion)
        🗑️ memory/day2.md (staged for deletion)

      3 file(s) changed
      Apply hash: 9353b2b849dbf295aad31c5ebb0d8205b5593280137f5bceb4746ea4ecb3248a
    `)
    .exits(1)
    .outputs(/memory/)
    .outputs(/Apply hash:/);

  // Status — should indicate staged changes
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ✓ memory (protect, ok, 1 staged change)

      All files ok.
    `)
    .exits(0)
    .outputs(/staged/);
});

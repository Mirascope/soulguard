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
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file now protected.
    `)
    .exits(0);

  // Diff — staging copy auto-created by protect is identical → no changes
  t.$(`soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace


      No changes
    `)
    .exits(0)
    .outputs(/[Nn]o changes/);

  // Status — everything should be ok
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

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
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file now protected.
    `)
    .exits(0);

  // Modify the staging copy (auto-created by protect)
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

        📝 SOUL.md
            ===================================================================
            --- a/SOUL.md
            +++ b/SOUL.md
            @@ -1,1 +1,1 @@
            -# My Soul
            +# My Modified Soul
            

      1 file(s) changed
      Apply hash: d01778271aa3d1b3f85e00ad03cf555dd3493f3fb9819d34b9f5c53f0f763dc4
    `)
    .exits(1)
    .outputs(/SOUL\.md/)
    .outputs(/Apply hash:/);

  // Status — should indicate staged changes
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged SOUL.md

    `)
    .exits(0)
    .outputs(/staged/);
});

// ── Single file: protected copy missing (new file) ──────────────────

e2e("diff: shows new file when protected copy is missing", (t) => {
  // Create a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file now protected.
    `)
    .exits(0);

  // Delete the protected original (staging copy auto-created by protect)
  t.$(`sudo rm SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Diff — protected file is gone, staging copy exists → new file
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ⚠️ SOUL.md (new file)
            ===================================================================
            --- /dev/null
            +++ b/SOUL.md
            @@ -0,0 +1,1 @@
            +# My Soul
            

      1 file(s) changed
      Apply hash: 0773780685caa24a38dd8596891af63bb3f224bc86d8fea8bdec2279cf832542
    `)
    .exits(1)
    .outputs(/missing|new file/);

  // Status — should report the missing file
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged (new) SOUL.md

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
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect memory`)
    .expect(`
      exit 0
        + memory → protect

      Updated. 1 file now protected.
    `)
    .exits(0);
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  // Diff — staging copies auto-created by protect are identical → no changes
  t.$(`soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace


      No changes
    `)
    .exits(0)
    .outputs(/[Nn]o changes/);

  // Status — everything should be ok
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

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
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect memory`)
    .expect(`
      exit 0
        + memory → protect

      Updated. 1 file now protected.
    `)
    .exits(0);
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  // Modify one file in staging (auto-created by protect)
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

        📝 memory/day1.md
            ===================================================================
            --- a/memory/day1.md
            +++ b/memory/day1.md
            @@ -1,1 +1,1 @@
            -day one notes
            +modified notes
            

      1 file(s) changed
      Apply hash: d76775395e077fbc9dd944758ea4adafa482b58db8b2675e499bfe9f9c2d2cb5
    `)
    .exits(1)
    .outputs(/memory\/day1\.md/)
    .outputs(/Apply hash:/);

  // Status — should indicate staged changes
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged memory/day1.md

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
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect memory`)
    .expect(`
      exit 0
        + memory → protect

      Updated. 1 file now protected.
    `)
    .exits(0);
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  // Diff — soulguard.json staging copy auto-created, identical → no changes
  t.$(`soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace


      No changes
    `)
    .exits(0)
    .outputs(/[Nn]o changes/);

  // Status — everything should be ok
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

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
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect skills`)
    .expect(`
      exit 0
        + skills → protect

      Updated. 1 file now protected.
    `)
    .exits(0);
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  // Create a new file that doesn't exist yet in the protected directory
  t.$(`soulguard create skills/new-skill.md`)
    .expect(`
      exit 0
        + skills/new-skill.md → .soulguard-staging/skills/new-skill.md

      Created 1 staging entry.
    `)
    .exits(0)
    .outputs(/\.soulguard-staging\//);

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

        ⚠️ skills/new-skill.md (new file)
            ===================================================================
            --- /dev/null
            +++ b/skills/new-skill.md
            @@ -0,0 +1,1 @@
            +# New Skill
            

      1 file(s) changed
      Apply hash: 54433bd7ffce3b87f282b7c6ad93379cc796b97e15b04f96bf23e6f1b42cc7c1
    `)
    .exits(1)
    .outputs(/new-skill\.md/)
    .outputs(/Apply hash:/);

  // Status — should indicate staged changes
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged (new) skills/new-skill.md

    `)
    .exits(0)
    .outputs(/staged/);
});

// ── delete file → diff shows deletion ────────────────────────────────

e2e("diff: delete file shows deletion cleanly", (t) => {
  // Create a file
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file now protected.
    `)
    .exits(0);

  // Stage file for deletion (writes DELETE_SENTINEL)
  t.$(`soulguard delete SOUL.md`)
    .expect(`
      exit 0
        🗑️  SOUL.md (staged for deletion)

      Staged 1 path for deletion.
    `)
    .exits(0)
    .outputs(/staged for deletion/);

  // Diff — sentinel means deletion pending → shows diff + apply hash
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        🗑️ SOUL.md (staged for deletion)
            ===================================================================
            --- a/SOUL.md
            +++ /dev/null
            @@ -1,1 +0,0 @@
            -# My Soul
            

      1 file(s) changed
      Apply hash: 7058fdad94858a8262f2c413c7428b1b43be818d2fbc8cdff6d8d4fdb9c94954
    `)
    .exits(1)
    .outputs(/SOUL\.md/)
    .outputs(/Apply hash:/);

  // Status — should indicate staged changes
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged (delete) SOUL.md

    `)
    .exits(0)
    .outputs(/staged/);
});

// ── delete directory → diff shows deletion ───────────────────────────

e2e("diff: delete directory shows deletion cleanly", (t) => {
  // Create a directory with two files
  t.$(
    `mkdir -p memory && echo 'day one notes' > memory/day1.md && echo 'day two notes' > memory/day2.md`,
  )
    .expect(`
      exit 0
    `)
    .exits(0);

  // Init + protect + sync
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect memory`)
    .expect(`
      exit 0
        + memory → protect

      Updated. 1 file now protected.
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
  t.$(`soulguard delete memory`)
    .expect(`
      exit 0
        🗑️  memory (staged for deletion)

      Staged 1 path for deletion.
    `)
    .exits(0)
    .outputs(/staged for deletion/);

  // Diff — directory deletion pending → shows diff + apply hash
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        🗑️ memory/day1.md (staged for deletion)
            ===================================================================
            --- a/memory/day1.md
            +++ /dev/null
            @@ -1,1 +0,0 @@
            -day one notes
            
        🗑️ memory/day2.md (staged for deletion)
            ===================================================================
            --- a/memory/day2.md
            +++ /dev/null
            @@ -1,1 +0,0 @@
            -day two notes
            

      2 file(s) changed
      Apply hash: 68c086e64351ec9bd5bc9b49ab7ad977789cea9f3d38bf34c099db1b04213c56
    `)
    .exits(1)
    .outputs(/memory/)
    .outputs(/Apply hash:/);

  // Status — should indicate staged changes
  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged (delete) memory/day1.md
        staged (delete) memory/day2.md

    `)
    .exits(0)
    .outputs(/staged/);
});

// ── soulguard.json: stage + apply ───────────────────────────────────

e2e("diff: stage and apply a change to soulguard.json", (t) => {
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);

  // Verify soulguard.json has a staging copy (created by init)
  t.$(`test -f .soulguard-staging/soulguard.json && echo exists || echo gone`)
    .expect(`
      exit 0
      exists
    `)
    .exits(0)
    .outputs(/exists/);

  // Modify the staging copy of soulguard.json to add a daemon section
  t.$(
    `jq '.daemon = {"syncIntervalSecs": 30}' .soulguard-staging/soulguard.json > /tmp/sg.json && cp /tmp/sg.json .soulguard-staging/soulguard.json`,
  )
    .expect(`
      exit 0
    `)
    .exits(0);

  // Diff should show the soulguard.json change
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        📝 soulguard.json
            ===================================================================
            --- a/soulguard.json
            +++ b/soulguard.json
            @@ -7,6 +7,9 @@
               "defaultOwnership": {
                 "user": "agent",
                 "group": "agent",
                 "mode": "644"
            +  },
            +  "daemon": {
            +    "syncIntervalSecs": 30
               }
             }
            

      1 file(s) changed
      Apply hash: 6d50c486652b442bb71d68455f71c2a68a5567898c870f190ec9ad6e8e25fe75
    `)
    .exits(1)
    .outputs(/soulguard\.json/)
    .outputs(/Apply hash:/);

  // Apply with -y
  t.$(`sudo soulguard apply . -y`)
    .expect(`
      exit 0

      Applied 1 file(s):
        ✅ soulguard.json

      Protected files updated. Staging synced.
    `)
    .exits(0)
    .outputs(/Applied 1 file/)
    .outputs(/soulguard\.json/);

  // Verify the canonical soulguard.json now has the daemon section
  t.$(`jq '.daemon.syncIntervalSecs' soulguard.json`)
    .expect(`
      exit 0
      30
    `)
    .exits(0)
    .outputs(/30/);

  // Diff should now show clean
  t.$(`soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace


      No changes
    `)
    .exits(0)
    .outputs(/No changes/);
});

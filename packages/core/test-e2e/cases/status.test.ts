import { e2e } from "../harness";

e2e("status: reports all files ok when clean", (t) => {
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

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

      All files ok.

    `)
    .exits(0)
    .outputs(/All files ok|ok/);
});

e2e("status: reports drifted ownership and permissions", (t) => {
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

  t.$(`sudo chown root:root SOUL.md && sudo chmod 644 SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`soulguard status`)
    .expect(`
      exit 1
      Soulguard Status — /workspace

        ⚠️  SOUL.md (protect)
            owner is root, expected soulguardian_agent
            group is root, expected soulguard
            mode is 644, expected 444

      1 drifted
    `)
    .exits(1)
    .outputs(/drifted/);
});

e2e("status: errors when no soulguard.json exists", (t) => {
  t.$(`soulguard status . 2>&1`)
    .expect(`
      exit 1
      No soulguard.json found in .
    `)
    .exits(1)
    .outputs(/No soulguard\.json/);
});

e2e("status: shows staged change indicators", (t) => {
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

  t.$(`soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0);
  t.$(`echo '# Modified Soul' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged SOUL.md

    `)
    .exits(0)
    .outputs(/staged/);
});

e2e("status: shows directory protection", (t) => {
  t.$(`mkdir -p skills && echo '# Python' > skills/python.md && echo '# TS' > skills/ts.md`)
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
  t.$(`sudo soulguard protect skills/`)
    .expect(`
      exit 0
        + skills/ → protect

      Updated. 1 directory now protected.
    `)
    .exits(0);
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

      All files ok.

    `)
    .exits(0)
    .outputs(/ok/);
});

e2e("status: shows new file in protected directory as created", (t) => {
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
  t.$(`sudo soulguard protect skills/`)
    .expect(`
      exit 0
        + skills/ → protect

      Updated. 1 directory now protected.
    `)
    .exits(0);
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  // Stage a new file that doesn't exist on disk yet
  t.$(`soulguard stage skills/rust.md`)
    .expect(`
      exit 0
        📝 skills/rust.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0);
  t.$(`echo '# Rust' > .soulguard-staging/skills/rust.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged (new) skills/rust.md

    `)
    .exits(0)
    .outputs(/staged/);
});

e2e("status: shows deleted protected file", (t) => {
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

  t.$(`soulguard stage -d SOUL.md`)
    .expect(`
      exit 0
        🗑️  SOUL.md (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged (delete) SOUL.md

    `)
    .exits(0)
    .outputs(/staged/);
});

e2e("status: shows deleted file in protected directory", (t) => {
  t.$(`mkdir -p skills && echo '# Python' > skills/python.md && echo '# TS' > skills/ts.md`)
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
  t.$(`sudo soulguard protect skills/`)
    .expect(`
      exit 0
        + skills/ → protect

      Updated. 1 directory now protected.
    `)
    .exits(0);
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  t.$(`soulguard stage -d skills/python.md`)
    .expect(`
      exit 0
        🗑️  skills/python.md (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged (delete) skills/python.md

    `)
    .exits(0)
    .outputs(/staged/);
});

e2e("status: shows deleted protected directory with all children", (t) => {
  t.$(
    `mkdir -p memory/deep && echo 'day1' > memory/day1.md && echo 'nested' > memory/deep/nested.md`,
  )
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
  t.$(`sudo soulguard protect memory/`)
    .expect(`
      exit 0
        + memory/ → protect

      Updated. 1 directory now protected.
    `)
    .exits(0);
  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  t.$(`soulguard stage -d memory`)
    .expect(`
      exit 0
        🗑️  memory (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        staged (delete) memory/day1.md
        staged (delete) memory/deep/nested.md

    `)
    .exits(0)
    .outputs(/staged/);
});

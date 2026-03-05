import { e2e } from "../harness";

e2e("stage: stages a protected file for editing", (t) => {
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

  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
      exit 0
        📝 SOUL.md (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for editing/);

  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      # My Soul
    `)
    .exits(0)
    .outputs(/# My Soul/);
});

e2e("stage: no-op when staging copy already exists", (t) => {
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

  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
      exit 0
        · SOUL.md (already staged)
      Nothing to stage.
    `)
    .exits(0)
    .outputs(/already staged/);
});

e2e("stage: errors on watch-tier file", (t) => {
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

  t.$(`sudo soulguard stage notes.md 2>&1`)
    .expect(`
      exit 1
      notes.md is not in the protect tier.
    `)
    .exits(1)
    .outputs(/not in the protect tier/);
});

e2e("stage: stages file for deletion with -d", (t) => {
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

  t.$(`sudo soulguard stage -d SOUL.md`)
    .expect(`
      exit 0
        🗑️  SOUL.md (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for deletion/);

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

  t.$(`sudo soulguard stage -d docs/guide.md`)
    .expect(`
      exit 0
        🗑️  docs/guide.md (staged for deletion)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for deletion/);

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
  t.$(`sudo soulguard init .`)
    .expect(`
    exit 0
    ✓ Soulguard initialized.
  `)
    .exits(0);

  t.$(`sudo soulguard stage nonexistent.md 2>&1`)
    .expect(`
      exit 1
      nonexistent.md is not in the protect tier.
    `)
    .exits(1)
    .outputs(/not in the protect tier/);
});

e2e("stage: -d nonexistent file fails", (t) => {
  t.$(`sudo soulguard init .`)
    .expect(`
    exit 0
    ✓ Soulguard initialized.
  `)
    .exits(0);

  t.$(`sudo soulguard stage -d nonexistent.md 2>&1`)
    .expect(`
      exit 1
      nonexistent.md is not in the protect tier.
    `)
    .exits(1)
    .outputs(/not in the protect tier/);
});

e2e("stage: soulguard.json succeeds (always protect-tier)", (t) => {
  t.$(`sudo soulguard init .`)
    .expect(`
    exit 0
    ✓ Soulguard initialized.
  `)
    .exits(0);

  t.$(`sudo soulguard stage soulguard.json`)
    .expect(`
      exit 0
        📝 soulguard.json (staged for editing)

      Staged 1 file(s).
    `)
    .exits(0)
    .outputs(/staged for editing/);

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

e2e.skip("stage: non-existent file in protected directory succeeds", (t) => {
  t.$(`mkdir -p skills && echo '# Python' > skills/python.md`).expect(``).exits(0);
  t.$(`sudo soulguard init .`).expect(``).exits(0);
  t.$(`sudo soulguard protect skills/`).expect(``).exits(0);

  t.$(`sudo soulguard stage skills/new-skill.md`)
    .expect(``)
    .exits(0)
    .outputs(/staged/);
});

e2e.skip("stage: non-existent file at nested path in protected directory succeeds", (t) => {
  t.$(`mkdir -p skills && echo '# Python' > skills/python.md`).expect(``).exits(0);
  t.$(`sudo soulguard init .`).expect(``).exits(0);
  t.$(`sudo soulguard protect skills/`).expect(``).exits(0);

  t.$(`sudo soulguard stage skills/advanced/new-skill.md`)
    .expect(``)
    .exits(0)
    .outputs(/staged/);
});

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
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
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

  // Staging copy should exist with correct content
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
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
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

  // Stage again — should be no-op
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
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
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
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
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
    .exits(0)
    .outputs(/staged for deletion/);

  // Sentinel file should exist
  t.$(`cat .soulguard-staging/SOUL.md`)
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
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
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
    .exits(0)
    .outputs(/staged for deletion/);

  t.$(`cat .soulguard-staging/docs/guide.md`)
    .exits(0)
    .outputs(/__soulguard_delete_sentinel__/);
});

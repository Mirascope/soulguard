import { e2e } from "../harness";

e2e("delete: stages protected file for deletion", (t) => {
  t.$(`echo '# Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
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

  t.$(`soulguard delete SOUL.md`)
    .expect(`
      exit 0
        🗑️  SOUL.md (staged for deletion)

      Staged 1 path for deletion.
    `)
    .exits(0)
    .outputs(/staged for deletion/);

  // Verify DELETE_SENTINEL was written
  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      {
        "__soulguard_delete_sentinel__": true
      }
    `)
    .exits(0)
    .outputs(/soulguard_delete_sentinel/);
});

e2e("delete: errors on watched file", (t) => {
  t.$(`echo '# Notes' > notes.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard watch notes.md`)
    .expect(`
      exit 0
        + notes.md → watch

      Updated. 1 file now watched.
    `)
    .exits(0);

  t.$(`soulguard delete notes.md 2>&1`)
    .expect(`
      exit 1
      notes.md is not in the protect tier.
    `)
    .exits(1)
    .outputs(/not in the protect tier/);
});

e2e("delete: no-op when already staged for deletion", (t) => {
  t.$(`echo '# Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
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

  t.$(`soulguard delete SOUL.md`)
    .expect(`
      exit 0
        🗑️  SOUL.md (staged for deletion)

      Staged 1 path for deletion.
    `)
    .exits(0);

  // Second delete is a no-op
  t.$(`soulguard delete SOUL.md`)
    .expect(`
      exit 0
        · SOUL.md (already staged for deletion)
      Nothing to do.
    `)
    .exits(0);
});

e2e("delete: stages directory for deletion", (t) => {
  t.$(`mkdir -p memory && echo 'day one' > memory/day1.md && echo 'day two' > memory/day2.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
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

  t.$(`soulguard delete memory`)
    .expect(`
      exit 0
        🗑️  memory (staged for deletion)

      Staged 1 path for deletion.
    `)
    .exits(0)
    .outputs(/staged for deletion/);

  // Verify DELETE_SENTINEL was written as a file (not a directory)
  t.$(`cat .soulguard-staging/memory`)
    .expect(`
      exit 0
      {
        "__soulguard_delete_sentinel__": true
      }
    `)
    .exits(0)
    .outputs(/soulguard_delete_sentinel/);
});

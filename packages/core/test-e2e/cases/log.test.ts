import { e2e } from "../harness";

e2e("log: shows git history after sync", (t) => {
  t.$(`echo '# My Soul' > SOUL.md && mkdir -p memory && echo '# Notes' > memory/notes.md`)
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

      Updated. 1 file(s) now protected.
    `)
    .exits(0);

  t.$(`sudo soulguard watch memory/notes.md`)
    .expect(`
      exit 0
        + memory/notes.md → watch

      Updated. 1 file(s) now watched.
    `)
    .exits(0);

  // Modify a watch file and sync to trigger a git commit
  t.$(`echo '# Updated Notes' > memory/notes.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
        📝 Committed 3 file(s) to git
    `)
    .exits(0)
    .outputs(/Committed/);

  t.$(`soulguard log . | sed 's/^[0-9a-f]* /HASH /g'`)
    .expect(`
      exit 0
      HASH soulguard: sync
      HASH soulguard: watch memory/notes.md
      HASH soulguard: protect SOUL.md
      HASH soulguard: initial commit
    `)
    .exits(0)
    .outputs(/initial commit/);

  // Filter log to a specific file
  t.$(`soulguard log . memory/notes.md | sed 's/^[0-9a-f]* /HASH /g'`)
    .expect(`
      exit 0
      HASH soulguard: sync
      HASH soulguard: watch memory/notes.md
    `)
    .exits(0)
    .outputs(/sync/);
});

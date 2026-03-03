import { e2e } from "../harness";

e2e("watch: adds file and updates config", (t) => {
  t.$(`
    mkdir -p memory
    echo '# Notes' > memory/notes.md
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`SUDO_USER=agent soulguard init .`)
    .expect(`
      exit 0
      Soulguard Init — /workspace
        Created group: soulguard
        Created user: soulguardian
        Wrote soulguard.json
        Wrote /etc/sudoers.d/soulguard
        Prepared directories for staging
        Synced 1 protect-tier file(s)

      Done.
    `)
    .exits(0);

  t.$(`soulguard watch memory/notes.md`)
    .expect(`
      exit 0
        + memory/notes.md → watch

      Updated. 1 file(s) now watch-tier.
    `)
    .exits(0)
    .outputs(/watch/);

  t.$(`cat soulguard.json`)
    .expect(`
      exit 0
      {
        "version": 1,
        "files": {
          "soulguard.json": "protect",
          "memory/notes.md": "watch"
        }
      }
    `)
    .exits(0)
    .outputs(/"memory\/notes\.md":\s*"watch"/);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

      All files ok.
    `)
    .exits(0)
    .outputs(/All files ok/);
});

e2e("watch: resolves glob patterns", (t) => {
  t.$(`
    mkdir -p memory
    echo '# Day 1' > memory/2026-01-01.md
    echo '# Day 2' > memory/2026-01-02.md
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`SUDO_USER=agent soulguard init .`)
    .expect(`
      exit 0
      Soulguard Init — /workspace
        Created group: soulguard
        Created user: soulguardian
        Wrote soulguard.json
        Wrote /etc/sudoers.d/soulguard
        Prepared directories for staging
        Synced 1 protect-tier file(s)

      Done.
    `)
    .exits(0);

  t.$(`soulguard watch "memory/*.md"`)
    .expect(`
      exit 0
        + memory/*.md → watch

      Updated. 1 file(s) now watch-tier.
    `)
    .exits(0)
    .outputs(/watch/);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

      All files ok.
    `)
    .exits(0)
    .outputs(/All files ok/);
});

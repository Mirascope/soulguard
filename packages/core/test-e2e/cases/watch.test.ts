import { e2e } from "../harness";

e2e("watch: adds file and updates config", (t) => {
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
    .exits(0)
    .outputs(/Soulguard initialized/);
  t.$(`sudo soulguard watch notes.md`)
    .expect(`
      exit 0
        + notes.md → watch

      Updated. 1 file now watched.
    `)
    .exits(0)
    .outputs(/watch/);

  t.$(`stat -c '%U:%G %a' notes.md`)
    .expect(`
      exit 0
      agent:agent 644
    `)
    .exits(0)
    .outputs(/agent:.*644/);

  t.$(`cat soulguard.json`)
    .expect(`
      exit 0
      {
        "version": 1,
        "guardian": "soulguardian_agent",
        "files": {
          "soulguard.json": "protect",
          "notes.md": "watch"
        },
        "defaultOwnership": {
          "user": "agent",
          "group": "agent",
          "mode": "644"
        }
      }
    `)
    .exits(0)
    .outputs(/"notes\.md".*"watch"/);
});

e2e("watch: nonexistent directory is created", (t) => {
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);

  t.$(`sudo soulguard watch memory/`)
    .expect(`
      exit 0
        + memory/ → watch (created)

      Updated. 1 directory now watched.
    `)
    .exits(0)
    .outputs(/watch/);

  t.$(`test -d memory && echo exists`)
    .expect(`
      exit 0
      exists
    `)
    .exits(0)
    .outputs(/exists/);

  // Agent should be able to write to the watched directory
  t.$(`echo '# Notes' > memory/notes.md && echo success`)
    .expect(`
      exit 0
      success
    `)
    .exits(0)
    .outputs(/success/);
});

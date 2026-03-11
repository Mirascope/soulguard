import { e2e } from "../harness";

e2e("watch: adds file and updates config", (t) => {
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
    .exits(0)
    .outputs(/Soulguard initialized/);
  t.$(`sudo soulguard watch notes.md`)
    .expect(`
    exit 0
      + notes.md → watch

    Updated. 1 file(s) now watched.
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

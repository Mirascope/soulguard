import { e2e } from "../harness";
import { watchCmd } from "../helpers";

e2e("watch: adds file and updates config", (t) => {
  t.$(watchCmd("notes.md", "# Notes")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + notes.md → watch

    Updated. 1 file(s) now watch-tier.
  `);

  t.$(`stat -c '%U:%G %a' notes.md`)
    .expect(`
      exit 0
      agent:agent 644
    `)
    .exits(0)
    .outputs(/agent:soulguard 644/);

  t.$(`cat soulguard.json`)
    .expect(`
      exit 0
      {
        "version": 1,
        "files": {
          "soulguard.json": "protect",
          "notes.md": "watch"
        }
      }
    `)
    .exits(0)
    .outputs(/"notes\.md".*"watch"/);
});

e2e("watch: resolves glob patterns", (t) => {
  t.$(
    `mkdir -p memory && echo 'day 1' > memory/day1.md && echo 'day 2' > memory/day2.md && sudo soulguard init . && sudo soulguard watch 'memory/*.md'`,
  )
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
        + memory/*.md → watch

      Updated. 1 file(s) now watch-tier.
    `)
    .exits(0);

  t.$(`cat soulguard.json`)
    .expect(`
      exit 0
      {
        "version": 1,
        "files": {
          "soulguard.json": "protect",
          "memory/*.md": "watch"
        }
      }
    `)
    .exits(0)
    .outputs(/"memory\/day1\.md"/)
    .outputs(/"memory\/day2\.md"/);
});

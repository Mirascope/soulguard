import { e2e } from "../harness";
import { protectCmd } from "../helpers";

e2e("release: restores default ownership and cleans staging", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);

  t.$(`sudo soulguard release SOUL.md`)
    .expect(`
      exit 0
        - SOUL.md (released)

      Released. 1 file(s) untracked.
    `)
    .exits(0)
    .outputs(/release|Released/);

  t.$(`stat -c '%U:%G %a' SOUL.md`)
    .expect(`
      exit 0
      agent:agent 644
    `)
    .exits(0)
    .outputs(/agent/);

  t.$(`cat soulguard.json | grep -c '"SOUL.md"' || echo "0"`)
    .expect(`
      exit 0
      0
      0
    `)
    .exits(0)
    .outputs(/0/);
});

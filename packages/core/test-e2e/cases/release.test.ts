import { e2e } from "../harness";

e2e("release: restores default ownership and cleans staging", (t) => {
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

    Updated. 1 file(s) now protected.
  `)
    .exits(0);

  t.$(`sudo soulguard release SOUL.md`)
    .expect(`
      exit 0
        - SOUL.md (released)

      Released. 1 file(s) untracked.
    `)
    .exits(0)
    .outputs(/Released/);

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

  // Staging file should be cleaned up
  t.$(`test -f .soulguard-staging/SOUL.md && echo "exists" || echo "missing"`)
    .expect(`
      exit 0
      missing
    `)
    .exits(0)
    .outputs(/missing/);
});

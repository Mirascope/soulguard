import { e2e } from "../harness";

e2e("transitions: protect → watch downgrades permissions", (t) => {
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

  t.$(`stat -c '%U:%G %a' SOUL.md`)
    .expect(`
      exit 0
      soulguardian:soulguard 444
    `)
    .exits(0)
    .outputs(/soulguardian:soulguard 444/);

  t.$(`sudo soulguard watch SOUL.md`)
    .expect(`
      exit 0
        ↓ SOUL.md → watch (was protect)

      Updated. 1 file(s) now watched.
    `)
    .exits(0)
    .outputs(/watch/);

  // After downgrade, ownership should be restored to default (agent:agent 644)
  t.$(`stat -c '%U:%G %a' SOUL.md`)
    .expect(`
      exit 0
      agent:agent 644
    `)
    .exits(0)
    .outputs(/agent:agent 644/);
});

e2e("transitions: protect → release restores default ownership", (t) => {
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

  t.$(`stat -c '%U:%G %a' SOUL.md`)
    .expect(`
      exit 0
      soulguardian:soulguard 444
    `)
    .exits(0)
    .outputs(/soulguardian:soulguard 444/);

  t.$(`sudo soulguard release SOUL.md`)
    .expect(`
      exit 0
        - SOUL.md (released)

      Released. 1 file(s) untracked.
    `)
    .exits(0)
    .outputs(/released/);

  t.$(`stat -c '%U:%G %a' SOUL.md`)
    .expect(`
      exit 0
      agent:agent 644
    `)
    .exits(0)
    .outputs(/agent:agent 644/);
});

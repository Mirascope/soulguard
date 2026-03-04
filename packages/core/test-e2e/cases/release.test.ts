import { e2e } from "../harness";

e2e.skip("release: restores default ownership and cleans staging", (t) => {
  t.$(`echo '# My Soul' > SOUL.md`)
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

  t.$(`soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  t.$(`stat -c '%U:%G %a' SOUL.md`)
    .expect(`
      exit 0
      soulguardian:soulguard 444
    `)
    .exits(0)
    .outputs(/soulguardian:soulguard 444/);

  t.$(`soulguard release SOUL.md`)
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
      root:root 644
    `)
    .exits(0)
    .outputs(/root:root 644/);

  t.$(`cat soulguard.json`)
    .expect(`
      exit 0
      {
        "version": 1,
        "files": {
          "soulguard.json": "protect"
        }
      }
    `)
    .exits(0);

  // Staging file should be cleaned up
  t.$(`test -f .soulguard-staging/SOUL.md && echo "exists" || echo "missing"`)
    .expect(`
      exit 0
      missing
    `)
    .exits(0)
    .outputs(/missing/);
});

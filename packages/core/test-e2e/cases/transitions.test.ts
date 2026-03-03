import { e2e } from "../harness";

e2e.skip("transitions: protect → watch downgrades permissions", (t) => {
  t.$(`echo "# My Soul" > SOUL.md`)
    .expect(`
    exit 0
  `)
    .exits(0);

  t.$(`ls -lah SOUL.md | awk '{print $1, $3, $4, $NF}'`)
    .expect(`
      exit 0
      -rw-r--r-- root root SOUL.md
    `)
    .exits(0)
    .outputs(/root/);

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
    .exits(0)
    .outputs(/protect/);

  t.$(`ls -lah SOUL.md | awk '{print $1, $3, $4, $NF}'`)
    .expect(`
      exit 0
      -r--r--r-- soulguardian soulguard SOUL.md
    `)
    .exits(0)
    .outputs(/soulguardian/);

  t.$(`soulguard watch SOUL.md`)
    .expect(`
      exit 0
        ↓ SOUL.md → watch (was protect)

      Updated. 1 file(s) now watch-tier.
    `)
    .exits(0)
    .outputs(/watch/);

  t.$(`ls -lah SOUL.md | awk '{print $1, $3, $4, $NF}'`)
    .expect(`
      exit 0
      -rw-r--r-- root root SOUL.md
    `)
    .exits(0)
    .outputs(/root/);
});

e2e.skip("transitions: protect → release restores default ownership", (t) => {
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
});

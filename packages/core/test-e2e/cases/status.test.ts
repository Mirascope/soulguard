import { e2e } from "../harness";

e2e("status: reports all files ok when clean", (t) => {
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

  t.$(`soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

      All files ok.
    `)
    .exits(0)
    .outputs(/All files ok/);
});

e2e("status: reports drifted ownership and permissions", (t) => {
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

  // Simulate drift
  t.$(`
    chown root:root SOUL.md
    chmod 644 SOUL.md
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`soulguard status`)
    .expect(`
      exit 1
      Soulguard Status — /workspace

        ⚠️  SOUL.md
            owner is root, expected soulguardian
            group is root, expected soulguard
            mode is 644, expected 444

      1 drifted, 0 missing
    `)
    .exits(1)
    .outputs(/drifted/);
});

e2e("status: errors when no soulguard.json exists", (t) => {
  t.$(`soulguard status .`)
    .expect(`
      exit 1
      No soulguard.json found in .
    `)
    .exits(1)
    .outputs(/No soulguard\.json/);
});

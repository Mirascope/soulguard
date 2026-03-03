import { e2e } from "../harness";

e2e.skip("sync: fixes drifted ownership and permissions", (t) => {
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

  t.$(`soulguard sync`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Fixed:
        🔧 SOUL.md
            owner is root, expected soulguardian
            group is root, expected soulguard
            mode is 644, expected 444

      All files now ok.
    `)
    .exits(0)
    .outputs(/Fixed/);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

      All files ok.
    `)
    .exits(0)
    .outputs(/All files ok/);
});

e2e.skip("sync: agent can sudo sync via scoped sudoers", (t) => {
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

  // Agent syncs via scoped sudoers — workspace is already clean
  t.$(`su - agent -c "sudo soulguard sync $(pwd)"`)
    .expect(`
      exit 0
      Soulguard Sync — /workspace

      Nothing to fix — all files ok.
    `)
    .exits(0)
    .outputs(/Nothing to fix/);
});

e2e.skip("sync: agent without sudo cannot fix drift", (t) => {
  t.$(`
    echo '{"version":1,"files":{"SOUL.md":"protect"}}' > soulguard.json
    echo '# My Soul' > SOUL.md
    chmod 755 .
    chmod o+r soulguard.json SOUL.md
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Agent syncs drifted workspace without sudo — chown should fail
  t.$(`su - agent -c "soulguard sync $(pwd)"`)
    .expect(`
    exit 1
  `)
    .exits(1);
});

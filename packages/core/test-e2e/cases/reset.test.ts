import { e2e } from "../harness";

e2e("reset: restores staging to match protect-tier", (t) => {
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

  // Agent creates staging and modifies it
  t.$(
    `su - agent -c "cp $(pwd)/SOUL.md $(pwd)/.soulguard.SOUL.md && echo '# Hacked Soul' > $(pwd)/.soulguard.SOUL.md"`,
  ).expect(`
    exit 1
    -bash: line 1: /workspace/.soulguard.SOUL.md: Permission denied
  `);

  t.$(`soulguard reset .`)
    .expect(`
      exit 0
      Soulguard Reset — /workspace

      Reset 1 staging file(s):
        ↩️  soulguard.json
    `)
    .exits(0)
    .outputs(/Reset/);

  // Protect-tier unchanged
  t.$(`cat SOUL.md`)
    .expect(`
      exit 0
      # My Soul
    `)
    .exits(0)
    .outputs(/# My Soul/);

  // Staging reset to match
  t.$(`cat .soulguard.SOUL.md`)
    .expect(`
      exit 0
      # My Soul
    `)
    .exits(0)
    .outputs(/# My Soul/);
});

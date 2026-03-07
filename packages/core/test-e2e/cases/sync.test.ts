import { e2e } from "../harness";

e2e("sync: fixes drifted ownership and permissions", (t) => {
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

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Simulate drift
  t.$(`
    sudo chown root:root SOUL.md
    sudo chmod 644 SOUL.md
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`soulguard status`)
    .expect(`
      exit 1
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ⚠️  SOUL.md (protect)
            owner is root, expected soulguardian
            group is root, expected soulguard
            mode is 644, expected 444

      1 drifted, 0 missing
    `)
    .exits(1)
    .outputs(/drifted/);

  t.$(`sudo soulguard sync`)
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

        ✓ soulguard.json (protect, ok)
        ✓ SOUL.md (protect, ok)

      All files ok.
    `)
    .exits(0)
    .outputs(/All files ok/);
});

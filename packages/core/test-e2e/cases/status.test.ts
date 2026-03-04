import { e2e } from "../harness";
import { protectCmd } from "../helpers";

e2e("status: reports all files ok when clean", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);
  t.$(`sudo soulguard sync`)
    .expect(`
    exit 0
    Soulguard Sync — /workspace

    Fixed:
      🔧 soulguard.json
          owner is root, expected soulguardian
          group is root, expected soulguard
          mode is 644, expected 444

    All files now ok.
  `)
    .exits(0);

  t.$(`sudo soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ✓ SOUL.md (protect, ok)

      All files ok.
    `)
    .exits(0)
    .outputs(/All files ok|ok/);
});

e2e("status: reports drifted ownership and permissions", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);
  t.$(`sudo soulguard sync`)
    .expect(`
    exit 0
    Soulguard Sync — /workspace

    Fixed:
      🔧 soulguard.json
          owner is root, expected soulguardian
          group is root, expected soulguard
          mode is 644, expected 444

    All files now ok.
  `)
    .exits(0);

  // Simulate drift
  t.$(`sudo chown root:root SOUL.md && sudo chmod 644 SOUL.md`)
    .expect(`
    exit 0
  `)
    .exits(0);

  t.$(`sudo soulguard status`)
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
});

e2e("status: errors when no soulguard.json exists", (t) => {
  t.$(`sudo soulguard status . 2>&1`)
    .expect(`
      exit 1
      No soulguard.json found in .
    `)
    .exits(1)
    .outputs(/No soulguard\.json/);
});

e2e("status: shows staged change indicators", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);
  t.$(`sudo soulguard sync`)
    .expect(`
    exit 0
    Soulguard Sync — /workspace

    Fixed:
      🔧 soulguard.json
          owner is root, expected soulguardian
          group is root, expected soulguard
          mode is 644, expected 444

    All files now ok.
  `)
    .exits(0);

  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);
  t.$(`echo '# Modified Soul' | sudo tee .soulguard-staging/SOUL.md > /dev/null`)
    .expect(`
    exit 0
  `)
    .exits(0);

  t.$(`sudo soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ✓ SOUL.md (protect, ok, 1 staged change)

      All files ok.
    `)
    .exits(0)
    .outputs(/staged/);
});

e2e("status: shows directory protection", (t) => {
  t.$(
    `mkdir -p skills && echo '# Python' > skills/python.md && echo '# TS' > skills/ts.md && sudo soulguard init . && sudo soulguard protect skills/ && sudo soulguard sync`,
  )
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
        + skills/ → protect

      Updated. 1 file(s) now protect-tier.
      Soulguard Sync — /workspace

      Fixed:
        🔧 soulguard.json
            owner is root, expected soulguardian
            group is root, expected soulguard
            mode is 644, expected 444

      All files now ok.
    `)
    .exits(0);

  t.$(`sudo soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

        ✓ soulguard.json (protect, ok)
        ✓ skills/ (protect, ok)

      All files ok.
    `)
    .exits(0)
    .outputs(/ok/);
});

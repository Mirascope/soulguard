import { e2e } from "../harness";
import { protectCmd } from "../helpers";

e2e("diff: shows no changes for unmodified staging", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);
  t.$(`sudo soulguard stage SOUL.md && sudo soulguard stage soulguard.json`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
      📝 soulguard.json (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  t.$(`sudo soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace

        ✅ soulguard.json (no changes)
        ✅ SOUL.md (no changes)

      No changes
    `)
    .exits(0)
    .outputs(/[Nn]o changes/);
});

e2e("diff: shows unified diff for modified staging", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);
  t.$(`sudo soulguard stage SOUL.md && sudo soulguard stage soulguard.json`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
      📝 soulguard.json (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);
  t.$(`echo '# My Modified Soul' | sudo tee .soulguard-staging/SOUL.md > /dev/null`)
    .expect(`
    exit 0
  `)
    .exits(0);

  t.$(`sudo soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ✅ soulguard.json (no changes)
        📝 SOUL.md
            ===================================================================
            --- a/SOUL.md
            +++ b/SOUL.md
            @@ -1,1 +1,1 @@
            -# My Soul
            +# My Modified Soul
            

      1 file(s) changed
      Apply hash: 3ef797046758a06b4f4cae5b20fdca383f4baff6ec653abe6b42597618a0b577
    `)
    .exits(1)
    .outputs(/SOUL\.md/)
    .outputs(/Apply hash:/);
});

e2e("diff: shows new file when protect-tier copy is missing", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);
  t.$(`sudo soulguard stage SOUL.md && sudo soulguard stage soulguard.json`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
      📝 soulguard.json (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);
  t.$(`sudo rm SOUL.md`)
    .expect(`
    exit 0
  `)
    .exits(0);

  t.$(`sudo soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ✅ soulguard.json (no changes)
        ⚠️ SOUL.md (protect-tier file missing — new file)

      1 file(s) changed
      Apply hash: ddc1ac8615d0e23d031c518f50b17bacc02fd15e5e5cd1a6e2993978f50221a0
    `)
    .exits(1)
    .outputs(/missing|new file/);
});

// --- Directory-aware diff tests ---

e2e("diff: directory with modified staged file shows diff", (t) => {
  t.$(
    `mkdir -p memory && echo 'day one notes' > memory/day1.md && sudo soulguard init . && sudo soulguard protect memory && sudo soulguard sync`,
  )
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
        + memory → protect

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

  t.$(`sudo soulguard stage soulguard.json`)
    .expect(`
    exit 0
      📝 soulguard.json (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);
  // Manually create staging for directory file (stage command doesn't support individual files in dirs yet)
  t.$(
    `sudo mkdir -p .soulguard-staging/memory && sudo cp memory/day1.md .soulguard-staging/memory/day1.md && echo 'modified notes' | sudo tee .soulguard-staging/memory/day1.md > /dev/null`,
  )
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ✅ soulguard.json (no changes)
        📝 memory/day1.md
            ===================================================================
            --- a/memory/day1.md
            +++ b/memory/day1.md
            @@ -1,1 +1,1 @@
            -day one notes
            +modified notes
            

      1 file(s) changed
      Apply hash: 9a65c0ca63eff83363483059ad5c33c737fab5552b2ca59767c891054181a195
    `)
    .exits(1)
    .outputs(/memory\/day1\.md/);
});

e2e("diff: directory with no changes shows clean", (t) => {
  t.$(
    `mkdir -p memory && echo 'day one notes' > memory/day1.md && sudo soulguard init . && sudo soulguard protect memory && sudo soulguard sync`,
  )
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
        + memory → protect

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

  t.$(`sudo soulguard stage soulguard.json`)
    .expect(`
    exit 0
      📝 soulguard.json (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  t.$(`sudo soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace

        ✅ soulguard.json (no changes)

      No changes
    `)
    .exits(0)
    .outputs(/[Nn]o changes/);
});

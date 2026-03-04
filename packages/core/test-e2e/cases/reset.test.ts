import { e2e } from "../harness";
import { protectCmd } from "../helpers";

e2e("reset: dry run lists staged files", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);

  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  t.$(`sudo soulguard reset -w .`)
    .expect(`
      exit 0
      Staged changes:
        .soulguard-staging/SOUL.md

      Use --all to reset everything, or specify paths to reset.
    `)
    .exits(0)
    .outputs(/Staged changes/);

  // File should still exist after dry run
  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      # My Soul
    `)
    .exits(0);
});

e2e("reset: specific file removes staging copy", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);

  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  t.$(`sudo soulguard reset -w . SOUL.md`)
    .expect(`
      exit 0
      Reset 1 staged file(s):
        .soulguard-staging/SOUL.md
    `)
    .exits(0)
    .outputs(/Reset/);

  t.$(`test -f .soulguard-staging/SOUL.md && echo exists || echo gone`)
    .expect(`
      exit 0
      gone
    `)
    .exits(0)
    .outputs(/gone/);
});

e2e("reset: --all empties staging tree", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);

  t.$(`sudo soulguard stage SOUL.md`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  t.$(`sudo soulguard reset -w . --all`)
    .expect(`
      exit 0
      Reset 1 staged file(s):
        .soulguard-staging/SOUL.md
    `)
    .exits(0)
    .outputs(/Reset/);

  t.$(`test -f .soulguard-staging/SOUL.md && echo exists || echo gone`)
    .expect(`
      exit 0
      gone
    `)
    .exits(0)
    .outputs(/gone/);
});

e2e("reset: no staged changes shows clean message", (t) => {
  t.$(`sudo soulguard init .`)
    .expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
  `)
    .exits(0);

  t.$(`sudo soulguard reset -w .`)
    .expect(`
      exit 0
      Nothing staged — staging tree is clean.
    `)
    .exits(0)
    .outputs(/clean|Nothing staged/);
});

// --- New tests ---

e2e("reset: selective reset keeps other staged files", (t) => {
  t.$(
    `echo '# Soul' > SOUL.md && echo '# Notes' > notes.md && sudo soulguard init . && sudo soulguard protect SOUL.md && sudo soulguard protect notes.md`,
  )
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
        + SOUL.md → protect

      Updated. 1 file(s) now protect-tier.
        + notes.md → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  t.$(`sudo soulguard stage SOUL.md && sudo soulguard stage notes.md`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
      📝 notes.md (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  // Reset only SOUL.md
  t.$(`sudo soulguard reset -w . SOUL.md`)
    .expect(`
      exit 0
      Reset 1 staged file(s):
        .soulguard-staging/SOUL.md
    `)
    .exits(0)
    .outputs(/Reset/);

  // notes.md staging should still exist
  t.$(`test -f .soulguard-staging/notes.md && echo exists || echo gone`)
    .expect(`
      exit 0
      exists
    `)
    .exits(0)
    .outputs(/exists/);
});

import { e2e } from "../harness";

e2e("create: creates empty staging for new file in protected directory", (t) => {
  t.$(`mkdir -p skills && echo '# Python' > skills/python.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect skills/`)
    .expect(`
      exit 0
        + skills/ → protect

      Updated. 1 directory now protected.
    `)
    .exits(0);

  // Create a new file that doesn't exist on disk
  t.$(`soulguard create skills/new.md`)
    .expect(`
      exit 0
        + skills/new.md → .soulguard-staging/skills/new.md

      Created 1 staging entry.
    `)
    .exits(0)
    .outputs(/\.soulguard-staging\//);

  // Verify empty staging file was created
  t.$(`cat .soulguard-staging/skills/new.md | wc -c | tr -d ' '`)
    .expect(`
      exit 0
      0
    `)
    .exits(0);
});

e2e("create: errors on file not in protect tier", (t) => {
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);

  t.$(`soulguard create random.md 2>&1`)
    .expect(`
      exit 1
      random.md is not in the protect tier.
    `)
    .exits(1)
    .outputs(/not in the protect tier/);
});

e2e("create: no-op when file already exists on disk", (t) => {
  t.$(`echo '# Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file now protected.
    `)
    .exits(0);

  // SOUL.md exists on disk, staging copy was auto-created by protect — soft no-op
  t.$(`soulguard create SOUL.md`)
    .expect(`
      exit 0
        · SOUL.md (already exists — staging copy was created automatically)
      Nothing to create.
    `)
    .exits(0)
    .outputs(/already exists/);
});

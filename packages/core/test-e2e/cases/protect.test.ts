import { e2e } from "../harness";

e2e("protect: sets correct ownership and permissions", (t) => {
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
    .exits(0)
    .outputs(/Soulguard initialized/);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
    exit 0
      + SOUL.md → protect

    Updated. 1 file(s) now protected.
  `)
    .exits(0)
    .outputs(/protect/);

  t.$(`stat -c '%U:%G %a' SOUL.md`)
    .expect(`
      exit 0
      soulguardian:soulguard 444
    `)
    .exits(0)
    .outputs(/soulguardian:soulguard 444/);

  t.$(`cat soulguard.json`)
    .expect(`
      exit 0
      {
        "version": 1,
        "files": {
          "soulguard.json": "protect",
          "SOUL.md": "protect"
        },
        "defaultOwnership": {
          "user": "agent",
          "group": "agent",
          "mode": "644"
        }
      }
    `)
    .exits(0)
    .outputs(/"SOUL\.md"/);
});

e2e("protect: blocks agent writes", (t) => {
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

    Updated. 1 file(s) now protected.
  `)
    .exits(0);

  t.$(
    `sh -c "echo hacked > $(pwd)/SOUL.md" 2>&1 && echo "WRITE SUCCEEDED (BAD)" || echo "WRITE BLOCKED (GOOD)"`,
  )
    .expect(`
      exit 0
      sh: 1: cannot create /workspace/SOUL.md: Permission denied
      WRITE BLOCKED (GOOD)
    `)
    .exits(0)
    .outputs(/Permission denied/)
    .outputs(/WRITE BLOCKED/);

  t.$(`cat SOUL.md`)
    .expect(`
      exit 0
      # My Soul
    `)
    .exits(0)
    .outputs(/# My Soul/);
});

e2e("protect: directory protection blocks new file creation", (t) => {
  t.$(
    `mkdir -p skills && echo '# Python' > skills/python.md && echo '# TypeScript' > skills/typescript.md`,
  )
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
  t.$(`sudo soulguard protect skills/`)
    .expect(`
    exit 0
      + skills/ → protect

    Updated. 1 file(s) now protected.
  `)
    .exits(0)
    .outputs(/protect/);

  t.$(`stat -c '%U:%G %a' skills`)
    .expect(`
      exit 0
      soulguardian:soulguard 555
    `)
    .exits(0)
    .outputs(/soulguardian:soulguard/);

  t.$(`stat -c '%U:%G %a' skills/python.md`)
    .expect(`
      exit 0
      soulguardian:soulguard 444
    `)
    .exits(0)
    .outputs(/soulguardian:soulguard 444/);

  t.$(
    `sh -c "echo malicious > $(pwd)/skills/malicious.md" 2>&1 && echo "CREATE SUCCEEDED (BAD)" || echo "CREATE BLOCKED (GOOD)"`,
  )
    .expect(`
      exit 0
      sh: 1: cannot create /workspace/skills/malicious.md: Permission denied
      CREATE BLOCKED (GOOD)
    `)
    .exits(0)
    .outputs(/Permission denied/)
    .outputs(/CREATE BLOCKED/);
});

e2e("protect: already protected file is no-op", (t) => {
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

    Updated. 1 file(s) now protected.
  `)
    .exits(0);

  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        · SOUL.md (already protect)
      Nothing to change.
    `)
    .exits(0)
    .outputs(/already protect/);
});

e2e("protect: nonexistent file errors", (t) => {
  t.$(`sudo soulguard init .`)
    .expect(`
    exit 0
    ✓ Soulguard initialized.
  `)
    .exits(0);

  t.$(`sudo soulguard protect nonexistent.md 2>&1`)
    .expect(`
      exit 1
      nonexistent.md does not exist
    `)
    .exits(1)
    .outputs(/does not exist/);
});

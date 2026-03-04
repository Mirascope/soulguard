import { e2e } from "../harness";

// 1. Protect a file — verify ownership + permissions
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
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0);

  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file(s) now protect-tier.
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

  // Config should be updated
  t.$(`cat soulguard.json`)
    .expect(`
      exit 0
      {
        "version": 1,
        "files": {
          "soulguard.json": "protect",
          "SOUL.md": "protect"
        }
      }
    `)
    .exits(0)
    .outputs(/"SOUL\.md"/);
});

// 2. Agent cannot write to a protected file
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
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0);

  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Agent tries to write to the protected file
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

  // File is still intact
  t.$(`cat SOUL.md`)
    .expect(`
      exit 0
      # My Soul
    `)
    .exits(0)
    .outputs(/# My Soul/);
});

// 3. Protect a directory — ownership on dir + contents, agent blocked
e2e("protect: directory protection blocks new file creation", (t) => {
  t.$(`
    mkdir -p skills
    echo '# Python' > skills/python.md
    echo '# TypeScript' > skills/typescript.md
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0);

  t.$(`sudo soulguard protect skills/`)
    .expect(`
      exit 0
        + skills/ → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0)
    .outputs(/protect/);

  // Directory and contents are owned by soulguardian
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

  // Agent cannot create new files in the directory
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

// 4. Protect a file that's already protected (no-op)
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
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0);

  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0);

  // Protect again — should be no-op
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        · SOUL.md (already protect)
      Nothing to change.
    `)
    .exits(0)
    .outputs(/already protect/);
});

// 5. Protect a file that doesn't exist — error
e2e("protect: nonexistent file errors", (t) => {
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
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

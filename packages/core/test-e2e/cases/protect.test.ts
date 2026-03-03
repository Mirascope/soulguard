import { e2e } from "../harness";

e2e.skip("protect: sets correct ownership and permissions", (t) => {
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

  t.$(`stat -c '%U:%G %a' SOUL.md`)
    .expect(`
      exit 0
      root:root 644
    `)
    .exits(0)
    .outputs(/root:root 644/);

  t.$(`soulguard protect SOUL.md`)
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

  // Staging is NOT eagerly created
  t.$(`test -f .soulguard.SOUL.md && echo "exists" || echo "not pre-created"`)
    .expect(`
      exit 0
      not pre-created
    `)
    .exits(0)
    .outputs(/not pre-created/);

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
    .outputs(/"SOUL\.md":\s*"protect"/);
});

e2e.skip("protect: blocks agent writes and chown", (t) => {
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

  // Agent tries to write to the protected file
  t.$(
    `su - agent -c "(echo hacked > $(pwd)/SOUL.md) 2>&1" && echo "WRITE SUCCEEDED (BAD)" || echo "WRITE BLOCKED (GOOD)"`,
  )
    .expect(`
      exit 0
      -bash: line 1: /workspace/SOUL.md: Permission denied
      WRITE BLOCKED (GOOD)
    `)
    .exits(0)
    .outputs(/Permission denied/)
    .outputs(/WRITE BLOCKED/);

  // Agent tries to chown the file back
  t.$(
    `su - agent -c "chown agent:agent $(pwd)/SOUL.md 2>&1" && echo "CHOWN SUCCEEDED (BAD)" || echo "CHOWN BLOCKED (GOOD)"`,
  )
    .expect(`
      exit 0
      chown: changing ownership of '/workspace/SOUL.md': Operation not permitted
      CHOWN BLOCKED (GOOD)
    `)
    .exits(0)
    .outputs(/Operation not permitted/)
    .outputs(/CHOWN BLOCKED/);

  // File is still intact
  t.$(`cat SOUL.md`)
    .expect(`
      exit 0
      # My Soul
    `)
    .exits(0)
    .outputs(/# My Soul/);
});

e2e.skip("protect: resolves glob patterns", (t) => {
  t.$(`
    mkdir -p skills
    echo '# Python' > skills/python.md
    echo '# TypeScript' > skills/typescript.md
  `)
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

  t.$(`soulguard protect "skills/*.md"`)
    .expect(`
      exit 0
        + skills/*.md → protect

      Updated. 1 file(s) now protect-tier.
    `)
    .exits(0)
    .outputs(/protect/);

  // Agent creates staging copies
  t.$(
    `su - agent -c "cp $(pwd)/skills/python.md $(pwd)/skills/.soulguard.python.md && cp $(pwd)/skills/typescript.md $(pwd)/skills/.soulguard.typescript.md"`,
  ).expect(`
    exit 1
    cp: cannot create regular file '/workspace/skills/.soulguard.python.md': Permission denied
  `);

  t.$(`soulguard status`)
    .expect(`
      exit 0
      Soulguard Status — /workspace

      All files ok.
    `)
    .exits(0);

  // Agent modifies a skill staging copy
  t.$(`su - agent -c "echo '# Python v2' > $(pwd)/skills/.soulguard.python.md"`).expect(`
    exit 1
    -bash: line 1: /workspace/skills/.soulguard.python.md: Permission denied
  `);

  // Changes found → exit 1 (git diff convention)
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        🗑️ skills/python.md (staged for deletion)
        🗑️ skills/typescript.md (staged for deletion)
        🗑️ soulguard.json (staged for deletion)

      3 file(s) changed
      Apply hash: db95de975c801075d2ef5550e5cb6be90d5c4dc66c0d53537d1c2bcb77985ff2
    `)
    .exits(1);

  // Approve the change
  t.$(
    `HASH=$({ soulguard diff . || true; } 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && soulguard apply . --hash "$HASH"`,
  ).expect(`
    exit 1
    Self-protection: Cannot delete soulguard.json — it is required for soulguard to function
  `);

  t.$(`cat skills/python.md`)
    .expect(`
      exit 0
      # Python
    `)
    .exits(0);
});

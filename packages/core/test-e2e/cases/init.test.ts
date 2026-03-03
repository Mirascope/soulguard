import { e2e } from "../harness";

// 1. Happy path — fresh init, verify side effects
e2e("init: happy path creates dirs, config, registry, git", (t) => {
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0)
    .outputs(/Soulguard initialized/);

  // Verify .soulguard/ owned by soulguardian:soulguard, mode 755
  t.$(`stat -c '%U:%G %a' .soulguard`)
    .expect(`
      exit 0
      soulguardian:soulguard 755
    `)
    .exits(0);

  // Verify .soulguard-staging/ exists
  t.$(`test -d .soulguard-staging && echo exists`)
    .expect(`
      exit 0
      exists
    `)
    .exits(0);

  // Verify registry.json owned by soulguardian:soulguard, mode 444
  t.$(`stat -c '%U:%G %a' .soulguard/registry.json`)
    .expect(`
      exit 0
      soulguardian:soulguard 444
    `)
    .exits(0);

  // Verify soulguard.json was written with default config
  t.$(`cat soulguard.json`)
    .expect(`
      exit 0
      {
        "version": 1,
        "files": {
          "soulguard.json": "protect"
        }
      }
    `)
    .exits(0);

  // Verify git initial commit contains soulguard.json
  t.$(`git --git-dir .soulguard/.git --work-tree . log --oneline --name-only -1`)
    .expect(`
      exit 0
      GITHASH soulguard: initial commit
      soulguard.json
    `)
    .exits(0)
    .outputs(/soulguard\.json/);
});

// 2. Idempotent — second init succeeds, skips completed steps
e2e("init: second run is idempotent", (t) => {
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0)
    .outputs(/Soulguard initialized/);

  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0)
    .outputs(/Soulguard initialized/);
});

// 3. Pre-existing config — preserves it, doesn't overwrite
e2e("init: preserves pre-existing config", (t) => {
  t.$(`
    echo '# My Soul' > SOUL.md
    cat > soulguard.json <<'JSON'
{"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
JSON
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      3 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0)
    .outputs(/Soulguard initialized/);

  // Verify config still has SOUL.md
  t.$(`grep SOUL.md soulguard.json`)
    .expect(`
      exit 0
      {"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
    `)
    .exits(0)
    .outputs(/SOUL\.md/);
});

// 4. Does NOT enforce protection — files still owned by original user
e2e("init: does not enforce protection", (t) => {
  t.$(`
    echo '# My Soul' > SOUL.md
    cat > soulguard.json <<'JSON'
{"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
JSON
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      3 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0)
    .outputs(/need protection/);

  // SOUL.md should still be owned by root (the user running the test), not soulguardian
  t.$(`stat -c '%U' SOUL.md`)
    .expect(`
      exit 0
      root
    `)
    .exits(0);
});

// 5. Git commit — soulguard.json in initial commit
e2e("init: git initial commit contains soulguard.json", (t) => {
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0);

  t.$(`git --git-dir .soulguard/.git --work-tree . log --oneline --name-only -1`)
    .expect(`
      exit 0
      GITHASH soulguard: initial commit
      soulguard.json
    `)
    .exits(0)
    .outputs(/soulguard\.json/);
});

// 6. Malformed config — bails early with helpful error
e2e("init: malformed config bails early", (t) => {
  t.$(`echo '{not valid json' > soulguard.json`)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard init . 2>&1`)
    .expect(`
      exit 1
      Invalid soulguard.json: JSON Parse error: Expected '}'
      Fix or remove soulguard.json and re-run \`sudo soulguard init\`.
    `)
    .exits(1)
    .outputs(/Invalid soulguard\.json/)
    .outputs(/Fix or remove soulguard\.json/);

  // No side effects — no .soulguard/ dir created
  t.$(`test -d .soulguard && echo exists || echo missing`)
    .expect(`
      exit 0
      missing
    `)
    .exits(0)
    .outputs(/missing/);
});

// 7. Malformed registry — bails early with helpful error
e2e("init: malformed registry bails early", (t) => {
  t.$(`
    mkdir -p .soulguard
    echo '{not valid json' > .soulguard/registry.json
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard init . 2>&1`)
    .expect(`
      exit 1
      Invalid registry: JSON Parse error: Expected '}'
      Fix or remove .soulguard/registry.json and re-run \`sudo soulguard init\`.
    `)
    .exits(1)
    .outputs(/Invalid registry/);
});

// 8. No sudo — fails with clear message
e2e("init: no sudo fails with clear message", (t) => {
  t.$(`su - nobody -s /bin/sh -c "soulguard init $(pwd)" 2>&1`)
    .expect(`
      exit 1
      su: warning: cannot change directory to /nonexistent: No such file or directory
      soulguard init requires sudo. Run with: sudo soulguard init
    `)
    .exits(1)
    .outputs(/requires sudo/);
});

// 9. Custom workspace path
e2e("init: custom workspace path", (t) => {
  t.$(`mkdir -p /tmp/custom-ws`)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard init /tmp/custom-ws`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
    `)
    .exits(0)
    .outputs(/Soulguard initialized/);

  t.$(`test -d /tmp/custom-ws/.soulguard && echo exists`)
    .expect(`
      exit 0
      exists
    `)
    .exits(0);
});

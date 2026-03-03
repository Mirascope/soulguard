import { e2e } from "../harness";

// 1. Happy path — fresh init, verify side effects
e2e("init: happy path creates group, user, config, registry, git, staging dir", (t) => {
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
    `)
    .exits(0)
    .outputs(/Created group/)
    .outputs(/Created user/)
    .outputs(/Wrote soulguard\.json/)
    .outputs(/Initialized registry/)
    .outputs(/Initialized git/)
    .outputs(/Soulguard initialized/);

  // Verify .soulguard/ exists and is owned by soulguardian
  t.$(`stat -c '%U:%G' .soulguard`)
    .expect(`
      exit 0
      soulguardian:soulguard
    `)
    .exits(0)
    .outputs(/soulguardian:soulguard/);

  // Verify .soulguard-staging/ exists
  t.$(`test -d .soulguard-staging && echo exists`)
    .expect(`
      exit 0
      exists
    `)
    .exits(0);

  // Verify registry.json exists
  t.$(`test -f .soulguard/registry.json && echo exists`)
    .expect(`
      exit 0
      exists
    `)
    .exits(0);

  // Verify soulguard.json was written with default config
  t.$(
    `cat soulguard.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'])"`,
  )
    .expect(`
      exit 0
      1
    `)
    .exits(0);
});

// 2. Idempotent — second init succeeds, skips completed steps
e2e("init: second run is idempotent", (t) => {
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
    `)
    .exits(0)
    .outputs(/Soulguard initialized/);

  // Second init — should skip already-completed steps
  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
    `)
    .exits(0)
    .outputs(/Already initialized/);
});

// 3. Pre-existing config — preserves it, doesn't overwrite
e2e("init: preserves pre-existing config", (t) => {
  t.$(`
    echo '# My Soul' > SOUL.md
    cat > soulguard.json <<'CONFIG'
{"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
CONFIG
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
    `)
    .exits(0)
    .outputs(/Soulguard initialized/);

  // Verify config still has SOUL.md
  t.$(
    `cat soulguard.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('SOUL.md' in d['files'])"`,
  )
    .expect(`
      exit 0
      True
    `)
    .exits(0);
});

// 4. Does NOT enforce protection — files still owned by original user
e2e("init: does not enforce protection", (t) => {
  t.$(`
    echo '# My Soul' > SOUL.md
    cat > soulguard.json <<'CONFIG'
{"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
CONFIG
  `)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard init .`)
    .expect(`
      exit 0
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
    `)
    .exits(0);

  t.$(`git --git-dir .soulguard/.git --work-tree . log --oneline --name-only -1`)
    .expect(`
      exit 0
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
    `)
    .exits(1)
    .outputs(/Invalid registry/);
});

// 8. No sudo — fails with clear message
e2e("init: no sudo fails with clear message", (t) => {
  t.$(`su - nobody -s /bin/sh -c "soulguard init $(pwd)" 2>&1`)
    .expect(`
      exit 1
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

import { e2e } from "../harness";

e2e.skip("apply: applies staged changes with hash", (t) => {
  t.$(`echo '# My Soul' > SOUL.md`).expect(``).exits(0);

  t.$(`SUDO_USER=agent soulguard init .`).expect(``).exits(0);

  t.$(`soulguard protect SOUL.md`).expect(``).exits(0);

  // Agent creates staging and modifies it
  t.$(
    `su - agent -c "cp $(pwd)/SOUL.md $(pwd)/.soulguard-staging/SOUL.md && echo '# My Updated Soul' > $(pwd)/.soulguard-staging/SOUL.md"`,
  ).expect(``);

  t.$(
    `HASH=$({ soulguard diff . || true; } 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && echo "HASH: $HASH"`,
  )
    .expect(``)
    .exits(0)
    .outputs(/HASH: [0-9a-f]+/);

  t.$(
    `HASH=$({ soulguard diff . || true; } 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && soulguard apply . --hash "$HASH"`,
  )
    .expect(``)
    .exits(0);

  // Verify protect-tier file has new content
  t.$(`cat SOUL.md`)
    .expect(``)
    .exits(0)
    .outputs(/My Updated Soul/);
});

e2e.skip("apply: blocks invalid soulguard.json changes (self-protection)", (t) => {
  t.$(`echo '# My Soul' > SOUL.md`).expect(``).exits(0);

  t.$(`SUDO_USER=agent soulguard init .`).expect(``).exits(0);

  t.$(`soulguard protect SOUL.md`).expect(``).exits(0);

  // Agent writes invalid config to staging
  t.$(
    `su - agent -c "echo '{"vault":["SOUL.md"]}' > $(pwd)/.soulguard-staging/soulguard.json"`,
  ).expect(``);

  // Apply should be blocked by self-protection
  t.$(
    `HASH=$({ soulguard diff . || true; } 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && soulguard apply . --hash "$HASH" 2>&1`,
  )
    .expect(``)
    .exits(0)
    .outputs(/Self-protection.*invalid/);

  // soulguard.json is unchanged
  t.$(`cat soulguard.json`)
    .expect(``)
    .exits(0)
    .outputs(/"version":\s*1/);
});

e2e.skip("apply: handles file deletion through staging", (t) => {
  t.$(`
    echo '# My Soul' > SOUL.md
    echo '# Bootstrap' > BOOTSTRAP.md
  `)
    .expect(``)
    .exits(0);

  t.$(`SUDO_USER=agent soulguard init .`).expect(``).exits(0);

  t.$(`soulguard protect SOUL.md BOOTSTRAP.md`).expect(``).exits(0);

  // Agent creates staging copies, then deletes BOOTSTRAP staging
  t.$(
    `su - agent -c "cp $(pwd)/SOUL.md $(pwd)/.soulguard-staging/SOUL.md && cp $(pwd)/BOOTSTRAP.md $(pwd)/.soulguard-staging/BOOTSTRAP.md"`,
  ).expect(``);

  t.$(`su - agent -c "rm $(pwd)/.soulguard-staging/BOOTSTRAP.md"`).expect(``);

  // Changes found (deletion) → exit 1 (git diff convention)
  t.$(`soulguard diff .`).expect(``).exits(1).outputs(/delet/);

  t.$(
    `HASH=$({ soulguard diff . || true; } 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && soulguard apply . --hash "$HASH"`,
  )
    .expect(``)
    .exits(0);

  // BOOTSTRAP.md should be gone
  t.$(`test -f BOOTSTRAP.md && echo "yes" || echo "no"`).expect(``).exits(0).outputs(/no/);

  // SOUL.md should still exist
  t.$(`test -f SOUL.md && echo "yes" || echo "no"`).expect(``).exits(0).outputs(/yes/);
});

import { e2e } from "../harness";

e2e.skip("apply: applies staged changes with hash", (t) => {
  t.$(`echo '# My Soul' > SOUL.md`).expect(``).exits(0);

  t.$(`SUDO_USER=agent soulguard init .`).expect(``).exits(0);

  t.$(`soulguard protect SOUL.md`).expect(``).exits(0);

  // Agent creates staging and modifies it
  t.$(
    `su - agent -c "cp $(pwd)/SOUL.md $(pwd)/.soulguard.SOUL.md && echo '# My Updated Soul' > $(pwd)/.soulguard.SOUL.md"`,
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
  t.$(`su - agent -c "echo '{"vault":["SOUL.md"]}' > $(pwd)/.soulguard.soulguard.json"`).expect(``);

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

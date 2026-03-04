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

e2e.skip("apply: applies modified file inside protected directory", (t) => {
  t.$(
    `mkdir -p mydir && echo 'file1 content' > mydir/file1.txt && echo 'file2 content' > mydir/file2.txt`,
  )
    .expect(``)
    .exits(0);

  t.$(`SUDO_USER=agent soulguard init .`).expect(``).exits(0);

  t.$(`soulguard protect mydir`).expect(``).exits(0);

  // Agent stages modified file1
  t.$(
    `su - agent -c "mkdir -p $(pwd)/.soulguard-staging/mydir && cp $(pwd)/mydir/file1.txt $(pwd)/.soulguard-staging/mydir/file1.txt && cp $(pwd)/mydir/file2.txt $(pwd)/.soulguard-staging/mydir/file2.txt && echo 'modified file1' > $(pwd)/.soulguard-staging/mydir/file1.txt"`,
  ).expect(``);

  t.$(
    `HASH=$({ soulguard diff . || true; } 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && soulguard apply . --hash "$HASH"`,
  )
    .expect(``)
    .exits(0);

  // file1 should be modified
  t.$(`cat mydir/file1.txt`)
    .expect(``)
    .exits(0)
    .outputs(/modified file1/);

  // file2 should be unchanged
  t.$(`cat mydir/file2.txt`)
    .expect(``)
    .exits(0)
    .outputs(/file2 content/);

  // Ownership should be soulguardian
  t.$(`stat -c '%U' mydir/file1.txt`)
    .expect(``)
    .exits(0)
    .outputs(/soulguardian/);
});

e2e.skip("apply: adds new file to protected directory", (t) => {
  t.$(`mkdir -p mydir && echo 'file1 content' > mydir/file1.txt`).expect(``).exits(0);

  t.$(`SUDO_USER=agent soulguard init .`).expect(``).exits(0);

  t.$(`soulguard protect mydir`).expect(``).exits(0);

  // Agent stages original + new file
  t.$(
    `su - agent -c "mkdir -p $(pwd)/.soulguard-staging/mydir && cp $(pwd)/mydir/file1.txt $(pwd)/.soulguard-staging/mydir/file1.txt && echo 'new file2' > $(pwd)/.soulguard-staging/mydir/file2.txt"`,
  ).expect(``);

  t.$(
    `HASH=$({ soulguard diff . || true; } 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && soulguard apply . --hash "$HASH"`,
  )
    .expect(``)
    .exits(0);

  // New file should exist
  t.$(`cat mydir/file2.txt`)
    .expect(``)
    .exits(0)
    .outputs(/new file2/);

  // Ownership should be soulguardian
  t.$(`stat -c '%U' mydir/file2.txt`)
    .expect(``)
    .exits(0)
    .outputs(/soulguardian/);
});

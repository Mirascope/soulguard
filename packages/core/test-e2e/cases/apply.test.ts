import { e2e } from "../harness";
import { protectCmd } from "../helpers";

e2e("apply: applies staged changes with hash", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);
  t.$(`sudo soulguard stage SOUL.md && sudo soulguard stage soulguard.json`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
      📝 soulguard.json (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  // Modify staging
  t.$(`echo '# My Updated Soul' | sudo tee .soulguard-staging/SOUL.md > /dev/null`)
    .expect(`
    exit 0
  `)
    .exits(0);

  // Get hash and apply
  t.$(
    `HASH=$(sudo soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && sudo soulguard apply . --hash "$HASH"`,
  )
    .expect(`
      exit 0

      Applied 1 file(s):
        ✅ SOUL.md

      Protect-tier files updated. Staging synced.
    `)
    .exits(0);

  // Verify protect-tier file has new content
  t.$(`cat SOUL.md`)
    .expect(`
      exit 0
      # My Updated Soul
    `)
    .exits(0)
    .outputs(/My Updated Soul/);
});

e2e("apply: handles file deletion through staging", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);
  t.$(`sudo soulguard stage -d SOUL.md && sudo soulguard stage soulguard.json`)
    .expect(`
    exit 0
      🗑️  SOUL.md (staged for deletion)

    Staged 1 file(s).
      📝 soulguard.json (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  t.$(
    `HASH=$(sudo soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && sudo soulguard apply . --hash "$HASH"`,
  )
    .expect(`
      exit 0

      Applied 1 file(s):
        ✅ SOUL.md

      Protect-tier files updated. Staging synced.
    `)
    .exits(0);

  // SOUL.md should be gone
  t.$(`test -f SOUL.md && echo "exists" || echo "gone"`)
    .expect(`
      exit 0
      gone
    `)
    .exits(0)
    .outputs(/gone/);
});

e2e("apply: applies modified file inside protected directory", (t) => {
  t.$(
    `mkdir -p mydir && echo 'file1 content' > mydir/file1.txt && echo 'file2 content' > mydir/file2.txt && sudo soulguard init . && sudo soulguard protect mydir && sudo soulguard sync`,
  )
    .expect(`
      exit 0
      ✓ Soulguard initialized.
      1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
        + mydir → protect

      Updated. 1 file(s) now protect-tier.
      Soulguard Sync — /workspace

      Fixed:
        🔧 soulguard.json
            owner is root, expected soulguardian
            group is root, expected soulguard
            mode is 644, expected 444

      All files now ok.
    `)
    .exits(0);

  t.$(`sudo soulguard stage soulguard.json`)
    .expect(`
    exit 0
      📝 soulguard.json (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);

  // Manually create staging with modified file1
  t.$(
    `sudo mkdir -p .soulguard-staging/mydir && sudo cp mydir/file1.txt .soulguard-staging/mydir/file1.txt && sudo cp mydir/file2.txt .soulguard-staging/mydir/file2.txt && echo 'modified file1' | sudo tee .soulguard-staging/mydir/file1.txt > /dev/null`,
  )
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(
    `HASH=$(sudo soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}') && sudo soulguard apply . --hash "$HASH"`,
  )
    .expect(`
      exit 0

      Applied 1 file(s):
        ✅ mydir/file1.txt

      Protect-tier files updated. Staging synced.
    `)
    .exits(0);

  // file1 should be modified
  t.$(`cat mydir/file1.txt`)
    .expect(`
      exit 0
      modified file1
    `)
    .exits(0)
    .outputs(/modified file1/);

  // file2 should be unchanged
  t.$(`cat mydir/file2.txt`)
    .expect(`
      exit 0
      file2 content
    `)
    .exits(0)
    .outputs(/file2 content/);
});

e2e("apply: rejects with wrong hash", (t) => {
  t.$(protectCmd("SOUL.md", "# My Soul")).expect(`
    exit 0
    ✓ Soulguard initialized.
    1 file(s) need protection. Run \`sudo soulguard sync\` to enforce.
      + SOUL.md → protect

    Updated. 1 file(s) now protect-tier.
  `);
  t.$(`sudo soulguard stage SOUL.md && sudo soulguard stage soulguard.json`)
    .expect(`
    exit 0
      📝 SOUL.md (staged for editing)

    Staged 1 file(s).
      📝 soulguard.json (staged for editing)

    Staged 1 file(s).
  `)
    .exits(0);
  t.$(`echo '# Modified' | sudo tee .soulguard-staging/SOUL.md > /dev/null`)
    .expect(`
    exit 0
  `)
    .exits(0);

  t.$(`sudo soulguard apply . --hash "deadbeef" 2>&1`)
    .expect(`
      exit 1
      Expected hash deadbeef but got hash 80b0f1ea5e2b6e9896224a89c8025ff309de616b83345c8b3f34f20e2acddd98
      Please run \`soulguard diff\` again and re-review.
    `)
    .exits(1)
    .outputs(/hash|mismatch|invalid/i);
});

import { e2e } from "../harness";

e2e("diff: shows no changes for unmodified staging", (t) => {
  t.$(`echo '# My Soul' > SOUL.md`).expect(``).exits(0);

  t.$(`SUDO_USER=agent soulguard init .`).expect(``).exits(0);

  t.$(`soulguard protect SOUL.md`).expect(``).exits(0);

  // Agent creates staging (on-demand, unmodified copy)
  t.$(`su - agent -c "cp $(pwd)/SOUL.md $(pwd)/.soulguard.SOUL.md"`).expect(``);

  // No changes → exit 0
  t.$(`soulguard diff .`)
    .expect(``)
    .exits(0)
    .outputs(/[Nn]o changes/);
});

e2e.skip("diff: shows unified diff for modified staging", (t) => {
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

  // Agent creates staging with modified content
  t.$(`su - agent -c "echo '# My Modified Soul' > $(pwd)/.soulguard.SOUL.md"`).expect(`
    exit 0
  `);

  // Changes found → exit 1 (git diff convention)
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        📝 SOUL.md
            ===================================================================
            --- a/SOUL.md
            +++ b/SOUL.md
            @@ -1,1 +1,1 @@
            -# My Soul
            +# My Modified Soul
            
        ✅ soulguard.json (no changes)

      1 file(s) changed
    `)
    .exits(1)
    .outputs(/Apply hash:/);
});

e2e.skip("diff: shows new file when protect-tier copy is missing", (t) => {
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

  // Agent creates staging copy
  t.$(`su - agent -c "cp $(pwd)/SOUL.md $(pwd)/.soulguard.SOUL.md"`).expect(`
    exit 0
  `);

  // Delete the protect-tier file so staging exists but vault doesn't
  t.$(`rm SOUL.md`)
    .expect(`
    exit 0
  `)
    .exits(0);

  // Changes found → exit 1 (git diff convention)
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        ⚠️ SOUL.md (protect-tier file missing — new file)
        ✅ soulguard.json (no changes)

      1 file(s) changed
    `)
    .exits(1)
    .outputs(/missing/);
});

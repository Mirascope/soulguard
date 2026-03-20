import { e2e } from "../harness";

e2e("reset: dry run lists changed staged files", (t) => {
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file now protected.
    `)
    .exits(0);

  // Modify staging copy so it differs from canonical
  t.$(`echo '# Modified Soul' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard reset -w .`)
    .expect(`
      exit 0
      Staged changes:
        .soulguard-staging/SOUL.md

      Use --all to reset everything, or specify paths to reset.
    `)
    .exits(0)
    .outputs(/Staged changes/);

  // File should still exist after dry run
  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      # Modified Soul
    `)
    .exits(0);
});

e2e("reset: specific file removes staging copy", (t) => {
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file now protected.
    `)
    .exits(0);

  // Modify staging copy so it differs from canonical
  t.$(`echo '# Modified Soul' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard reset -w . SOUL.md`)
    .expect(`
      exit 0
      Reset 1 staged file(s):
        .soulguard-staging/SOUL.md
    `)
    .exits(0)
    .outputs(/Reset/);

  t.$(`test -f .soulguard-staging/SOUL.md && echo exists || echo gone`)
    .expect(`
      exit 0
      gone
    `)
    .exits(0)
    .outputs(/gone/);
});

e2e("reset: --all empties staging tree", (t) => {
  t.$(`echo '# My Soul' > SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file now protected.
    `)
    .exits(0);

  // Modify staging copy so it differs from canonical
  t.$(`echo '# Modified Soul' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard reset -w . --all`)
    .expect(`
      exit 0
      Reset 1 staged file(s):
        .soulguard-staging/SOUL.md
    `)
    .exits(0)
    .outputs(/Reset/);

  t.$(`test -f .soulguard-staging/SOUL.md && echo exists || echo gone`)
    .expect(`
      exit 0
      gone
    `)
    .exits(0)
    .outputs(/gone/);
});

e2e("reset: no staged changes shows clean message", (t) => {
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);

  t.$(`sudo soulguard reset -w .`)
    .expect(`
      exit 0
      Nothing staged — staging tree is clean.
    `)
    .exits(0)
    .outputs(/clean|Nothing staged/);
});

e2e("reset: selective reset keeps other staged files", (t) => {
  t.$(`echo '# Soul' > SOUL.md && echo '# Notes' > notes.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);
  t.$(`sudo soulguard protect SOUL.md`)
    .expect(`
      exit 0
        + SOUL.md → protect

      Updated. 1 file now protected.
    `)
    .exits(0);
  t.$(`sudo soulguard protect notes.md`)
    .expect(`
      exit 0
        + notes.md → protect

      Updated. 1 file now protected.
    `)
    .exits(0);

  // Modify both staging copies so they differ from canonical
  t.$(
    `echo '# Modified Soul' > .soulguard-staging/SOUL.md && echo '# Modified Notes' > .soulguard-staging/notes.md`,
  )
    .expect(`
      exit 0
    `)
    .exits(0);

  t.$(`sudo soulguard reset -w . SOUL.md`)
    .expect(`
      exit 0
      Reset 1 staged file(s):
        .soulguard-staging/SOUL.md
    `)
    .exits(0)
    .outputs(/Reset/);

  // notes.md staging copy should still exist
  t.$(`test -f .soulguard-staging/notes.md && echo exists || echo gone`)
    .expect(`
      exit 0
      exists
    `)
    .exits(0)
    .outputs(/exists/);
});

e2e("reset: resets staged change to soulguard.json", (t) => {
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);

  // Modify the staging copy of soulguard.json
  t.$(
    `jq '.daemon = {"syncIntervalSecs": 99}' .soulguard-staging/soulguard.json > /tmp/sg.json && cp /tmp/sg.json .soulguard-staging/soulguard.json`,
  )
    .expect(`
      exit 0
    `)
    .exits(0);

  // Diff should show the change
  t.$(`soulguard diff .`)
    .expect(`
      exit 1
      Soulguard Diff — /workspace

        📝 soulguard.json
            ===================================================================
            --- a/soulguard.json
            +++ b/soulguard.json
            @@ -7,6 +7,9 @@
               "defaultOwnership": {
                 "user": "agent",
                 "group": "agent",
                 "mode": "644"
            +  },
            +  "daemon": {
            +    "syncIntervalSecs": 99
               }
             }
            

      1 file(s) changed
      Apply hash: cc19cc101d758ba4c2cc14e2cfe660ece72cf2671a35483d8721e74b97a407c2
    `)
    .exits(1)
    .outputs(/soulguard\.json/)
    .outputs(/Apply hash:/);

  // Reset the soulguard.json staging copy
  t.$(`sudo soulguard reset -w . soulguard.json`)
    .expect(`
      exit 0
      Reset 1 staged file(s):
        .soulguard-staging/soulguard.json
    `)
    .exits(0)
    .outputs(/Reset 1 staged file/);

  // Canonical soulguard.json should be unchanged (no daemon section)
  t.$(`jq '.daemon // "absent"' soulguard.json`)
    .expect(`
      exit 0
      "absent"
    `)
    .exits(0)
    .outputs(/absent/);

  // Diff should now show clean
  t.$(`soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace


      No changes
    `)
    .exits(0)
    .outputs(/No changes/);
});

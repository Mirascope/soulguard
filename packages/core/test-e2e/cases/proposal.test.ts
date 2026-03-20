import { e2e } from "../harness";

// Sync disabled (0) to prevent interference with proposal state.
const CONFIGURE_DAEMON = "sudo soulguard daemon configure --sync-interval 0";

// ── Auto-approve ────────────────────────────────────────────────────

e2e("proposal: auto-approve applies staging changes to canonical", (t) => {
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

  t.$(CONFIGURE_DAEMON)
    .expect(`
      exit 0
      Daemon configuration updated.
    `)
    .exits(0);

  // Modify staging copy
  t.$(`echo '# Modified Soul' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Run daemon with auto-approve — exits after 1 proposal
  t.$(`sudo soulguard daemon start . --test-auto-approve --max-proposals 1`)
    .expect(`
      exit 0
      Daemon running (channel: auto-test, sync: disabled)
      [poll] hash changed: null → 94af97843271
      Proposal posted: 94af97843271e9e8695efa4308f61002afb370ac35d1a6ca531f76bdf09d7ef5 (1 file(s))
      Proposal applied: 94af97843271e9e8695efa4308f61002afb370ac35d1a6ca531f76bdf09d7ef5
    `)
    .exits(0);

  // Canonical file should have the modified content
  t.$(`cat SOUL.md`)
    .expect(`
      exit 0
      # Modified Soul
    `)
    .exits(0)
    .outputs(/Modified Soul/);

  // Staging should be synced (matches canonical after apply)
  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      # Modified Soul
    `)
    .exits(0);
});

// ── Auto-reject ─────────────────────────────────────────────────────

e2e("proposal: auto-reject resets staging to canonical", (t) => {
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

  t.$(CONFIGURE_DAEMON)
    .expect(`
      exit 0
      Daemon configuration updated.
    `)
    .exits(0);

  // Modify staging
  t.$(`echo '# Rejected Edit' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Run daemon with auto-reject
  t.$(`sudo soulguard daemon start . --test-auto-reject --max-proposals 1`)
    .expect(`
      exit 0
      Daemon running (channel: auto-test, sync: disabled)
      [poll] hash changed: null → 83ea2109865c
      Proposal posted: 83ea2109865c03eaee019cd353cd101ceed10afc58a6019ae316f96c39a537bb (1 file(s))
      Proposal rejected: 83ea2109865c03eaee019cd353cd101ceed10afc58a6019ae316f96c39a537bb
    `)
    .exits(0);

  // Canonical should NOT be modified (still original)
  t.$(`cat SOUL.md`)
    .expect(`
      exit 0
      # My Soul
    `)
    .exits(0)
    .outputs(/My Soul/);

  // Staging should be reset to canonical content
  t.$(`cat .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
      # My Soul
    `)
    .exits(0)
    .outputs(/My Soul/);
});

// ── Reject created file ─────────────────────────────────────────────

e2e("proposal: auto-reject of created file removes staging copy", (t) => {
  t.$(`mkdir -p skills && echo '# Python' > skills/python.md`)
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
  t.$(`sudo soulguard protect skills`)
    .expect(`
      exit 0
        + skills → protect

      Updated. 1 file now protected.
    `)
    .exits(0);

  t.$(CONFIGURE_DAEMON)
    .expect(`
      exit 0
      Daemon configuration updated.
    `)
    .exits(0);

  // Create a new file in staging (doesn't exist in canonical)
  t.$(`soulguard create skills/new.md`)
    .expect(`
      exit 0
        + skills/new.md → .soulguard-staging/skills/new.md

      Created 1 staging entry.
    `)
    .exits(0);
  t.$(`echo '# New Skill' > .soulguard-staging/skills/new.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Run daemon with auto-reject
  t.$(`sudo soulguard daemon start . --test-auto-reject --max-proposals 1`)
    .expect(`
      exit 0
      Daemon running (channel: auto-test, sync: disabled)
      [poll] hash changed: null → 313dcfe0c9e3
      Proposal posted: 313dcfe0c9e3c25034ab9a945bc2b179a61db3a9a2e8b05d3e661822c8cba0fc (1 file(s))
      Proposal rejected: 313dcfe0c9e3c25034ab9a945bc2b179a61db3a9a2e8b05d3e661822c8cba0fc
    `)
    .exits(0);

  // Created file's staging copy should be deleted
  t.$(`test -f .soulguard-staging/skills/new.md && echo exists || echo gone`)
    .expect(`
      exit 0
      gone
    `)
    .exits(0)
    .outputs(/gone/);

  // Existing file's staging should be restored to canonical
  t.$(`cat .soulguard-staging/skills/python.md`)
    .expect(`
      exit 0
      # Python
    `)
    .exits(0);
});

// ── Reject then re-edit triggers new proposal ───────────────────────

e2e("proposal: reject then re-edit triggers new proposal", (t) => {
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

  t.$(CONFIGURE_DAEMON)
    .expect(`
      exit 0
      Daemon configuration updated.
    `)
    .exits(0);

  // First edit — rejected
  t.$(`echo '# Bad Edit' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard daemon start . --test-auto-reject --max-proposals 1`)
    .expect(`
      exit 0
      Daemon running (channel: auto-test, sync: disabled)
      [poll] hash changed: null → c7c8a7771e9d
      Proposal posted: c7c8a7771e9db7e1f838d23154028d12b139f55d9910d4cc3686504e268b467e (1 file(s))
      Proposal rejected: c7c8a7771e9db7e1f838d23154028d12b139f55d9910d4cc3686504e268b467e
    `)
    .exits(0);

  // Second edit — approved
  t.$(`echo '# Good Edit' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);
  t.$(`sudo soulguard daemon start . --test-auto-approve --max-proposals 1`)
    .expect(`
      exit 0
      Daemon running (channel: auto-test, sync: disabled)
      [poll] hash changed: null → 21d46ad46e47
      Proposal posted: 21d46ad46e47811d1b6cbc1d6beb6907171d2580218ef3bcf7e43c9f9890a70d (1 file(s))
      Proposal applied: 21d46ad46e47811d1b6cbc1d6beb6907171d2580218ef3bcf7e43c9f9890a70d
    `)
    .exits(0);

  // Canonical should have the second edit
  t.$(`cat SOUL.md`)
    .expect(`
      exit 0
      # Good Edit
    `)
    .exits(0)
    .outputs(/Good Edit/);
});

// ── Reset after rejection shows clean state ─────────────────────────

e2e("proposal: reset after rejection shows clean state", (t) => {
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

  t.$(CONFIGURE_DAEMON)
    .expect(`
      exit 0
      Daemon configuration updated.
    `)
    .exits(0);

  // Modify staging
  t.$(`echo '# Bad Edit' > .soulguard-staging/SOUL.md`)
    .expect(`
      exit 0
    `)
    .exits(0);

  // Auto-reject
  t.$(`sudo soulguard daemon start . --test-auto-reject --max-proposals 1`)
    .expect(`
      exit 0
      Daemon running (channel: auto-test, sync: disabled)
      [poll] hash changed: null → c7c8a7771e9d
      Proposal posted: c7c8a7771e9db7e1f838d23154028d12b139f55d9910d4cc3686504e268b467e (1 file(s))
      Proposal rejected: c7c8a7771e9db7e1f838d23154028d12b139f55d9910d4cc3686504e268b467e
    `)
    .exits(0);

  // After rejection + auto-reset, diff should show no changes
  t.$(`soulguard diff .`)
    .expect(`
      exit 0
      Soulguard Diff — /workspace


      No changes
    `)
    .exits(0)
    .outputs(/No changes/);
});

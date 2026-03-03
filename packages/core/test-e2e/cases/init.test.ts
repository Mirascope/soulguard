import { e2e } from "../harness";

e2e("init: creates group, user, sudoers, and syncs files", (t) => {
  t.$(`
    echo '# My Soul' > SOUL.md
    cat > soulguard.json <<'EOF'
{"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
EOF
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
        Wrote /etc/sudoers.d/soulguard
        Prepared directories for staging
        Synced 1 protect-tier file(s)

      Done.
    `)
    .exits(0)
    .outputs(/Created group/)
    .outputs(/Created user/)
    .outputs(/Done/);
});

e2e("init: second run is idempotent", (t) => {
  t.$(`
    echo '# My Soul' > SOUL.md
    cat > soulguard.json <<'EOF'
{"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
EOF
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
        Wrote /etc/sudoers.d/soulguard
        Prepared directories for staging
        Synced 1 protect-tier file(s)

      Done.
    `)
    .exits(0);

  // Second init — should skip already-completed steps
  t.$(`SUDO_USER=agent soulguard init .`)
    .expect(`
      exit 0
      Soulguard Init — /workspace
        Prepared directories for staging

      Done.
    `)
    .exits(0)
    .outputs(/Done/);
});

e2e("init: agent cannot re-run init after owner setup", (t) => {
  t.$(`
    echo '# My Soul' > SOUL.md
    cat > soulguard.json <<'EOF'
{"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
EOF
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
        Wrote /etc/sudoers.d/soulguard
        Prepared directories for staging
        Synced 1 protect-tier file(s)

      Done.
    `)
    .exits(0);

  // Agent tries init — scoped sudoers denies it
  t.$(`su - agent -c "sudo soulguard init $(pwd)" 2>&1`)
    .expect(`
      exit 1
      sudo: a terminal is required to read the password; either use the -S option to read from standard input or configure an askpass helper
      sudo: a password is required
    `)
    .exits(1)
    .outputs(/password is required/);
});

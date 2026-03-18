import { e2e } from "../harness";

e2e("config: prints resolved config from disk", (t) => {
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);

  t.$(`soulguard config`)
    .expect(`
      exit 0
      {
        "version": 1,
        "guardian": "soulguardian_agent",
        "files": {
          "soulguard.json": "protect"
        },
        "defaultOwnership": {
          "user": "agent",
          "group": "agent",
          "mode": "644"
        }
      }
    `)
    .exits(0)
    .outputs(/"version": 1/)
    .outputs(/"guardian": "soulguardian_agent"/);
});

e2e("config: SOULGUARD_CONFIG env var overrides disk", (t) => {
  t.$(`sudo soulguard init --no-daemon --non-interactive .`)
    .expect(`
      exit 0
      ✓ Soulguard initialized.
    `)
    .exits(0);

  t.$(
    `SOULGUARD_CONFIG='{"version":1,"guardian":"soulguardian_custom","files":{}}' soulguard config`,
  )
    .expect(`
      exit 0
      {
        "version": 1,
        "guardian": "soulguardian_custom",
        "files": {}
      }
    `)
    .exits(0)
    .outputs(/"guardian": "soulguardian_custom"/);
});

e2e("config: SOULGUARD_CONFIG works without soulguard.json on disk", (t) => {
  // No init — no soulguard.json exists
  t.$(`soulguard config 2>&1`)
    .expect(`
      exit 1
      No soulguard.json found in /workspace
    `)
    .exits(1)
    .outputs(/No soulguard.json found/);

  // But env var works
  t.$(`SOULGUARD_CONFIG='{"version":1,"guardian":"soulguardian_test","files":{}}' soulguard config`)
    .expect(`
      exit 0
      {
        "version": 1,
        "guardian": "soulguardian_test",
        "files": {}
      }
    `)
    .exits(0)
    .outputs(/"guardian": "soulguardian_test"/);
});

e2e("config: SOULGUARD_CONFIG with invalid JSON shows error", (t) => {
  t.$(`SOULGUARD_CONFIG='{not valid' soulguard config 2>&1`)
    .expect(`
      exit 1
      JSON Parse error: Expected '}'
    `)
    .exits(1);
});

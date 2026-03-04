/**
 * Shared e2e test helpers for reducing boilerplate.
 *
 * Returns shell command strings that combine setup steps.
 * The test file is responsible for calling t.$().expect() with the returned command.
 *
 * @example
 *   e2e("my test", (t) => {
 *     t.$(protectCmd("SOUL.md", "# My Soul")).expect(``);
 *     // ... assertions
 *   });
 */

/**
 * Returns a shell command that creates a file, inits soulguard, and protects it.
 */
export function protectCmd(path: string, content: string): string {
  const dir = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : null;
  const mkdirPart = dir ? `mkdir -p ${dir} && ` : "";
  return `${mkdirPart}echo '${content}' > ${path} && sudo soulguard init . && sudo soulguard protect ${path}`;
}

/**
 * Returns a shell command that creates a file, inits soulguard, and watches it.
 */
export function watchCmd(path: string, content: string): string {
  const dir = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : null;
  const mkdirPart = dir ? `mkdir -p ${dir} && ` : "";
  return `${mkdirPart}echo '${content}' > ${path} && sudo soulguard init . && sudo soulguard watch ${path}`;
}

/**
 * Returns a shell command that creates multiple files, inits soulguard, and sets tiers.
 *
 * @example
 *   t.$(setupCmd({
 *     "SOUL.md": { content: "# My Soul", tier: "protect" },
 *     "notes.md": { content: "# Notes", tier: "watch" },
 *   })).expect(``);
 */
export function setupCmd(
  files: Record<string, { content: string; tier: "protect" | "watch" }>,
): string {
  const parts: string[] = [];

  for (const [path, spec] of Object.entries(files)) {
    const dir = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : null;
    if (dir) parts.push(`mkdir -p ${dir}`);
    parts.push(`echo '${spec.content}' > ${path}`);
  }

  parts.push(`sudo soulguard init .`);

  const protect = Object.entries(files)
    .filter(([, s]) => s.tier === "protect")
    .map(([p]) => p);
  const watch = Object.entries(files)
    .filter(([, s]) => s.tier === "watch")
    .map(([p]) => p);

  for (const path of protect) {
    parts.push(`sudo soulguard protect ${path}`);
  }
  for (const path of watch) {
    parts.push(`sudo soulguard watch ${path}`);
  }

  return parts.join(" && ");
}

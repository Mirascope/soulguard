/**
 * ConsoleOutput — abstraction over terminal output for testability.
 */

export interface ConsoleOutput {
  write(text: string, newline?: boolean): void;
  error(text: string, newline?: boolean): void;

  // Semantic output (all default newline=true)
  success(text: string, newline?: boolean): void;
  warn(text: string, newline?: boolean): void;
  info(text: string, newline?: boolean): void;
  heading(text: string, newline?: boolean): void;
}

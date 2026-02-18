/**
 * ConsoleOutput — abstraction over terminal output for testability.
 */

export interface ConsoleOutput {
  write(text: string): void;
  error(text: string): void;
  success(text: string): void;
  warn(text: string): void;
  info(text: string): void;
  heading(text: string): void;
}

/**
 * MockConsoleOutput — captures output for test assertions.
 */

import type { ConsoleOutput } from "./console.js";

export type CapturedLine = {
  level: "write" | "error" | "success" | "warn" | "info" | "heading";
  text: string;
};

export class MockConsoleOutput implements ConsoleOutput {
  public lines: CapturedLine[] = [];

  write(text: string): void {
    this.lines.push({ level: "write", text });
  }

  error(text: string): void {
    this.lines.push({ level: "error", text });
  }

  success(text: string): void {
    this.lines.push({ level: "success", text });
  }

  warn(text: string): void {
    this.lines.push({ level: "warn", text });
  }

  info(text: string): void {
    this.lines.push({ level: "info", text });
  }

  heading(text: string): void {
    this.lines.push({ level: "heading", text });
  }

  /** Get all text from lines matching a level */
  textsAt(level: CapturedLine["level"]): string[] {
    return this.lines.filter((l) => l.level === level).map((l) => l.text);
  }

  /** Check if any line contains a substring */
  hasText(substring: string): boolean {
    return this.lines.some((l) => l.text.includes(substring));
  }
}

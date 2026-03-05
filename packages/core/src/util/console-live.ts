/**
 * LiveConsoleOutput — real terminal output with colors via picocolors.
 */

import pc from "picocolors";
import type { ConsoleOutput } from "./console.js";

export class LiveConsoleOutput implements ConsoleOutput {
  write(text: string): void {
    console.log(text);
  }

  error(text: string): void {
    console.log(pc.red(text));
  }

  success(text: string): void {
    console.log(pc.green(text));
  }

  warn(text: string): void {
    console.log(pc.yellow(text));
  }

  info(text: string): void {
    console.log(pc.dim(text));
  }

  heading(text: string): void {
    console.log(pc.bold(text));
  }
}

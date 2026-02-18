/**
 * LiveConsoleOutput — real terminal output with colors via picocolors.
 */

import pc from "picocolors";
import type { ConsoleOutput } from "./console.js";

function emit(stream: NodeJS.WriteStream, text: string, newline: boolean): void {
  stream.write(newline ? text + "\n" : text);
}

export class LiveConsoleOutput implements ConsoleOutput {
  write(text: string, newline = true): void {
    emit(process.stdout, text, newline);
  }

  error(text: string, newline = true): void {
    emit(process.stderr, text, newline);
  }

  success(text: string, newline = true): void {
    emit(process.stdout, pc.green(text), newline);
  }

  warn(text: string, newline = true): void {
    emit(process.stdout, pc.yellow(text), newline);
  }

  info(text: string, newline = true): void {
    emit(process.stdout, pc.dim(text), newline);
  }

  heading(text: string, newline = true): void {
    emit(process.stdout, pc.bold(text), newline);
  }
}

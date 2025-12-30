import { describe, expect, test } from "bun:test";
import { executePerlInSandbox } from "./sandbox";

describe("executePerlInSandbox", () => {
  test("runs perl code and captures stdout", async () => {
    // Prefer docker; allow fallback for environments without a running daemon.
    const result = await executePerlInSandbox("print qq(hi\\n);", {
      timeoutMs: 1500,
      allowLocalFallback: true,
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toBe("hi\n");
    expect(result.exitCode).toBe(0);
  });
});

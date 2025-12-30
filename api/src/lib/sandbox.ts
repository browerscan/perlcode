import { randomUUID } from "crypto";

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  runtimeMs: number;
  timedOut: boolean;
  image: string;
  perlVersion: string | null;
}

async function runCommandWithTimeout(args: {
  cmd: string[];
  timeoutMs: number;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}> {
  const proc = Bun.spawn(args.cmd, { stdout: "pipe", stderr: "pipe" });
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
    } catch {
      // ignore
    }
  }, args.timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode, timedOut };
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureDockerImage(
  image: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const inspect = await runCommandWithTimeout({
    cmd: ["docker", "image", "inspect", image],
    timeoutMs: 10_000,
  });
  if (inspect.exitCode === 0) return { ok: true };

  const attempts = 2;
  for (let i = 0; i < attempts; i++) {
    const pull = await runCommandWithTimeout({
      cmd: ["docker", "pull", image],
      timeoutMs: 180_000,
    });
    if (pull.exitCode === 0 && !pull.timedOut) return { ok: true };

    if (i === attempts - 1) {
      const error = pull.timedOut
        ? `docker pull timed out after 180s for ${image}`
        : pull.stderr || pull.stdout || `docker pull failed for ${image}`;
      return { ok: false, error };
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  return { ok: false, error: `Unable to pull ${image}` };
}

async function getPerlVersion(image: string): Promise<string | null> {
  const ensured = await ensureDockerImage(image);
  if (!ensured.ok) return null;

  const res = await runCommandWithTimeout({
    cmd: [
      "docker",
      "run",
      "--rm",
      "--pull=never",
      "--network",
      "none",
      image,
      "perl",
      "-e",
      "print $^V",
    ],
    timeoutMs: 30_000,
  });

  if (res.exitCode !== 0 || res.timedOut) return null;
  return res.stdout.trim() || null;
}

export async function executePerlInDockerSandbox(
  code: string,
  options: {
    timeoutMs?: number;
    image?: string;
    memory?: string;
    cpus?: string;
    pidsLimit?: number;
  } = {},
): Promise<ExecutionResult> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const image = options.image ?? "perl:5.38-slim";
  const memory = options.memory ?? "256m";
  const cpus = options.cpus ?? "1";
  const pidsLimit = options.pidsLimit ?? 64;

  if (typeof code !== "string" || code.trim().length === 0) {
    return {
      success: false,
      stdout: "",
      stderr: "No code provided",
      exitCode: 1,
      runtimeMs: 0,
      timedOut: false,
      image,
      perlVersion: await getPerlVersion(image),
    };
  }

  if (code.length > 64_000) {
    return {
      success: false,
      stdout: "",
      stderr: "Code too large (max 64KB)",
      exitCode: 1,
      runtimeMs: 0,
      timedOut: false,
      image,
      perlVersion: await getPerlVersion(image),
    };
  }

  const ensured = await ensureDockerImage(image);
  if (!ensured.ok) {
    return {
      success: false,
      stdout: "",
      stderr: ensured.error,
      exitCode: 125,
      runtimeMs: 0,
      timedOut: false,
      image,
      perlVersion: await getPerlVersion(image),
    };
  }

  const containerName = `perlcode-exec-${randomUUID()}`;
  const startedAt = Date.now();
  let timedOut = false;

  const proc = Bun.spawn(
    [
      "docker",
      "run",
      "--name",
      containerName,
      "--rm",
      "-i",
      "--pull=never",
      "--network",
      "none",
      "--pids-limit",
      String(pidsLimit),
      "--memory",
      memory,
      "--cpus",
      cpus,
      "--read-only",
      "--tmpfs",
      "/tmp:rw,size=64m",
      "--tmpfs",
      "/var/tmp:rw,size=16m",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--user",
      "65534:65534",
      "--workdir",
      "/tmp",
      image,
      "perl",
      "-",
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );

  proc.stdin.write(code);
  proc.stdin.end();

  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      Bun.spawn(["docker", "kill", containerName], {
        stdout: "ignore",
        stderr: "ignore",
      });
    } catch {
      // ignore
    }
  }, timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return {
      success: exitCode === 0 && !timedOut,
      stdout,
      stderr,
      exitCode,
      runtimeMs: Date.now() - startedAt,
      timedOut,
      image,
      perlVersion: await getPerlVersion(image),
    };
  } finally {
    clearTimeout(timeout);
  }
}

import { randomUUID } from "crypto";
import { getEnv } from "./env";

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

let cachedPerlVersionByImage: Record<string, string> = {};
const env = getEnv();

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
  // Fast path: already present
  const inspect = await runCommandWithTimeout({
    cmd: ["docker", "image", "inspect", image],
    timeoutMs: 10_000,
  });

  if (inspect.exitCode === 0) return { ok: true };

  // Pull with retry (network can be flaky)
  const attempts = 2;
  for (let i = 0; i < attempts; i++) {
    const pull = await runCommandWithTimeout({
      cmd: ["docker", "pull", image],
      timeoutMs: 180_000,
    });

    if (pull.exitCode === 0 && !pull.timedOut) return { ok: true };

    const error = pull.timedOut
      ? `docker pull timed out after 180s for ${image}`
      : pull.stderr || pull.stdout || `docker pull failed for ${image}`;

    if (i === attempts - 1) {
      return { ok: false, error };
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  return { ok: false, error: `Unable to pull ${image}` };
}

async function getLocalPerlVersion(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["perl", "-e", "print $^V"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) return null;
    const version = stdout.trim();
    return version || null;
  } catch {
    return null;
  }
}

async function getPerlVersion(image: string): Promise<string | null> {
  if (cachedPerlVersionByImage[image]) return cachedPerlVersionByImage[image];

  try {
    const ensured = await ensureDockerImage(image);
    if (!ensured.ok) return null;

    const proc = Bun.spawn(
      [
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
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) return null;
    const version = stdout.trim();
    if (!version) return null;
    cachedPerlVersionByImage[image] = version;
    return version;
  } catch {
    return null;
  }
}

async function executePerlLocally(
  code: string,
  timeoutMs: number,
): Promise<Omit<ExecutionResult, "image">> {
  const startedAt = Date.now();
  let timedOut = false;

  const proc = Bun.spawn(["perl", "-"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdin.write(code);
  proc.stdin.end();

  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
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
      perlVersion: await getLocalPerlVersion(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function executePerlInSandbox(
  code: string,
  options: {
    timeoutMs?: number;
    image?: string;
    memory?: string;
    cpus?: string;
    pidsLimit?: number;
    mode?: "docker" | "local";
    allowLocalFallback?: boolean;
  } = {},
): Promise<ExecutionResult> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const image = options.image ?? "perl:5.38-slim";
  const memory = options.memory ?? "256m";
  const cpus = options.cpus ?? "1";
  const pidsLimit = options.pidsLimit ?? 64;
  const mode =
    options.mode ??
    env.PERLCODE_EXECUTION_MODE;
  const allowLocalFallback =
    options.allowLocalFallback ?? env.PERLCODE_ALLOW_LOCAL_PERL;

  if (typeof code !== "string" || code.trim().length === 0) {
    return {
      success: false,
      stdout: "",
      stderr: "No code provided",
      exitCode: 1,
      runtimeMs: 0,
      timedOut: false,
      image,
      perlVersion:
        mode === "docker"
          ? await getPerlVersion(image)
          : await getLocalPerlVersion(),
    };
  }

  // Basic hard limit to avoid accidental multi-megabyte payloads
  if (code.length > 64_000) {
    return {
      success: false,
      stdout: "",
      stderr: "Code too large (max 64KB)",
      exitCode: 1,
      runtimeMs: 0,
      timedOut: false,
      image,
      perlVersion:
        mode === "docker"
          ? await getPerlVersion(image)
          : await getLocalPerlVersion(),
    };
  }

  if (mode === "local") {
    const result = await executePerlLocally(code, timeoutMs);
    return { ...result, image: "local-perl" };
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

  const containerName = `perlcode-verify-${randomUUID()}`;
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

    if (
      allowLocalFallback &&
      exitCode !== 0 &&
      /Cannot connect to the Docker daemon/i.test(stderr)
    ) {
      const local = await executePerlLocally(code, timeoutMs);
      return { ...local, image: "local-perl" };
    }

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

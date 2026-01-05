import { useEffect, useMemo, useState } from "preact/hooks";

const API_BASE = import.meta.env.PUBLIC_API_URL || "https://api.freeperlcode.com";

declare global {
  interface Window {
    Perl?: any;
  }
}

type ExecutionResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  runtimeMs: number;
  perlVersion: string | null;
  remaining?: number;
};

let webPerlReady: Promise<any> | null = null;

async function loadScript(src: string) {
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load script")),
        {
          once: true,
        },
      );
      if ((existing as HTMLScriptElement).dataset.loaded === "true") resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loaded = "false";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load script"));
    document.head.appendChild(script);
  });
}

async function ensureWebPerlReady(): Promise<any> {
  if (webPerlReady) return await webPerlReady;

  webPerlReady = (async () => {
    if (typeof window === "undefined")
      throw new Error("WebPerl is browser-only");

    if (!window.Perl) {
      // Prefer self-hosted assets under `frontend/public/webperl/*`.
      await loadScript("/webperl/webperl.js");
    }

    const Perl = window.Perl;
    if (!Perl) throw new Error("WebPerl failed to load");

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("WebPerl init timed out")),
        15_000,
      );
      Perl.init(() => {
        clearTimeout(timeout);
        resolve();
      });
    });

    return Perl;
  })();

  return await webPerlReady;
}

export default function CodeRunner(props: {
  slug: string;
  code: string;
  initialStdout?: string | null;
  initialStderr?: string | null;
  initialRuntimeMs?: number | null;
  initialPerlVersion?: string | null;
  isVerified?: boolean;
}) {
  const [code, setCode] = useState(props.code);
  const [stdout, setStdout] = useState(props.initialStdout || "");
  const [stderr, setStderr] = useState(props.initialStderr || "");
  const [runtimeMs, setRuntimeMs] = useState<number | null>(
    props.initialRuntimeMs ?? null,
  );
  const [perlVersion, setPerlVersion] = useState<string | null>(
    props.initialPerlVersion ?? null,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isWebPerlReady, setIsWebPerlReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [lastEngine, setLastEngine] = useState<"server" | "browser" | null>(
    null,
  );

  const canServerExecute = Boolean(props.isVerified);

  const sessionToken = useMemo(() => {
    const gen = () =>
      typeof crypto !== "undefined" ? crypto.randomUUID() : null;
    try {
      if (typeof localStorage === "undefined") return gen();
      const stored = localStorage.getItem("perlcode_session");
      if (stored) return stored;
      const token = gen();
      if (token) localStorage.setItem("perlcode_session", token);
      return token;
    } catch {
      return gen();
    }
  }, []);

  useEffect(() => {
    setCode(props.code);
    setStdout(props.initialStdout || "");
    setStderr(props.initialStderr || "");
    setRuntimeMs(props.initialRuntimeMs ?? null);
    setPerlVersion(props.initialPerlVersion ?? null);
  }, [
    props.initialStdout,
    props.initialStderr,
    props.initialRuntimeMs,
    props.initialPerlVersion,
    props.code,
  ]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // ignore
    }
  };

  const resetCode = () => {
    setCode(props.code);
  };

  const runOnServer = async () => {
    if (!canServerExecute) {
      setError(
        "Server execution is only available for verified + published pages.",
      );
      return;
    }
    if (!sessionToken) {
      setError(
        "Session token unavailable (storage blocked?). Try browser execution.",
      );
      return;
    }
    if (isRunning) return;
    setIsRunning(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: props.slug,
          sessionToken,
        }),
      });

      const payload = (await res
        .json()
        .catch(() => null)) as ExecutionResult | null;
      if (!res.ok || !payload) {
        const msg =
          payload && typeof payload === "object" && "stderr" in payload
            ? String((payload as any).stderr || "Execution failed")
            : "Execution failed";
        throw new Error(msg);
      }

      setStdout(payload.stdout || "");
      setStderr(payload.stderr || "");
      setRuntimeMs(payload.runtimeMs ?? null);
      setPerlVersion(payload.perlVersion ?? null);
      if (typeof payload.remaining === "number")
        setRemaining(payload.remaining);
      setLastEngine("server");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setIsRunning(false);
    }
  };

  const runInBrowser = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setError(null);
    setRemaining(null);

    const startedAt = performance.now();

    try {
      const Perl = await ensureWebPerlReady();
      setIsWebPerlReady(true);

      let out = "";
      let err = "";
      Perl.output = (str: string, chan: number) => {
        if (chan === 2) err += str;
        else out += str;
      };

      try {
        // Run user-edited code locally (no server round-trip).
        // Note: Infinite loops may freeze the tab; keep examples small.
        Perl.eval(code);
      } catch (e) {
        err += e instanceof Error ? e.message : String(e);
      }

      setStdout(out);
      setStderr(err);
      setRuntimeMs(Math.round(performance.now() - startedAt));
      setPerlVersion("WebPerl (browser)");
      setLastEngine("browser");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Browser execution failed");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="p-6 bg-gray-50 dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Verified Code</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {canServerExecute
              ? "Executed in a sandbox to capture real output."
              : "Draft/noindex: server execution disabled until verified + published."}
            {perlVersion ? ` • ${perlVersion}` : ""}
            {runtimeMs != null ? ` • ${runtimeMs}ms` : ""}
            {remaining != null ? ` • Remaining today: ${remaining}` : ""}
            {lastEngine ? ` • Last run: ${lastEngine}` : ""}
            {!canServerExecute && isWebPerlReady ? " • WebPerl ready" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetCode}
            disabled={code === props.code}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-600 hover:border-perl-500 dark:hover:border-perl-500 transition-colors disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={copyCode}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-600 hover:border-perl-500 dark:hover:border-perl-500 transition-colors"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={runInBrowser}
            disabled={isRunning}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-600 hover:border-perl-500 dark:hover:border-perl-500 transition-colors disabled:opacity-50"
          >
            {isRunning ? "Running…" : "Run (Browser)"}
          </button>
          <button
            type="button"
            onClick={runOnServer}
            disabled={isRunning || !canServerExecute}
            className="px-3 py-2 text-sm rounded-lg bg-perl-500 text-white hover:bg-perl-600 transition-colors disabled:opacity-50"
          >
            {isRunning ? "Running…" : "Run (Server)"}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <textarea
          value={code}
          onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)}
          className="w-full min-h-[160px] font-mono text-sm rounded-lg bg-white dark:bg-dark-900 border border-gray-200 dark:border-dark-700 p-4"
          spellcheck={false}
        />
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Tip: edit code and use “Run (Browser)”. Server runs always execute the
          published, verified snippet.
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div>
          <div className="text-sm font-medium mb-2">STDOUT</div>
          <pre className="overflow-x-auto rounded-lg bg-white dark:bg-dark-900 border border-gray-200 dark:border-dark-700 p-4 text-sm">
            <code className="whitespace-pre">{stdout || "(empty)"}</code>
          </pre>
        </div>
        <div>
          <div className="text-sm font-medium mb-2">STDERR</div>
          <pre className="overflow-x-auto rounded-lg bg-white dark:bg-dark-900 border border-gray-200 dark:border-dark-700 p-4 text-sm">
            <code className="whitespace-pre">{stderr || "(empty)"}</code>
          </pre>
        </div>
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </section>
  );
}

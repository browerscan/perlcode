import { useEffect, useMemo, useState } from "preact/hooks";

const API_BASE = import.meta.env.PUBLIC_API_URL || "https://api.perlcode.dev";

type SearchResult = {
  slug: string;
  title: string;
  question?: string;
  rank?: number;
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const q = debouncedQuery;
      if (q.length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const res = await fetch(
          `${API_BASE}/api/search/suggest?q=${encodeURIComponent(q)}`,
        );
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        setSuggestions((data?.suggestions || []) as SearchResult[]);
      } catch {
        if (cancelled) return;
        setSuggestions([]);
      }
    };

    const handle = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [debouncedQuery]);

  const doSearch = async (q?: string) => {
    const searchQuery = (q ?? query).trim();
    if (searchQuery.length < 2) return;
    setIsLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      const res = await fetch(
        `${API_BASE}/api/search?q=${encodeURIComponent(searchQuery)}&limit=20`,
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Search failed");
      }
      setResults((data?.results || []) as SearchResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-6">Search</h1>

      <div className="relative">
        <input
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder='Try: "regex match operator"'
          className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-900 focus:ring-2 focus:ring-perl-500 focus:border-transparent outline-none"
        />
        <button
          onClick={() => doSearch()}
          disabled={isLoading || query.trim().length < 2}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-perl-500 text-white hover:bg-perl-600 transition-colors disabled:opacity-50"
        >
          {isLoading ? "Searching…" : "Search"}
        </button>

        {suggestions.length > 0 && (
          <div className="absolute z-10 mt-2 w-full bg-white dark:bg-dark-900 border border-gray-200 dark:border-dark-700 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.slug}
                onClick={() => {
                  setQuery(s.title);
                  doSearch(s.title);
                }}
                className="block w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-800 transition-colors"
              >
                <div className="font-medium">{s.title}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

      <div className="mt-8 space-y-3">
        {results.map((r) => (
          <a
            key={r.slug}
            href={`/questions/${r.slug}`}
            className="block p-4 rounded-xl border border-gray-200 dark:border-dark-700 hover:border-perl-500 dark:hover:border-perl-500 transition-colors"
          >
            <div className="font-semibold">{r.title}</div>
            {r.question && (
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {r.question}
              </div>
            )}
          </a>
        ))}

        {!isLoading && results.length === 0 && query.trim().length >= 2 && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            No results.
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "preact/hooks";

const API_BASE = import.meta.env.PUBLIC_API_URL || "https://api.freeperlcode.com";
const MIN_QUERY = 2;

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
  const [hasSearched, setHasSearched] = useState(false);

  const debouncedQuery = useMemo(() => query.trim(), [query]);

  const updateUrl = (searchQuery: string) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (searchQuery) {
      params.set("q", searchQuery);
    } else {
      params.delete("q");
    }
    const next = `${window.location.pathname}${
      params.toString() ? "?" + params.toString() : ""
    }`;
    window.history.replaceState({}, "", next);
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const q = debouncedQuery;
      if (q.length < MIN_QUERY) {
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
    if (searchQuery.length < MIN_QUERY) {
      setResults([]);
      setHasSearched(false);
      updateUrl("");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuggestions([]);
    setHasSearched(true);
    updateUrl(searchQuery);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q && q.trim().length >= MIN_QUERY) {
      setQuery(q);
      void doSearch(q);
    }
  }, []);

  return (
    <div className="space-y-8">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          void doSearch();
        }}
      >
        <label htmlFor="search-input" className="sr-only">
          Search Free Perl Code
        </label>
        <input
          id="search-input"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder='Try: "regex match operator"'
          className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-900 focus:ring-2 focus:ring-perl-500 focus:border-transparent outline-none"
        />
        <button
          type="submit"
          disabled={isLoading || query.trim().length < MIN_QUERY}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-perl-500 text-white hover:bg-perl-600 transition-colors disabled:opacity-50"
        >
          {isLoading ? "Searching…" : "Search"}
        </button>

        {suggestions.length > 0 && (
          <div className="absolute z-10 mt-2 w-full bg-white dark:bg-dark-900 border border-gray-200 dark:border-dark-700 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => {
                  setQuery(s.title);
                  void doSearch(s.title);
                }}
                className="block w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-800 transition-colors"
              >
                <div className="font-medium">{s.title}</div>
              </button>
            ))}
          </div>
        )}
      </form>

      {error && (
        <div className="text-sm text-red-600" role="status">
          {error}
        </div>
      )}

      <div className="space-y-3">
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

        {!isLoading && hasSearched && results.length === 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            No results.
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useMemo } from "preact/hooks";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const API_BASE =
  import.meta.env.PUBLIC_API_URL || "https://api.freeperlcode.com";

// Quick reply suggestions for different categories
const QUICK_REPLIES = [
  "What does $_ mean in Perl?",
  "How to read a file in Perl?",
  "Explain Perl regex basics",
  "What is the difference between my and local?",
  "How to use hash references?",
];

// Tips to show in the bubble
const TIPS = [
  "Ask me about Perl syntax, modules, or best practices!",
  "Need help with regex? I'm here for you!",
  "Struggling with Perl code? Let's debug together!",
];

// Delay before showing the bubble hint (15 seconds)
const BUBBLE_DELAY_MS = 15000;

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Random tip for the bubble
  const randomTip = useMemo(
    () => TIPS[Math.floor(Math.random() * TIPS.length)],
    []
  );

  const getSessionToken = () => {
    const gen = () => {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    };

    try {
      if (typeof localStorage === "undefined") return gen();
      const stored = localStorage.getItem("perlcode_session");
      if (stored) return stored;
      const token = gen();
      localStorage.setItem("perlcode_session", token);
      return token;
    } catch {
      return gen();
    }
  };

  // Initialize session token
  useEffect(() => {
    setSessionToken(getSessionToken());
  }, []);

  // Show bubble after delay
  useEffect(() => {
    bubbleTimerRef.current = setTimeout(() => {
      if (!isOpen) {
        setShowBubble(true);
      }
    }, BUBBLE_DELAY_MS);

    return () => {
      if (bubbleTimerRef.current) {
        clearTimeout(bubbleTimerRef.current);
      }
    };
  }, []);

  // Hide bubble when chat opens
  useEffect(() => {
    if (isOpen) {
      setShowBubble(false);
    }
  }, [isOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Listen for external open triggers
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-open-chat="true"]')
    );
    nodes.forEach((node) => node.addEventListener("click", handleOpen));
    return () => {
      nodes.forEach((node) => node.removeEventListener("click", handleOpen));
    };
  }, []);

  const sendMessage = async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() || isLoading) return;

    const activeToken = sessionToken ?? getSessionToken();
    if (!sessionToken) {
      setSessionToken(activeToken);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage.content,
          sessionToken: activeToken,
          pageSlug: window.location.pathname,
        }),
      });

      // Get remaining from header
      const remainingHeader = response.headers.get("X-RateLimit-Remaining");
      if (remainingHeader) {
        setRemaining(parseInt(remainingHeader, 10));
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          throw new Error("Daily limit reached. Come back tomorrow!");
        }
        throw new Error(errorData.error || "Failed to get response");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantContent = "";

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || "";
              assistantContent += content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? { ...m, content: assistantContent }
                    : m
                )
              );
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessageContent = (content: string) => {
    // Simple code block detection
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const code = part.slice(3, -3).replace(/^perl\n?/, "");
        return (
          <pre
            key={i}
            className="my-2 p-3 bg-dark-900 rounded-lg text-xs overflow-x-auto font-mono text-perl-400"
          >
            <code>{code}</code>
          </pre>
        );
      }
      // Handle inline code
      const inlineCode = part.split(/(`[^`]+`)/g);
      return (
        <span key={i}>
          {inlineCode.map((segment, j) => {
            if (segment.startsWith("`") && segment.endsWith("`")) {
              return (
                <code
                  key={j}
                  className="px-1.5 py-0.5 bg-dark-700 rounded text-perl-400 font-mono text-xs"
                >
                  {segment.slice(1, -1)}
                </code>
              );
            }
            return segment;
          })}
        </span>
      );
    });
  };

  return (
    <>
      {/* Backdrop overlay when chat is open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Chat container */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
        {/* Bubble hint */}
        {showBubble && !isOpen && (
          <div
            className="pointer-events-auto max-w-xs animate-fade-in-up"
            style={{ animation: "fadeInUp 0.3s ease-out" }}
          >
            <div className="relative rounded-2xl border border-perl-500/30 bg-gradient-to-br from-dark-800/95 to-dark-900/95 p-4 text-sm shadow-2xl backdrop-blur-xl">
              {/* Glow effect */}
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-perl-500/20 to-transparent opacity-50 blur-sm" />

              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-perl-500/20">
                    <span className="text-perl-500 font-mono font-bold text-xs">
                      F
                    </span>
                  </div>
                  <span className="font-semibold text-white">
                    Perl Code Expert
                  </span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {randomTip}
                </p>
                <button
                  className="mt-3 text-xs font-semibold uppercase tracking-widest text-perl-400 hover:text-perl-300 transition-colors"
                  onClick={() => {
                    setShowBubble(false);
                    setIsOpen(true);
                  }}
                >
                  Start Chat &rarr;
                </button>
              </div>

              {/* Arrow pointing to button */}
              <div className="absolute -bottom-2 right-6 h-4 w-4 rotate-45 border-b border-r border-perl-500/30 bg-dark-900" />
            </div>
          </div>
        )}

        {/* Chat Panel - Modal style */}
        {isOpen && (
          <div
            className="pointer-events-auto fixed left-1/2 top-1/2 z-50 w-[min(95vw,500px)] -translate-x-1/2 -translate-y-1/2"
            style={{ animation: "fadeInUp 0.2s ease-out" }}
          >
            {/* Glassmorphism container */}
            <div className="relative overflow-hidden rounded-3xl border border-perl-500/20 bg-gradient-to-br from-dark-800/98 to-dark-900/98 shadow-2xl backdrop-blur-xl">
              {/* Gradient glow background */}
              <div className="absolute inset-0 bg-gradient-to-br from-perl-500/5 via-transparent to-purple-500/5" />

              {/* Header */}
              <div className="relative border-b border-dark-700/50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-perl-500 to-perl-600 shadow-lg shadow-perl-500/25">
                      <span className="text-white font-mono font-bold text-lg">
                        F
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">
                        Perl Code Expert
                      </h3>
                      <p className="text-xs text-gray-400">
                        AI-powered • RAG-enhanced
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {remaining !== null && (
                      <span className="text-xs text-gray-500 bg-dark-700/50 px-2.5 py-1 rounded-full">
                        {remaining} left today
                      </span>
                    )}
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-dark-700/50 transition-all"
                      aria-label="Close chat"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages area */}
              <div className="relative h-[50vh] max-h-[400px] min-h-[250px] overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-transparent">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-perl-500/20 to-perl-600/20 flex items-center justify-center mb-4">
                      <span className="text-perl-400 font-mono font-bold text-3xl">
                        F
                      </span>
                    </div>
                    <h4 className="text-white font-medium mb-2">
                      How can I help with Perl?
                    </h4>
                    <p className="text-gray-400 text-sm mb-6 max-w-xs">
                      Ask about syntax, modules, regex, or any Perl question
                    </p>

                    {/* Quick replies */}
                    <div className="w-full space-y-2">
                      {QUICK_REPLIES.slice(0, 3).map((qr) => (
                        <button
                          key={qr}
                          onClick={() => sendMessage(qr)}
                          className="w-full text-left px-4 py-3 text-sm rounded-xl border border-dark-600/50 bg-dark-700/30 text-gray-300 hover:border-perl-500/50 hover:bg-dark-700/50 hover:text-white transition-all group"
                        >
                          <span className="text-perl-500 mr-2 group-hover:text-perl-400">
                            &rarr;
                          </span>
                          {qr}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.role === "user"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                            message.role === "user"
                              ? "bg-gradient-to-br from-perl-500 to-perl-600 text-white shadow-lg shadow-perl-500/20"
                              : "bg-dark-700/50 text-gray-100 border border-dark-600/50"
                          }`}
                        >
                          {message.role === "assistant" && (
                            <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-widest text-gray-500">
                              <span className="text-perl-400 font-mono font-bold">
                                F
                              </span>
                              <span>FreePerlCode</span>
                            </div>
                          )}
                          <div className="text-sm leading-relaxed whitespace-pre-wrap">
                            {message.content ? (
                              formatMessageContent(message.content)
                            ) : (
                              <span className="flex items-center gap-2 text-gray-400">
                                <span className="flex space-x-1">
                                  <span
                                    className="w-2 h-2 bg-perl-400 rounded-full animate-bounce"
                                    style={{ animationDelay: "0ms" }}
                                  />
                                  <span
                                    className="w-2 h-2 bg-perl-400 rounded-full animate-bounce"
                                    style={{ animationDelay: "150ms" }}
                                  />
                                  <span
                                    className="w-2 h-2 bg-perl-400 rounded-full animate-bounce"
                                    style={{ animationDelay: "300ms" }}
                                  />
                                </span>
                                Thinking...
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {error && (
                      <div className="text-center">
                        <span className="inline-block px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                          {error}
                        </span>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input area */}
              <div className="relative border-t border-dark-700/50 p-4">
                <div className="flex gap-3">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) =>
                      setInput((e.target as HTMLInputElement).value)
                    }
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about Perl..."
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 rounded-xl border border-dark-600/50 bg-dark-700/30 text-white placeholder-gray-500 focus:ring-2 focus:ring-perl-500/50 focus:border-perl-500/50 outline-none disabled:opacity-50 transition-all"
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={isLoading || !input.trim()}
                    className="px-5 py-3 bg-gradient-to-r from-perl-500 to-perl-600 text-white rounded-xl hover:from-perl-400 hover:to-perl-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-perl-500/25 hover:shadow-perl-500/40"
                  >
                    {isLoading ? (
                      <svg
                        className="w-5 h-5 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="mt-3 text-xs text-gray-500 text-center">
                  10 free questions daily • Powered by AI with RAG
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Floating Action Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all hover:scale-105 ${
            isOpen
              ? "bg-dark-700 hover:bg-dark-600"
              : "bg-gradient-to-br from-perl-500 to-perl-600 hover:from-perl-400 hover:to-perl-500 shadow-perl-500/30"
          }`}
          aria-label={isOpen ? "Close chat" : "Open Perl Code Expert"}
        >
          {/* Pulse animation when closed */}
          {!isOpen && !showBubble && (
            <span className="absolute inset-0 rounded-full bg-perl-500 animate-ping opacity-20" />
          )}

          {isOpen ? (
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <span className="text-white font-mono font-bold text-xl">F</span>
          )}
        </button>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translate(-50%, -48%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }

        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </>
  );
}

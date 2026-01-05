/**
 * Cookie Consent Banner
 * Inline component for managing cookie preferences
 */
import { useEffect, useState } from "preact/hooks";

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    // Check if user already made a choice
    const consent = localStorage.getItem("cookieConsent");
    if (!consent) {
      setIsVisible(true);
    } else {
      setHasConsent(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem("cookieConsent", "accepted");
    setIsVisible(false);
    setHasConsent(true);
    // Here you would initialize analytics
  };

  const handleRejectNonEssential = () => {
    localStorage.setItem("cookieConsent", "rejected");
    setIsVisible(false);
    setHasConsent(true);
    // Here you would disable non-essential cookies
  };

  if (!isVisible || hasConsent) {
    return null;
  }

  return (
    <div class="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-dark-900 border-t border-gray-200 dark:border-dark-700 p-4 shadow-lg">
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          We use essential cookies for the site to function. Optional cookies
          help us improve content.
          <a href="/privacy" class="ml-2 text-perl-500 hover:underline">
            Learn more
          </a>
        </p>
        <div class="flex gap-3">
          <button
            onClick={handleRejectNonEssential}
            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-800 transition-colors"
          >
            Reject Non-Essential
          </button>
          <button
            onClick={handleAcceptAll}
            class="px-4 py-2 text-sm font-medium text-white bg-perl-500 rounded-lg hover:bg-perl-600 transition-colors"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}

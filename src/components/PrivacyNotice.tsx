import { ShieldCheck, Lock } from "lucide-react";
import { PRIVACY_NOTICE } from "../types";

/**
 * Persistent local-processing privacy notice shown near the top of the app.
 */
export function PrivacyNotice() {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
      role="note"
      data-testid="privacy-notice"
    >
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <div>
        <span className="font-semibold">Local processing only. </span>
        {PRIVACY_NOTICE}
        <span className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          No network requests are made with your file data.
        </span>
      </div>
    </div>
  );
}

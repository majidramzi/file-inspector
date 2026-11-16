import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}

/**
 * Helpful empty state for panels that have no data yet.
 */
export function EmptyState({ icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 text-slate-400 dark:text-slate-500" aria-hidden>
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">
        {title}
      </h3>
      <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
        {description}
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

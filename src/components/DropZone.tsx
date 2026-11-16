import { useCallback, useRef, useState, type DragEvent } from "react";
import { FolderOpen, UploadCloud } from "lucide-react";

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

/**
 * Drag-and-drop upload area with a keyboard-accessible file picker.
 * Only references local File objects — nothing is uploaded.
 */
export function DropZone({ onFilesSelected, disabled = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const dropped = Array.from(event.dataTransfer?.files ?? []);
      if (dropped.length > 0) {
        onFilesSelected(dropped);
      }
    },
    [disabled, onFilesSelected],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length > 0) {
      onFilesSelected(picked);
    }
    // Reset so re-selecting the same file(s) fires change again.
    event.target.value = "";
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Select files to inspect"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
        "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-600 dark:hover:bg-slate-800/60",
        isDragging
          ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-slate-800"
          : "",
        disabled ? "pointer-events-none opacity-50" : "",
      ].join(" ")}
    >
      <div
        className={`rounded-full p-4 ${isDragging ? "bg-blue-100 dark:bg-blue-950" : "bg-slate-100 dark:bg-slate-800"}`}
      >
        {isDragging ? (
          <FolderOpen className="h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden />
        ) : (
          <UploadCloud className="h-8 w-8 text-slate-500 dark:text-slate-400" aria-hidden />
        )}
      </div>
      <div>
        <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {isDragging ? "Drop files here" : "Drag & drop files, or click to browse"}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Select one or more files — they are processed entirely on this device.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
        data-testid="file-input"
      />
    </div>
  );
}

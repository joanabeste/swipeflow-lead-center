"use client";

// Projektweites Dialog-Primitive: Confirm + Prompt + Custom-Modal.
// Ersetzt window.prompt/confirm/alert mit barrierearmen, stylischen Modals.
//
// Nutzung:
//   const dialog = useDialog();
//   const ok = await dialog.confirm({ title, body, danger: true });
//   const text = await dialog.prompt({ title, body, defaultValue });
//   await dialog.show({ render: (close) => <MyContent close={close} /> });

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  body?: React.ReactNode;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Validator: gibt Fehlertext zurueck oder null wenn ok. */
  validate?: (value: string) => string | null;
}

interface ShowOptions {
  /** Render-Funktion bekommt einen close-Callback, der den Modal schliesst und optional einen Wert zurueckgibt. */
  render: (close: (value?: unknown) => void) => React.ReactNode;
  /** Max-Breite (Tailwind-Klasse), Default "max-w-md". */
  size?: "max-w-sm" | "max-w-md" | "max-w-lg" | "max-w-xl" | "max-w-2xl";
}

interface DialogContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  show: <T = unknown>(opts: ShowOptions) => Promise<T | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog muss innerhalb von <DialogProvider> aufgerufen werden");
  return ctx;
}

type Entry =
  | { kind: "confirm"; id: number; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; id: number; opts: PromptOptions; resolve: (v: string | null) => void }
  | { kind: "show"; id: number; opts: ShowOptions; resolve: (v: unknown) => void };

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<Entry[]>([]);
  const counterRef = useRef(0);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const id = ++counterRef.current;
      setStack((prev) => [...prev, { kind: "confirm", id, opts, resolve }]);
    });
  }, []);

  const prompt = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      const id = ++counterRef.current;
      setStack((prev) => [...prev, { kind: "prompt", id, opts, resolve }]);
    });
  }, []);

  const show = useCallback(<T,>(opts: ShowOptions) => {
    return new Promise<T | null>((resolve) => {
      const id = ++counterRef.current;
      setStack((prev) => [
        ...prev,
        { kind: "show", id, opts, resolve: resolve as (v: unknown) => void },
      ]);
    });
  }, []);

  function close(id: number, value: unknown) {
    setStack((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry) {
        if (entry.kind === "confirm") entry.resolve(Boolean(value));
        else if (entry.kind === "prompt") entry.resolve(value === undefined ? null : (value as string));
        else entry.resolve(value ?? null);
      }
      return prev.filter((e) => e.id !== id);
    });
  }

  return (
    <DialogContext.Provider value={{ confirm, prompt, show }}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <>
            {stack.map((entry, idx) => {
              const isTop = idx === stack.length - 1;
              return (
                <DialogShell
                  key={entry.id}
                  zIndex={50 + idx}
                  onBackdropClose={() => close(entry.id, entry.kind === "confirm" ? false : null)}
                  size={entry.kind === "show" ? entry.opts.size ?? "max-w-md" : "max-w-md"}
                  active={isTop}
                >
                  {entry.kind === "confirm" && (
                    <ConfirmDialog opts={entry.opts} onClose={(v) => close(entry.id, v)} />
                  )}
                  {entry.kind === "prompt" && (
                    <PromptDialog opts={entry.opts} onClose={(v) => close(entry.id, v)} />
                  )}
                  {entry.kind === "show" && entry.opts.render((v) => close(entry.id, v))}
                </DialogShell>
              );
            })}
          </>,
          document.body,
        )}
    </DialogContext.Provider>
  );
}

function DialogShell({
  zIndex,
  size,
  active,
  onBackdropClose,
  children,
}: {
  zIndex: number;
  size: string;
  active: boolean;
  onBackdropClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onBackdropClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onBackdropClose]);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onBackdropClose} />
      <div className={`relative w-full ${size} rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]`}>
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (v: boolean) => void }) {
  return (
    <div>
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]/50">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{opts.title}</h3>
        <button onClick={() => onClose(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </header>
      {opts.body && (
        <div className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{opts.body}</div>
      )}
      <footer className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3 dark:border-[#2c2c2e]/50">
        <button
          onClick={() => onClose(false)}
          className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
        >
          {opts.cancelLabel ?? "Abbrechen"}
        </button>
        <button
          onClick={() => onClose(true)}
          autoFocus
          className={`rounded-xl px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition ${
            opts.danger
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-primary text-gray-900 hover:bg-primary-dark"
          }`}
        >
          {opts.confirmLabel ?? "OK"}
        </button>
      </footer>
    </div>
  );
}

function PromptDialog({ opts, onClose }: { opts: PromptOptions; onClose: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current && "select" in inputRef.current) {
      (inputRef.current as HTMLInputElement).select();
    }
  }, []);

  function handleSubmit() {
    if (opts.validate) {
      const err = opts.validate(value);
      if (err) {
        setError(err);
        return;
      }
    }
    onClose(value);
  }

  const inputCls =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]/50">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{opts.title}</h3>
        <button type="button" onClick={() => onClose(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="space-y-3 px-6 py-4">
        {opts.body && <div className="text-sm text-gray-600 dark:text-gray-400">{opts.body}</div>}
        {opts.multiline ? (
          <textarea
            ref={(el) => { inputRef.current = el; }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={opts.placeholder}
            className={inputCls + " min-h-[100px]"}
          />
        ) : (
          <input
            ref={(el) => { inputRef.current = el; }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={opts.placeholder}
            className={inputCls}
          />
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3 dark:border-[#2c2c2e]/50">
        <button
          type="button"
          onClick={() => onClose(null)}
          className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
        >
          {opts.cancelLabel ?? "Abbrechen"}
        </button>
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-primary-dark"
        >
          {opts.confirmLabel ?? "OK"}
        </button>
      </footer>
    </form>
  );
}

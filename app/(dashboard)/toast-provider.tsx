"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { useToast, type Toast, type ToastOptions } from "@/lib/use-toast";
import { Check, AlertTriangle, Info, X } from "lucide-react";

const ToastContext = createContext<{
  addToast: (message: string, type?: Toast["type"], options?: ToastOptions) => void;
}>({ addToast: () => {} });

export function useToastContext() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, addToast, removeToast } = useToast();

  return (
    <ToastContext value={{ addToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm transition-all animate-in slide-in-from-bottom-2 ${
              toast.type === "success"
                ? "border-green-200 bg-green-50/95 text-green-800 dark:border-green-800 dark:bg-green-900/90 dark:text-green-200"
                : toast.type === "error"
                  ? "border-red-200 bg-red-50/95 text-red-800 dark:border-red-800 dark:bg-red-900/90 dark:text-red-200"
                  : "border-gray-200 bg-white/95 text-gray-800 dark:border-gray-700 dark:bg-gray-800/95 dark:text-gray-200"
            }`}
          >
            {toast.type === "success" && <Check className="h-4 w-4 flex-shrink-0" />}
            {toast.type === "error" && <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
            {toast.type === "info" && <Info className="h-4 w-4 flex-shrink-0" />}
            <p className="text-sm font-medium">{toast.message}</p>
            {toast.action && (
              <Link
                href={toast.action.href}
                onClick={() => removeToast(toast.id)}
                className="ml-1 rounded-md border border-current/30 px-2 py-0.5 text-xs font-semibold underline-offset-2 hover:underline"
              >
                {toast.action.label}
              </Link>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 flex-shrink-0 opacity-50 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

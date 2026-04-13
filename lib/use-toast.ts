"use client";

import { useState, useCallback } from "react";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

let globalAddToast: ((message: string, type?: Toast["type"]) => void) | null = null;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Global accessor
  globalAddToast = addToast;

  return { toasts, addToast, removeToast };
}

/** Toast von außerhalb eines Hooks triggern */
export function showToast(message: string, type: Toast["type"] = "success") {
  if (globalAddToast) globalAddToast(message, type);
}

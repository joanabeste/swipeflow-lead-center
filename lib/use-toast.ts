"use client";

import { useState, useCallback } from "react";

export interface ToastAction {
  label: string;
  /** Wenn gesetzt, wird die Aktion als Link gerendert. */
  href?: string;
  /** Wenn gesetzt, wird die Aktion als Button gerendert. Hat Vorrang vor href. */
  onClick?: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  action?: ToastAction;
}

export interface ToastOptions {
  action?: ToastAction;
  durationMs?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: Toast["type"] = "success", options?: ToastOptions) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, type, action: options?.action }]);
      // Toasts mit Action länger stehen lassen, damit der User klicken kann.
      const duration = options?.durationMs ?? (options?.action ? 7000 : 4000);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

// Zentrale Button-Komponente fürs Lead Center. Einheitliche Rundung (rounded-xl),
// Varianten und Größen — ersetzt die ad-hoc gestylten Buttons.
//
// Konvention: primary (Gold) IMMER mit text-gray-900, nie text-white (Kontrast).

import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-gray-900 hover:bg-primary/90",
  secondary:
    "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15",
  danger:
    "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30",
  ghost:
    "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";

/** Klassen-Set für Elemente, die kein <button> sind (z. B. next/link). */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "sm"): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]}`;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Zeigt einen Spinner und deaktiviert den Button. */
  busy?: boolean;
}

export function Button({
  variant = "primary",
  size = "sm",
  busy = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={`${buttonClasses(variant, size)} ${className}`}
      {...rest}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

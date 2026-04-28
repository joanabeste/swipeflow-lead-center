"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Passwort-Eingabe mit Auge-Icon zum Ein-/Ausblenden des Klartexts.
 * Akzeptiert die ueblichen <input>-Props und reicht sie durch — `type` wird
 * intern gesteuert. `className` wirkt auf das innere <input>, damit bestehende
 * Styling-Klassen 1:1 wiederverwendet werden koennen.
 */
export function PasswordInput({
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`pr-10 ${className}`.trim()}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        title={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

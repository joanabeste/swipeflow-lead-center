"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

export function SearchBox({
  defaultValue,
  placeholder,
  name = "q",
  onSubmit,
  debounceMs = 250,
}: {
  defaultValue: string;
  placeholder: string;
  name?: string;
  onSubmit: (value: string) => void;
  debounceMs?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const [prevDefault, setPrevDefault] = useState(defaultValue);

  // React-19-Pattern: Prop-Change-Reset waehrend des Renders, kein Effect.
  // Wenn die Prop wechselt, setzen wir auch den prevDefault — der Debounce-
  // Effect erkennt dann, dass `value === prevDefault` ist und unterdrueckt
  // ein Re-Submit (wir haben den Wert gerade *vom Parent* erhalten).
  if (prevDefault !== defaultValue) {
    setPrevDefault(defaultValue);
    setValue(defaultValue);
  }

  useEffect(() => {
    if (value === prevDefault) return;
    const id = setTimeout(() => onSubmit(value), debounceMs);
    return () => clearTimeout(id);
  }, [value, prevDefault, debounceMs, onSubmit]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
      className="flex-1"
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          name={name}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>
    </form>
  );
}

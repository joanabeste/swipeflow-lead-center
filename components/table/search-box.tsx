"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const lastSubmitted = useRef(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
    lastSubmitted.current = defaultValue;
  }, [defaultValue]);

  useEffect(() => {
    if (value === lastSubmitted.current) return;
    const id = setTimeout(() => {
      lastSubmitted.current = value;
      onSubmit(value);
    }, debounceMs);
    return () => clearTimeout(id);
  }, [value, debounceMs, onSubmit]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        lastSubmitted.current = value;
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

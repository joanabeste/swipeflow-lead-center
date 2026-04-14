"use client";

import { Search } from "lucide-react";

export function SearchBox({
  defaultValue,
  placeholder,
  name = "q",
  onSubmit,
}: {
  defaultValue: string;
  placeholder: string;
  name?: string;
  onSubmit: (value: string) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = new FormData(e.currentTarget).get(name) as string;
        onSubmit(v ?? "");
      }}
      className="flex-1"
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          name={name}
          type="text"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>
    </form>
  );
}

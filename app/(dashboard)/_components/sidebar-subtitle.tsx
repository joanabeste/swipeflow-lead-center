"use client";

import { usePathname } from "next/navigation";

function labelFromPath(pathname: string): string {
  if (pathname.startsWith("/zeit")) return "Zeit";
  if (pathname.startsWith("/fulfillment")) return "Fulfillment";
  return "Vertrieb";
}

export function SidebarSubtitle() {
  const pathname = usePathname();
  return (
    <span className="mt-2 block text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">
      {labelFromPath(pathname)}
    </span>
  );
}

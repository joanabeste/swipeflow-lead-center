"use client";

import { createContext, useCallback, useContext } from "react";
import { useRouter } from "next/navigation";

type Ctx = { notify: () => void };

const PreviewRefreshContext = createContext<Ctx | null>(null);

export function PreviewRefreshProvider({
  onRefresh,
  children,
}: {
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  return (
    <PreviewRefreshContext.Provider value={{ notify: onRefresh }}>
      {children}
    </PreviewRefreshContext.Provider>
  );
}

// Innerhalb eines Preview-Drawers: re-fetcht das Drawer-Bundle (und ruft selbst
// router.refresh fuer die Liste dahinter). Ausserhalb: nur router.refresh.
export function usePreviewRefresh(): () => void {
  const ctx = useContext(PreviewRefreshContext);
  const router = useRouter();
  return useCallback(() => {
    if (ctx) ctx.notify();
    else router.refresh();
  }, [ctx, router]);
}

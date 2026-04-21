"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface CallProviders {
  phonemondo: boolean;
  webex: boolean;
}

const CallProvidersContext = createContext<CallProviders>({ phonemondo: false, webex: false });

export function CallProvidersProvider({
  value,
  children,
}: {
  value: CallProviders;
  children: ReactNode;
}) {
  return <CallProvidersContext.Provider value={value}>{children}</CallProvidersContext.Provider>;
}

export function useCallProviders(): CallProviders {
  return useContext(CallProvidersContext);
}

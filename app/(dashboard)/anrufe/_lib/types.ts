import type { CallProvider } from "../../crm/actions";
import type { CallStatus } from "../actions";

export type QueueMode = "idle" | "calling" | "paused" | "awaiting-next";

export interface ActiveCall {
  callId: string;
  leadId: string;
  provider: CallProvider;
  startedAt: number;
  status: CallStatus;
}

export const POLL_INTERVAL_MS = 2000;

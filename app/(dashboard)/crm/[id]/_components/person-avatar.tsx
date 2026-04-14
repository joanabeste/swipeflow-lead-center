import {
  StickyNote, PhoneCall, Activity as ActivityIcon, Sparkles, ArrowRight,
} from "lucide-react";
import type { ActivityKind } from "./types";
import { hashHue } from "./activity-helpers";

export function PersonAvatar({ name, kind }: { name: string | null; kind: ActivityKind }) {
  const initials = name
    ? name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"
    : "·";
  const hue = name ? hashHue(name) : 210;
  const config: Record<ActivityKind, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
    all: { icon: ActivityIcon, color: "#9ca3af" },
    note: { icon: StickyNote, color: "#f59e0b" },
    call: { icon: PhoneCall, color: "#10b981" },
    status: { icon: ArrowRight, color: "#ec4899" },
    enrichment: { icon: Sparkles, color: "#6366f1" },
    change: { icon: ActivityIcon, color: "#6b7280" },
  };
  const c = config[kind] ?? config.all;
  const Icon = c.icon;
  return (
    <div className="relative">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: `hsl(${hue}, 50%, 45%)` }}
      >
        {initials}
      </div>
      <div
        className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white dark:border-[#1c1c1e]"
        style={{ backgroundColor: c.color }}
      >
        <Icon className="h-2.5 w-2.5 text-white" />
      </div>
    </div>
  );
}

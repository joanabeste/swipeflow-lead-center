import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="ml-2 text-sm">Lädt…</span>
    </div>
  );
}

import { requireZeitAdmin } from "@/lib/zeit/auth";
import { getRangeFor, isPeriodView, entriesToCSV } from "@/lib/zeit/reports";
import { loadAllEntriesInRange, loadAllProfiles } from "../../../_components/data-helpers";

export async function GET(req: Request) {
  await requireZeitAdmin();
  const url = new URL(req.url);
  const v = url.searchParams.get("view") ?? "month";
  const view = isPeriodView(v) ? v : "month";
  const range = getRangeFor(view);
  const [entries, profiles] = await Promise.all([loadAllEntriesInRange(range.from, range.to), loadAllProfiles()]);
  const userMap = new Map(profiles.map((p) => [p.id, p.name || p.email]));
  const csv = "﻿" + entriesToCSV(entries, userMap);
  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zeit-alle-${view}-${today}.csv"`,
    },
  });
}

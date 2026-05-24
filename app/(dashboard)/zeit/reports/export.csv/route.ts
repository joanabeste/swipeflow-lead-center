import { requireZeitUser } from "@/lib/zeit/auth";
import { getRangeFor, isPeriodView, entriesToCSV } from "@/lib/zeit/reports";
import { loadEntriesInRange } from "../../_components/data-helpers";

export async function GET(req: Request) {
  const ctx = await requireZeitUser();
  const url = new URL(req.url);
  const v = url.searchParams.get("view") ?? "week";
  const view = isPeriodView(v) ? v : "week";
  const range = getRangeFor(view);
  const entries = await loadEntriesInRange(ctx.user.id, range.from, range.to);
  const csv = "﻿" + entriesToCSV(entries);
  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zeit-${view}-${today}.csv"`,
    },
  });
}

import Link from "next/link";
import { BookOpen, CheckCircle2 } from "lucide-react";

interface Props {
  href: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  lessonCount: number;
  completedCount: number;
  status?: "draft" | "published";
}

export function CourseCard({ href, title, summary, coverUrl, lessonCount, completedCount, status }: Props) {
  const pct = lessonCount > 0 ? Math.round((completedCount / lessonCount) * 100) : 0;
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-transparent">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-primary/40">
            <BookOpen className="h-12 w-12" />
          </div>
        )}
        {status === "draft" && (
          <span className="absolute right-2 top-2 rounded-full bg-yellow-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-white shadow">
            Entwurf
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {summary && <p className="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{summary}</p>}
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{lessonCount} Lektion{lessonCount === 1 ? "" : "en"}</span>
          {lessonCount > 0 && (
            <span className="flex items-center gap-1">
              {pct === 100 ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : null}
              {pct}%
            </span>
          )}
        </div>
        {lessonCount > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-[#2c2c2e]/50">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}

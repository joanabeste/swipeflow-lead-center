import { Video, FileText, Paperclip, Layers } from "lucide-react";
import type { LearningLessonType } from "@/lib/types";

export const LESSON_TYPE_LABELS: Record<LearningLessonType, string> = {
  video: "Video",
  text: "Text",
  file: "Datei",
  mixed: "Gemischt",
};

export function LessonTypeIcon({
  type,
  className,
}: {
  type: LearningLessonType;
  className?: string;
}) {
  const cls = className ?? "h-3.5 w-3.5";
  if (type === "video") return <Video className={cls} />;
  if (type === "text") return <FileText className={cls} />;
  if (type === "file") return <Paperclip className={cls} />;
  return <Layers className={cls} />;
}

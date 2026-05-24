import { parseVideoUrl } from "../_lib/format";

export function VideoEmbed({ url }: { url: string | null | undefined }) {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-black dark:border-[#2c2c2e]/50">
      <iframe
        src={parsed.embedUrl}
        title={parsed.provider === "youtube" ? "YouTube-Video" : "Loom-Video"}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
      />
    </div>
  );
}

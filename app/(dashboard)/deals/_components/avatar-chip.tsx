import Image from "next/image";

export function AvatarChip({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <div className="relative h-5 w-5 overflow-hidden rounded-full" title={name}>
        <Image src={avatarUrl} alt={name} fill sizes="20px" className="object-cover" unoptimized />
      </div>
    );
  }
  const initials = name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[9px] font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-300"
      title={name}
    >
      {initials}
    </span>
  );
}

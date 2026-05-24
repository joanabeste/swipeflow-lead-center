"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Cropper, { type Area } from "react-easy-crop";
import { Upload, Trash2, Check, X, ImageIcon } from "lucide-react";
import { useToastContext } from "../../toast-provider";
import { useDialog } from "@/components/dialog";
import { uploadCourseCover, removeCourseCover } from "../_actions/attachments";

export function CoverImageUpload({
  courseId,
  currentPath,
  publicBaseUrl,
}: {
  courseId: string;
  currentPath: string | null;
  publicBaseUrl: string;
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const dialog = useDialog();
  const [pending, startTransition] = useTransition();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentUrl = currentPath ? `${publicBaseUrl}/${currentPath}` : null;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      addToast("Nur JPEG/PNG/WebP erlaubt.", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast("Bild zu groß (max. 10 MB).", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleConfirm() {
    if (!imageSrc || !croppedPixels) return;
    const dataUrl = await cropToDataUrl(imageSrc, croppedPixels);
    startTransition(async () => {
      const res = await uploadCourseCover({ courseId, dataUrl });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Cover gespeichert", "success");
      setImageSrc(null);
      router.refresh();
    });
  }

  async function handleRemove() {
    const ok = await dialog.confirm({
      title: "Cover entfernen?",
      danger: true,
      confirmLabel: "Entfernen",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await removeCourseCover(courseId);
      if (res.error) {
        addToast(res.error, "error");
        return;
      }
      addToast("Cover entfernt", "success");
      router.refresh();
    });
  }

  if (imageSrc) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]">
          <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]/50">
            <h3 className="text-lg font-semibold">Cover zuschneiden (16:9)</h3>
            <button
              onClick={() => setImageSrc(null)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="relative h-80 bg-black">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={16 / 9}
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_a, areaPixels) => setCroppedPixels(areaPixels)}
            />
          </div>
          <div className="space-y-3 border-t border-gray-100 p-6 dark:border-[#2c2c2e]/50">
            <label className="flex items-center gap-3 text-sm">
              <span className="w-12 text-gray-500">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setImageSrc(null)}
                className="rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
              >
                Abbrechen
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending || !croppedPixels}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {pending ? "Lade…" : "Übernehmen"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {currentUrl ? (
        <div className="group relative aspect-[16/9] overflow-hidden rounded-xl border border-gray-200 dark:border-[#2c2c2e]/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100"
            >
              <Upload className="mr-1 inline h-3.5 w-3.5" /> Ändern
            </button>
            <button
              onClick={handleRemove}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
            >
              <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Entfernen
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 transition hover:border-primary hover:bg-primary/5 hover:text-primary dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
        >
          <ImageIcon className="h-8 w-8" />
          <span className="text-xs">Cover hochladen (16:9)</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}

async function cropToDataUrl(src: string, area: Area): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  // 16:9, max-width 1280 für vernünftige Auflösung ohne Riesen-File.
  const maxW = 1280;
  canvas.width = Math.min(maxW, area.width);
  canvas.height = Math.round(canvas.width * (9 / 16));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = src;
  });
}

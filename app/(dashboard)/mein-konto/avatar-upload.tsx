"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Cropper, { type Area } from "react-easy-crop";
import { Upload, Trash2, Check, X } from "lucide-react";
import { saveMyAvatar, removeMyAvatar } from "./actions";
import { useToastContext } from "../toast-provider";

export function AvatarUpload({ currentUrl, fallback }: { currentUrl: string | null; fallback: string }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      addToast("Nur JPEG/PNG/WebP erlaubt.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast("Bild zu groß (max. 5 MB).", "error");
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
      const res = await saveMyAvatar(dataUrl);
      if (res.error) {
        addToast(res.error, "error");
      } else {
        addToast("Profilbild aktualisiert.", "success");
        setImageSrc(null);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!currentUrl) return;
    if (!confirm("Profilbild wirklich entfernen?")) return;
    startDelete(async () => {
      const res = await removeMyAvatar();
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Profilbild entfernt.", "success");
        router.refresh();
      }
    });
  }

  if (imageSrc) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
            <h3 className="text-lg font-semibold">Bild zuschneiden</h3>
            <button
              onClick={() => setImageSrc(null)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative h-80 bg-black">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_area, areaPixels) => setCroppedPixels(areaPixels)}
            />
          </div>
          <div className="space-y-3 border-t border-gray-100 p-6 dark:border-[#2c2c2e]">
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
                className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
              >
                Abbrechen
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending || !croppedPixels}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {pending ? "Lade hoch…" : "Übernehmen"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 overflow-hidden rounded-full border border-gray-200 bg-gray-100 dark:border-[#2c2c2e] dark:bg-[#232325]">
        {currentUrl ? (
          <Image src={currentUrl} alt="Profilbild" fill className="object-cover" sizes="80px" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-gray-400">
            {fallback}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-[#2c2c2e] dark:text-gray-200 dark:hover:bg-white/5"
        >
          <Upload className="h-3.5 w-3.5" />
          {currentUrl ? "Neues Bild hochladen" : "Profilbild hochladen"}
        </button>
        {currentUrl && (
          <button
            onClick={handleDelete}
            disabled={deletePending}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Entfernen
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Schneidet das Bild auf die gewählte Fläche zu und gibt es als
 * JPEG-Data-URL mit maximal 512×512 zurück (spart Storage + Load-Time).
 */
async function cropToDataUrl(src: string, area: Area): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  const maxSize = 512;
  canvas.width = Math.min(maxSize, area.width);
  canvas.height = Math.min(maxSize, area.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, canvas.width, canvas.height,
  );
  return canvas.toDataURL("image/jpeg", 0.9);
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

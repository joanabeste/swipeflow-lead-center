"use client";

// Eigenes HTML5-Canvas-Signatur-Pad ohne externe Dependency.
// Zeichnet auf transparentem Hintergrund -> toDataUrl liefert ein PNG mit Transparenz.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Eraser } from "lucide-react";

export interface SignaturePadHandle {
  toDataUrl: () => string;
  isEmpty: () => boolean;
  clear: () => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty.current = false;
    }
  };

  useImperativeHandle(ref, () => ({
    toDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? "",
    isEmpty: () => !dirty.current,
    clear,
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // HiDPI-Skalierung anhand der angezeigten Größe.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#111";
    }
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  }

  function end() {
    drawing.current = false;
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-40 w-full touch-none rounded-xl border border-dashed border-gray-300 bg-gray-50"
      />
      <button
        type="button"
        onClick={clear}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        <Eraser className="h-3.5 w-3.5" /> Löschen
      </button>
    </div>
  );
});

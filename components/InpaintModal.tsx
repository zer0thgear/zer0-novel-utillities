'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useInpaint } from '@/hooks/useInpaint';
import { GeneratedImage } from '@/types/novelai';

interface InpaintModalProps {
  image: GeneratedImage;
  onClose: () => void;
}

type Tool = 'brush' | 'eraser';

const MAX_HISTORY = 20;

export function InpaintModal({ image, onClose }: InpaintModalProps) {
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);

  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(40);
  const [strength, setStrength] = useState(0.65);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const { inpaint, isInpainting } = useInpaint();

  // ── Canvas init ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.width = image.parameters.width;
    canvas.height = image.parameters.height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Save blank state as the base of the undo stack
    undoStack.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
    redoStack.current = [];
  }, [image.parameters.width, image.parameters.height]);

  // ── Undo / Redo ────────────────────────────────────────────────────────────

  const saveSnapshot = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const snapshot = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.current.push(snapshot);
    if (undoStack.current.length > MAX_HISTORY + 1) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const undo = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || undoStack.current.length <= 1) return;
    const popped = undoStack.current.pop()!;
    redoStack.current.push(popped);
    canvas.getContext('2d')!.putImageData(undoStack.current[undoStack.current.length - 1], 0, 0);
  }, []);

  const redo = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(next);
    canvas.getContext('2d')!.putImageData(next, 0, 0);
  }, []);

  // ── Coordinate conversion ──────────────────────────────────────────────────

  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left)  * (canvas.width  / rect.width),
      y: (clientY - rect.top)   * (canvas.height / rect.height),
    };
  }, []);

  // ── Drawing ────────────────────────────────────────────────────────────────

  const paint = useCallback((clientX: number, clientY: number) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { x, y } = toCanvasCoords(clientX, clientY);

    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);

    if (tool === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    }
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }, [tool, brushSize, toCanvasCoords]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDrawing(true);
    paint(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setCursorPos({ x: e.clientX, y: e.clientY });
    if (isDrawing) paint(e.clientX, e.clientY);
  };

  const handleMouseUp = () => { setIsDrawing(false); saveSnapshot(); };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const t = e.touches[0];
    paint(t.clientX, t.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const t = e.touches[0];
    paint(t.clientX, t.clientY);
  };

  const handleTouchEnd = () => { setIsDrawing(false); saveSnapshot(); };

  // ── Clear ──────────────────────────────────────────────────────────────────

  const handleClear = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    saveSnapshot();
  };

  // ── Generate ───────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    // Build white/black mask: painted pixels → white, rest → black
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width  = image.parameters.width;
    maskCanvas.height = image.parameters.height;
    const mCtx = maskCanvas.getContext('2d')!;

    // Black background (preserve)
    mCtx.fillStyle = 'black';
    mCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Paste draw canvas; any painted (non-transparent) pixel will be used
    // as source. Then we convert to white by using 'source-in' with a white fill.
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width  = maskCanvas.width;
    tempCanvas.height = maskCanvas.height;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(canvas, 0, 0);
    // Replace any colour with white while keeping alpha
    tCtx.globalCompositeOperation = 'source-in';
    tCtx.fillStyle = 'white';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Draw white strokes onto black background
    mCtx.drawImage(tempCanvas, 0, 0);

    const maskBlob = await new Promise<Blob>((resolve) =>
      maskCanvas.toBlob((b) => resolve(b!), 'image/png'),
    );

    onClose();
    await inpaint(image, maskBlob, strength);
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); return; }
        if (e.key === 'y') { e.preventDefault(); redo(); return; }
      }
      if (e.key === 'b' || e.key === 'B') setTool('brush');
      if (e.key === 'e' || e.key === 'E') setTool('eraser');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, undo, redo]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const canvasScaleX = drawCanvasRef.current
    ? drawCanvasRef.current.getBoundingClientRect().width / image.parameters.width
    : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex h-full w-full max-h-screen flex-col overflow-hidden">

        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-700 bg-slate-900 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 transition-colors hover:text-slate-200"
            title="Close (Esc)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-300">Inpaint Image</span>
          <span className="text-xs text-slate-600">Paint over areas to regenerate</span>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left toolbar */}
          <div className="flex w-44 flex-shrink-0 flex-col gap-4 border-r border-slate-700 bg-slate-900/90 p-4">

            {/* Tool selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tool</span>
              {(['brush', 'eraser'] as Tool[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTool(t)}
                  className={`rounded px-3 py-1.5 text-left text-xs font-medium capitalize transition-colors ${
                    tool === t
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {t} <span className="opacity-50">({t[0].toUpperCase()})</span>
                </button>
              ))}
            </div>

            {/* Brush size */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Size — {brushSize}px
              </span>
              <input
                type="range"
                min={8}
                max={200}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            {/* Strength */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Strength — {strength.toFixed(2)}
              </span>
              <input
                type="range"
                min={0.1}
                max={0.99}
                step={0.01}
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            {/* Actions */}
            <div className="mt-auto flex flex-col gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="rounded bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-600"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isInpainting}
                className="rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isInpainting ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>

          {/* Canvas area */}
          <div
            ref={containerRef}
            className="relative flex flex-1 items-center justify-center overflow-hidden bg-slate-950 p-4"
            onMouseLeave={() => { setCursorPos(null); setIsDrawing(false); }}
          >
            {/* Aspect-ratio container */}
            <div className="relative select-none" style={{ cursor: 'none' }}>
              {/* Base image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.prompt}
                className="block max-h-[calc(100vh-120px)] max-w-full object-contain"
                draggable={false}
              />

              {/* Draw canvas — stacked absolutely, same size as img */}
              <canvas
                ref={drawCanvasRef}
                className="absolute inset-0 h-full w-full"
                style={{ cursor: 'none' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />

              {/* Custom brush cursor */}
              {cursorPos && (
                <div
                  className="pointer-events-none fixed -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70"
                  style={{
                    left: cursorPos.x,
                    top: cursorPos.y,
                    width:  brushSize * canvasScaleX,
                    height: brushSize * canvasScaleX,
                    borderColor: tool === 'eraser' ? 'rgba(148,163,184,0.8)' : 'rgba(239,68,68,0.8)',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useRef, useState } from 'react';
import { CharacterPromptEntry } from '@/types/novelai';

interface Props {
  characters: CharacterPromptEntry[];
  onChange: (characters: CharacterPromptEntry[]) => void;
  onClose: () => void;
  /** Clicking a marker (without dragging it) opens that character's card. */
  onSelect?: (id: string) => void;
  /** width / height of the target image, so the canvas matches its proportions. */
  aspectRatio: number;
}

const CANVAS_WIDTH = 420;
/** Pointer travel (px) before a press on a marker counts as a drag, not a click. */
const DRAG_THRESHOLD = 4;

export function CharacterPositionCanvas({ characters, onChange, onClose, onSelect, aspectRatio }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const pressRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Numbered by place in the (unarchived) list, matching the editor's
  // "Character N" placeholders.
  const live = characters.filter((c) => !c.archived);
  const enabledCharacters = live.filter((c) => c.enabled);

  const setPositionFromPointer = (id: string, clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * 100) / 100;
    const y = Math.round(Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)) * 100) / 100;
    onChange(characters.map((c) => (c.id === id ? { ...c, center: { x, y } } : c)));
  };

  const handlePointerDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // No such pointer any more (it was lifted already); drag without it.
    }
    setDraggingId(id);
    pressRef.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const press = pressRef.current;
    if (!draggingId || !press) return;
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD) return;
    press.moved = true;
    setPositionFromPointer(draggingId, e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    if (draggingId && pressRef.current && !pressRef.current.moved) onSelect?.(draggingId);
    stopDragging();
  };

  const stopDragging = () => {
    setDraggingId(null);
    pressRef.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 phone:p-3">
      {/* Up to CANVAS_WIDTH of canvas, narrower on a phone. */}
      <div
        className="flex w-full flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-2xl phone:p-4"
        style={{ maxWidth: CANVAS_WIDTH + 40 }}
      >
        <div className="flex items-center justify-between gap-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Character Positions</h3>
            <p className="text-xs text-slate-500">
              Drag a marker to place that character{onSelect ? ', or click it to edit the character' : ''}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
          >
            Done
          </button>
        </div>

        <div
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={stopDragging}
          className="relative touch-none overflow-hidden rounded-lg border border-slate-700 bg-slate-900/60"
          style={{
            width: '100%',
            aspectRatio,
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.15) 1px, transparent 1px)',
            backgroundSize: '10% 10%',
          }}
        >
          {enabledCharacters.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-slate-600">
              Enable a character to position it here.
            </p>
          )}
          {enabledCharacters.map((char) => {
            const number = live.indexOf(char) + 1;
            return (
            <button
              key={char.id}
              type="button"
              onPointerDown={handlePointerDown(char.id)}
              title={char.label || `Character ${number}`}
              className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-violet-300 bg-violet-600 text-xs font-bold text-white shadow-lg active:cursor-grabbing"
              style={{ left: `${char.center.x * 100}%`, top: `${char.center.y * 100}%` }}
            >
              {number}
            </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-600">
          Marker numbers match the character list order. Positions are freeform (not snapped to a grid).
        </p>
      </div>
    </div>
  );
}

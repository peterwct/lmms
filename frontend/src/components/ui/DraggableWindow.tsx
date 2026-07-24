import { ReactNode, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;   // px; the window is horizontally centered on open
}

// A movable, non-modal floating window: renders inline (no portal, no backdrop) so the
// page stays interactive. Drag it by its header.
export function DraggableWindow({ open, title, onClose, children, width = 900 }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Center horizontally / near the top on first open
  useEffect(() => {
    if (open && pos === null) {
      const x = Math.max(16, Math.round((window.innerWidth - width) / 2));
      setPos({ x, y: 80 });
    }
    if (!open) { setPos(null); drag.current = null; setDragging(false); }
  }, [open, pos, width]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const x = Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - 120);
      const y = Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - 40);
      setPos({ x, y });
    };
    const onUp = () => { setDragging(false); drag.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  if (!open || !pos) return null;

  const startDrag = (e: React.MouseEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    setDragging(true);
    e.preventDefault();
  };

  return (
    <div
      className={`fixed z-40 rounded-lg bg-white shadow-2xl border border-gray-200 ${dragging ? 'select-none' : ''}`}
      style={{ left: pos.x, top: pos.y, width, maxWidth: 'calc(100vw - 2rem)' }}
    >
      <div
        onMouseDown={startDrag}
        className="flex items-center justify-between border-b px-4 py-2.5 cursor-move bg-gray-50 rounded-t-lg"
      >
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 py-3 overflow-auto max-h-[calc(100vh-9rem)]">{children}</div>
    </div>
  );
}

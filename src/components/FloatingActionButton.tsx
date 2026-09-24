import { Plus } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";

type Point = { x: number; y: number };

type FloatingActionButtonProps = { onClick: () => void };

export function FloatingActionButton({ onClick }: FloatingActionButtonProps) {
  const [position, setPosition] = useState<Point | null>(null);
  const start = useRef<Point | null>(null);
  const dragged = useRef(false);
  const suppressClick = useRef(false);
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    start.current = { x: event.clientX, y: event.clientY };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!start.current) return;
    const deltaX = event.clientX - start.current.x;
    const deltaY = event.clientY - start.current.y;
    if (!dragged.current && Math.hypot(deltaX, deltaY) < 5) return;
    dragged.current = true;
    setPosition({ x: Math.min(Math.max(12, event.clientX - 28), window.innerWidth - 68), y: Math.min(Math.max(12, event.clientY - 28), window.innerHeight - 68) });
  };
  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    suppressClick.current = dragged.current;
    start.current = null;
  };
  const handleClick = () => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    onClick();
  };
  return <button className="floating-action-button" style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined} type="button" aria-label="Adicionar movimento" title="Adicionar movimento" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onClick={handleClick}><Plus size={24} /></button>;
}

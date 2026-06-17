import { useEffect, useRef } from "react";
import type { Agent } from "./types";

const FRAME_WIDTH = 48;
const FRAME_HEIGHT = 96;
const SHEET_COLUMNS = 56;
const FRAMES_PER_DIR = 6;
const DIR_INDEX: Record<Agent["facing"], number> = {
  right: 0,
  up: 1,
  left: 2,
  down: 3,
};

export default function PixelAvatar({ agent }: { agent: Agent }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  const draw = () => {
    const loadedImage = imgRef.current;
    const targetCanvas = canvasRef.current;
    if (!loadedImage || !targetCanvas) return;
    const targetCtx = targetCanvas.getContext("2d");
    if (!targetCtx) return;

    const dirIndex = DIR_INDEX[agent.facing];
    const row = agent.motion === "walk" ? 2 : 1;
    const sx = dirIndex * FRAMES_PER_DIR * FRAME_WIDTH + frameRef.current * FRAME_WIDTH;
    const sy = row * FRAME_HEIGHT;

    targetCtx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(
      loadedImage,
      sx,
      sy,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      0,
      0,
      FRAME_WIDTH,
      FRAME_HEIGHT,
    );
  };

  useEffect(() => {
    const img = new Image();
    img.src = agent.spritePath;
    imgRef.current = img;

    let cancelled = false;
    img.onload = () => {
      if (!cancelled) draw();
    };

    return () => {
      cancelled = true;
      imgRef.current = null;
    };
  }, [agent.spritePath]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imgRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tick = (timestamp: number) => {
      const interval = agent.motion === "walk" ? 90 : 140;
      if (timestamp - lastTickRef.current >= interval) {
        frameRef.current = (frameRef.current + 1) % FRAMES_PER_DIR;
        lastTickRef.current = timestamp;
        draw();
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = 0;
    lastTickRef.current = 0;
    draw();
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [agent.facing, agent.motion]);

  return (
    <canvas
      ref={canvasRef}
      width={FRAME_WIDTH}
      height={FRAME_HEIGHT}
      className="pixel-avatar"
      aria-hidden="true"
    />
  );
}

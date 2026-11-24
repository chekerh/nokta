import { useState, useEffect, useCallback, useRef } from "react";

interface SpriteFrame {
  file: string;
  maxX: number;
}

const defaultFrames: SpriteFrame[] = [
  { file: "head-far-left", maxX: 0.2 },
  { file: "head-left", maxX: 0.4 },
  { file: "head-center", maxX: 0.6 },
  { file: "head-right", maxX: 0.8 },
  { file: "head-far-right", maxX: 1 },
];

export function useCursorFollow(frames: SpriteFrame[] = defaultFrames) {
  const [currentFrame, setCurrentFrame] = useState(2);
  const frameRef = useRef(2);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const frameIndex = frames.findIndex((frame) => x <= frame.maxX);
      if (frameIndex !== -1 && frameIndex !== frameRef.current) {
        frameRef.current = frameIndex;
        setCurrentFrame(frameIndex);
      }
    },
    [frames]
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return { currentFrame, frames };
}

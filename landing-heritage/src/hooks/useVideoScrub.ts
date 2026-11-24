import { useEffect, useRef, useCallback } from "react";

const SENSITIVITY = 0.8;

export function useVideoScrub(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const prevX = useRef(0);
  const targetTime = useRef(0);
  const seeking = useRef(false);

  const seekTo = useCallback(() => {
    const video = videoRef.current;
    if (!video || seeking.current) return;
    if (Math.abs(video.currentTime - targetTime.current) < 0.01) return;

    seeking.current = true;
    video.currentTime = targetTime.current;
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onSeeked = () => {
      seeking.current = false;
      seekTo();
    };

    video.addEventListener("seeked", onSeeked);
    return () => video.removeEventListener("seeked", onSeeked);
  }, [videoRef, seekTo]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const video = videoRef.current;
      if (!video || !video.duration) return;

      const delta = e.clientX - prevX.current;
      prevX.current = e.clientX;

      const offset = (delta / window.innerWidth) * SENSITIVITY * video.duration;
      targetTime.current = Math.max(0, Math.min(video.duration, targetTime.current + offset));

      seekTo();
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [videoRef, seekTo]);
}

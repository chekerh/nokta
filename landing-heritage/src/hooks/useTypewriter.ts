import { useState, useEffect, useRef } from "react";

interface UseTypewriterOptions {
  speed?: number;
  startDelay?: number;
}

export function useTypewriter(text: string, options: UseTypewriterOptions = {}) {
  const { speed = 38, startDelay = 600 } = options;
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);
  const started = useRef(false);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed("");
    setDone(false);
    started.current = false;

    const delayTimer = setTimeout(() => {
      started.current = true;
    }, startDelay);

    return () => clearTimeout(delayTimer);
  }, [text, startDelay]);

  useEffect(() => {
    if (!started.current) return;

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        indexRef.current++;
        setDisplayed(text.slice(0, indexRef.current));
      } else {
        setDone(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, started.current]);

  return { displayed, done };
}

import { useState, useEffect } from "react";
import { useTypewriter } from "../hooks/useTypewriter";

export default function Hero() {
  const { displayed, done } = useTypewriter(
    "Your AI engineering team, always running. Point at a repo, and watch 25 agents discover work, code features, review, and ship — without you asking.",
    { speed: 38, startDelay: 600 }
  );

  const [showPills, setShowPills] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowPills(true), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="h-screen flex flex-col justify-end md:justify-center px-5 sm:px-8 md:px-10 overflow-hidden relative z-10">
      <div className="max-w-xl relative z-10">
        {/* Blurred intro label */}
        <div className="pointer-events-none select-none mb-5 sm:mb-6" style={{ filter: "blur(4px)" }}>
          <p
            className="text-black font-normal leading-[1.3]"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "clamp(18px, 4vw, 26px)",
            }}
          >
            Hey there, meet N.O.K.T.A,
            <br />
            Nokta's Autonomous Knowledge & Task Agent
          </p>
        </div>

        {/* Typewriter text */}
        <p
          className="text-black mb-5 sm:mb-6 font-normal leading-[1.35] min-h-[54px]"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "clamp(18px, 4vw, 26px)",
          }}
        >
          {displayed}
          {!done && (
            <span className="inline-block w-[2px] h-[1.1em] bg-black align-middle ml-[2px] animate-[blink_1s_step-end_infinite]" />
          )}
        </p>

        {/* Pill buttons */}
        <div
          className={`flex flex-wrap gap-y-1 transition-all duration-400 ${
            showPills ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
        >
          <PillButton onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
            See what I can do
          </PillButton>
          <PillButton onClick={() => document.getElementById("agents")?.scrollIntoView({ behavior: "smooth" })}>
            Meet the agents
          </PillButton>
          <PillButton onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>
            See how we operate
          </PillButton>
          <PillButton onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>
            View pricing
          </PillButton>
          <OutlinePillButton text="hello@nokta.dev" />
        </div>
      </div>
    </section>
  );
}

function PillButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center bg-white text-black border border-black/10 rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] whitespace-nowrap hover:bg-black hover:text-white transition-colors duration-200"
      style={{ fontFamily: "var(--font-body)" }}
    >
      {children}
    </button>
  );
}

function OutlinePillButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center justify-center text-white bg-transparent border border-white rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] gap-2 sm:gap-3 whitespace-nowrap hover:bg-white hover:text-black transition-colors duration-200"
      style={{ fontFamily: "var(--font-body)" }}
    >
      <span>
        {copied ? "Copied!" : "Reach us:"} <span className="underline underline-offset-1">{text}</span>
      </span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
        <path d="M8.5 3.5V1.5H1.5V8.5H3.5" />
      </svg>
    </button>
  );
}

import { useCursorFollow } from "../hooks/useCursorFollow";
import { useScrollProgress } from "../hooks/useScrollProgress";

const frames = [
  { file: "head-far-left", maxX: 0.2 },
  { file: "head-left", maxX: 0.4 },
  { file: "head-center", maxX: 0.6 },
  { file: "head-right", maxX: 0.8 },
  { file: "head-far-right", maxX: 1 },
];

export default function Character() {
  const { currentFrame } = useCursorFollow(frames);
  const scrollProgress = useScrollProgress();

  const isShrunk = scrollProgress > 0.3;
  const scale = isShrunk ? 0.15 + (1 - scrollProgress) * 0.1 : 1;
  const position = isShrunk ? "fixed" : "absolute";
  const bottom = isShrunk ? "24px" : "10%";
  const right = isShrunk ? "24px" : "10%";
  const opacity = scrollProgress > 0.1 ? 1 : 0;

  return (
    <div
      className="z-20 pointer-events-none transition-all duration-500 ease-out"
      style={{
        position,
        bottom,
        right,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      {/* Main character */}
      <div className="relative">
        {/* Glow */}
        <div className="absolute -inset-16 bg-[#FFD93D]/10 rounded-full blur-3xl" />

        {/* Body */}
        <div className="relative flex flex-col items-center">
          {/* Head - follows cursor */}
          <img
            src={`/frames/${frames[currentFrame].file}.svg`}
            alt="Nokta"
            className="w-32 h-32 object-contain transition-all duration-150 ease-out"
            draggable={false}
            onError={(e) => {
              // Fallback to dot if image missing
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          {/* Fallback dot */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-[#FFD93D] rounded-full flex items-center justify-center shadow-[0_0_80px_#FFD93D40]">
            <span className="text-black text-6xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
              .
            </span>
          </div>

          {/* Body below head */}
          <div className="w-24 h-28 bg-white rounded-b-3xl -mt-3 relative overflow-hidden">
            <div className="absolute inset-x-3 top-3 bottom-1 bg-[#FFD93D] rounded-b-2xl" />
            <div className="absolute inset-0 flex items-center justify-center pt-6">
              <span className="text-black font-bold text-[10px] tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                NOKTA
              </span>
            </div>
          </div>

          {/* Feet */}
          <div className="flex gap-2 justify-center -mt-1">
            <div className="w-8 h-3 bg-black rounded-b-md" />
            <div className="w-8 h-3 bg-black rounded-b-md" />
          </div>
        </div>

        {/* Speech bubble when shrunk */}
        {isShrunk && (
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white text-black text-xs px-3 py-2 rounded-lg shadow-lg">
            <span style={{ fontFamily: "var(--font-body)" }}>
              {scrollProgress < 0.5
                ? "I discover work autonomously..."
                : scrollProgress < 0.7
                ? "I delegate to 25 specialist agents..."
                : "I verify and ship code for you."}
            </span>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-white rotate-45" />
          </div>
        )}
      </div>
    </div>
  );
}

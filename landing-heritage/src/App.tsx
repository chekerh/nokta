import { useRef } from "react";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Character from "./components/Character";
import { useVideoScrub } from "./hooks/useVideoScrub";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoScrub(videoRef);

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Background video - mouse scrubbed */}
      <video
        ref={videoRef}
        className="fixed inset-0 z-0 w-full h-full object-cover"
        style={{ objectPosition: "70% center" }}
        muted
        playsInline
        preload="auto"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>

      {/* Dark overlay for text readability */}
      <div className="fixed inset-0 z-0 bg-white/40" />

      <Navbar />
      <Hero />
      <Character />

      {/* How It Works */}
      <section id="how" className="relative z-10 py-32 px-5 sm:px-8 max-w-7xl mx-auto bg-white/80 backdrop-blur-sm rounded-3xl mx-5 sm:mx-8 my-12">
        <h2
          className="text-4xl md:text-5xl font-bold mb-16 text-center"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {[
            { step: "01", title: "Point at a Repo", desc: "Nokta reads your codebase, understands the business, and maps the architecture." },
            { step: "02", title: "Build a Company", desc: "It creates 25 specialist agents — CTO, Frontend, Backend, Security, QA — each with a specific role." },
            { step: "03", title: "Discover Work", desc: "Agents autonomously find bugs, missing features, improvements, and security gaps." },
            { step: "04", title: "Execute & Verify", desc: "Tasks are delegated, executed, and independently verified. Code ships without you asking." },
          ].map((item) => (
            <div key={item.step} className="space-y-4">
              <span
                className="text-[#FFD93D] text-6xl font-bold"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {item.step}
              </span>
              <h3 className="text-2xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
                {item.title}
              </h3>
              <p className="text-black/50 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 py-32 px-5 sm:px-8 max-w-7xl mx-auto">
        <h2
          className="text-4xl md:text-5xl font-bold mb-16 text-center"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          What Nokta Does
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: "Autonomous Loops", desc: "Discovers work, plans, executes, verifies — runs 24/7 without prompts." },
            { title: "25 Specialist Agents", desc: "CEO, CTO, Security, Frontend, QA, DevOps — each with domain expertise." },
            { title: "Doubt-Driven Verification", desc: "Every claim is challenged. Every output is reviewed by an independent agent." },
            { title: "Persistent State", desc: "Company state, task logs, blockers — all persisted across sessions." },
            { title: "Source-Driven Development", desc: "Verifies claims from source code, never assumes. Evidence-based decisions." },
            { title: "Structured Task Packets", desc: "Each task is a structured packet with context, constraints, and acceptance criteria." },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-black/5 rounded-2xl p-6 hover:bg-black/10 transition-colors"
            >
              <h3 className="text-lg font-bold mb-2" style={{ fontFamily: "var(--font-heading)" }}>
                {feature.title}
              </h3>
              <p className="text-black/50 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="relative z-10 py-32 px-5 sm:px-8 max-w-7xl mx-auto bg-black/5 rounded-3xl mx-5 sm:mx-8 my-12">
        <h2
          className="text-4xl md:text-5xl font-bold mb-16 text-center"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          The Team
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-5xl mx-auto">
          {[
            { role: "Executive", agents: ["CEO", "Chief of Staff"] },
            { role: "Business", agents: ["Product", "Strategy", "Finance", "Growth"] },
            { role: "Engineering", agents: ["CTO", "Frontend", "Backend", "Database", "DevOps"] },
            { role: "Quality", agents: ["QA", "Security", "Reviewer"] },
            { role: "Support", agents: ["Tech Writer", "Archaeologist"] },
          ].map((group) => (
            <div key={group.role} className="space-y-3">
              <span className="text-xs text-[#FFD93D] font-medium uppercase tracking-wider">
                {group.role}
              </span>
              {group.agents.map((agent) => (
                <div key={agent} className="text-black/70 text-sm">
                  {agent}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 py-32 px-5 sm:px-8 max-w-7xl mx-auto">
        <h2
          className="text-4xl md:text-5xl font-bold mb-16 text-center"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Simple Pricing
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            { name: "Starter", price: "Free", desc: "1 project, 5 agents", featured: false },
            { name: "Pro", price: "29", desc: "Unlimited projects, all 25 agents", featured: true },
            { name: "Team", price: "99", desc: "Multi-user, shared state, priority support", featured: false },
          ].map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 text-center transition-all ${
                plan.featured
                  ? "bg-[#FFD93D] text-black scale-105"
                  : "bg-black/5 hover:bg-black/10"
              }`}
            >
              <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-heading)" }}>
                {plan.name}
              </h3>
              <div className="flex items-baseline justify-center gap-1 mb-4">
                <span className="text-5xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
                  {plan.price}
                </span>
                {plan.price !== "Free" && (
                  <span className="text-lg font-medium">USD</span>
                )}
                <span className={`text-sm ${plan.featured ? "text-black/60" : "text-black/40"}`}>
                  {plan.price !== "Free" ? "/month" : ""}
                </span>
              </div>
              <p className={`text-sm mb-6 ${plan.featured ? "text-black/70" : "text-black/50"}`}>
                {plan.desc}
              </p>
              <button
                className={`w-full py-3 rounded-full font-medium transition-colors ${
                  plan.featured
                    ? "bg-black text-white hover:bg-black/90"
                    : "bg-white text-black hover:bg-white/90 border border-black/10"
                }`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Get Started
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-16 px-5 sm:px-8 border-t border-black/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
              NOKTA
            </span>
            <span className="text-lg text-black/30">✳︎</span>
          </div>
          <p className="text-black/40 text-sm">
            © 2026 Nokta — Autonomous AI Company OS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

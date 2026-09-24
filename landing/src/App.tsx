import { useEffect, useState } from 'react';

/* ─────────────────────── Nokta Landing App ─────────────────────── */
export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const consoleUrl = import.meta.env.VITE_CONSOLE_URL || `${window.location.protocol}//${window.location.hostname}:4217`;
  const [copyError, setCopyError] = useState('');
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setMotionEnabled(!media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText('sales@nokta.ai');
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Could not copy. Email sales@nokta.ai directly.');
    }
  };

  return (
    <div className="relative min-h-screen bg-black text-white antialiased selection:bg-purple-500 selection:text-white font-sans">
      {/* ═══════ BACKGROUND VIDEO ═══════ */}
      <a href="#main-content" className="skip-link">Skip to content</a>
      {motionEnabled && <video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        className="fixed inset-0 w-full h-full object-cover pointer-events-none"
        style={{
          zIndex: 0,
          objectPosition: '70% center',
        }}
      >
        <source src="/assets/Robot_rotating_head_1080p_202608211526.mp4" type="video/mp4" />
      </video>}

      {/* Background overlay for contrast */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: 'linear-gradient(to right, rgba(7,7,13,0.92) 0%, rgba(7,7,13,0.7) 50%, rgba(7,7,13,0.4) 100%)',
        }}
      />

      {/* ═══════ NAVBAR ═══════ */}
      <nav
        className="fixed top-0 left-0 right-0 px-6 sm:px-10 py-5 flex justify-between items-center backdrop-blur-md bg-black/40 border-b border-white/10"
        style={{ zIndex: 20 }}
      >
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_12px_#a855f7]" />
          <span className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono">
            nokta<span className="text-purple-400">.ai</span>
          </span>
          <span className="hidden sm:inline-block text-[11px] font-mono tracking-widest text-purple-300 uppercase px-2 py-0.5 rounded border border-purple-500/30 bg-purple-500/10">
            AI Operating System
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
          <a href="#features" className="hover:text-white transition-colors">Platform</a>
          <a href="#architecture" className="hover:text-white transition-colors">Architecture</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href={`${consoleUrl}/api/v1/docs`} className="hover:text-white transition-colors" target="_blank" rel="noreferrer">API Docs</a>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <a
            href={consoleUrl}
            className="text-sm font-medium text-white px-4 py-2 rounded-full border border-purple-500/40 bg-purple-600/20 hover:bg-purple-600/40 hover:border-purple-400 transition-all shadow-[0_0_15px_rgba(168,85,247,0.2)]"
          >
            Launch Console →
          </a>
        </div>

        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className="md:hidden flex flex-col gap-1.5 z-30 cursor-pointer"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className={`block w-6 h-0.5 bg-white transition-transform ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-6 h-0.5 bg-white transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-6 h-0.5 bg-white transition-transform ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </nav>

      {/* ═══════ MOBILE MENU ═══════ */}
      <div
        id="mobile-menu"
        inert={!menuOpen}
        className={`fixed inset-0 bg-black/95 backdrop-blur-lg flex flex-col justify-center px-10 gap-8 transition-opacity duration-300 md:hidden ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ zIndex: 15 }}
      >
        {['Platform', 'Architecture', 'Pricing'].map((item) => (
          <a
            key={item}
            href={`#${item === 'Platform' ? 'features' : item.toLowerCase()}`}
            className="text-2xl font-bold text-white hover:text-purple-400"
            onClick={() => setMenuOpen(false)}
          >
            {item}
          </a>
        ))}
        <a href={`${consoleUrl}/api/v1/docs`} className="text-2xl font-bold text-white hover:text-purple-400" onClick={() => setMenuOpen(false)}>
          API Docs
        </a>
        <a
          href={consoleUrl}
          className="text-lg font-bold text-white text-center py-3 rounded-xl bg-purple-600 hover:bg-purple-500 transition-all mt-4"
          onClick={() => setMenuOpen(false)}
        >
          Launch Console
        </a>
      </div>

      {/* ═══════ HERO SECTION ═══════ */}
      <main id="main-content">
      <section className="min-h-dvh flex flex-col justify-center px-6 sm:px-12 md:px-20 pt-28 pb-16 relative z-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-mono mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Autonomous AI Company Operating System • v0.3.0
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.1] mb-6">
            Software engineering on <span className="text-purple-300">autopilot</span>.
          </h1>

          <p className="text-lg sm:text-xl text-gray-300 leading-relaxed min-h-[72px] mb-8 font-mono text-sm sm:text-base">
            Discover. Plan. Execute. Verify. Reconcile. Nokta runs an autonomous software company around your codebase without human prompting.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={consoleUrl}
              className="inline-flex items-center justify-center bg-purple-600 text-white font-medium text-sm px-6 py-3 rounded-full hover:bg-purple-500 transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)]"
            >
              Open Console →
            </a>

            <a
              href="#pricing"
              className="inline-flex items-center justify-center bg-white/10 text-white border border-white/20 text-sm px-5 py-3 rounded-full hover:bg-white/20 transition-all backdrop-blur-sm"
            >
              Compare Plans
            </a>

            <button
              type="button"
              onClick={copyEmail}
              className="inline-flex items-center text-sm text-gray-300 border border-white/20 rounded-full px-5 py-3 hover:border-white/40 hover:text-white transition-all gap-2 backdrop-blur-sm"
            >
              Enterprise Sales:
              <span className="text-purple-300 underline font-mono">sales@nokta.ai</span>
              {copied ? (
                <span className="text-xs text-emerald-400 font-mono font-bold">✓ COPIED</span>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
          <p role="status" className="mt-3 text-sm text-purple-200">{copyError || (copied ? 'Email copied.' : '')}</p>
        </div>
      </section>

      {/* ═══════ CORE FEATURES ═══════ */}
      <section className="relative z-10 py-24 px-6 sm:px-12 md:px-20 bg-black/80 backdrop-blur-xl border-t border-white/10" id="features">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-xs uppercase tracking-widest text-purple-400 font-mono mb-2">Capabilities</h2>
            <h3 className="text-3xl sm:text-4xl font-bold tracking-tight">Built for Production Scale</h3>
            <p className="text-gray-400 mt-3 max-w-xl mx-auto text-sm sm:text-base">
              A comprehensive architecture that transforms raw LLM capabilities into an institutional software engineering organization.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-purple-500/50 transition-all">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold mb-4">
                🔄
              </div>
              <h4 className="text-lg font-bold mb-2">Autonomous Loop</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Discover → Plan → Execute → Verify → Persist. Runs without continuous human oversight, resolving defects and shipping features end-to-end.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-purple-500/50 transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold mb-4">
                ⚖️
              </div>
              <h4 className="text-lg font-bold mb-2">Separation of Duties</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Adversarial multi-model certification. No single model authors and independently certifies its own code changes.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-purple-500/50 transition-all">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold mb-4">
                🧠
              </div>
              <h4 className="text-lg font-bold mb-2">Context Compiler</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Deterministic token compaction and semantic code search. Guarantees maximum context efficiency without model hallucination.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-purple-500/50 transition-all">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold mb-4">
                🛡️
              </div>
              <h4 className="text-lg font-bold mb-2">Enterprise Trail</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Cryptographic audit trails, GateKeeper prompt injection defense, sandbox isolation, and strictly enforced monthly token budgets.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="architecture" className="relative z-10 bg-black/90 border-t border-white/10 px-6 sm:px-12 md:px-20 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">From repository to verified work</h2>
          <p className="mt-4 max-w-2xl text-gray-300 leading-relaxed">Nokta coordinates specialist agents through a persistent work loop. Each stage gives the next agent the context it needs.</p>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Discover', 'Read the project and identify useful, unblocked work.'],
              ['Plan & execute', 'Create task packets and route work to specialist agents.'],
              ['Verify & review', 'Use a different model to independently examine the result.'],
              ['Document & persist', 'Save decisions, results, and blockers for the next cycle.'],
            ].map(([title, description], index) => (
              <li key={title} className="border-t border-white/20 pt-5">
                <span className="font-mono text-sm text-purple-300">0{index + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-300">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ═══════ PRICING SECTION ═══════ */}
      <section className="relative z-10 py-24 px-6 sm:px-12 md:px-20 bg-black/90 border-t border-white/10" id="pricing">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-xs uppercase tracking-widest text-purple-400 font-mono mb-2">Commercial Tiers</h2>
            <h3 className="text-3xl sm:text-4xl font-bold tracking-tight">Predictable, Transparent Pricing</h3>
            <p className="text-gray-400 mt-3 max-w-xl mx-auto text-sm sm:text-base">
              Deploy Nokta across single repositories or global enterprise development organizations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Free Plan */}
            <div className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
              <div>
                <h4 className="text-xl font-bold text-white">Free</h4>
                <p className="text-xs text-gray-400 mt-1">For open source & exploration</p>
                <div className="my-6">
                  <span className="text-4xl font-extrabold">$0</span>
                  <span className="text-gray-400 text-sm"> / month</span>
                </div>
                <ul className="space-y-3 text-sm text-gray-300">
                  <li className="flex items-center gap-2">✓ 30 requests / min</li>
                  <li className="flex items-center gap-2">✓ 100,000 tokens / day</li>
                  <li className="flex items-center gap-2">✓ 1 active project</li>
                  <li className="flex items-center gap-2">✓ 3 autonomous agents</li>
                  <li className="flex items-center gap-2">✓ Local SQLite & file watcher</li>
                </ul>
              </div>
              <a
                href={consoleUrl}
                className="mt-8 block text-center py-2.5 px-4 rounded-xl border border-white/20 hover:bg-white hover:text-black font-medium text-sm transition-all"
              >
                Get Started Free
              </a>
            </div>

            {/* Pro Plan */}
            <div className="p-8 rounded-2xl bg-purple-950/20 border-2 border-purple-500 flex flex-col justify-between relative shadow-[0_0_30px_rgba(168,85,247,0.15)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-purple-500 text-xs font-bold uppercase tracking-wider text-white">
                Most Popular
              </div>
              <div>
                <h4 className="text-xl font-bold text-white">Pro</h4>
                <p className="text-xs text-purple-300 mt-1">For professional developers & startups</p>
                <div className="my-6">
                  <span className="text-4xl font-extrabold">$29</span>
                  <span className="text-gray-400 text-sm"> / month</span>
                </div>
                <ul className="space-y-3 text-sm text-gray-200">
                  <li className="flex items-center gap-2">✓ 300 requests / min</li>
                  <li className="flex items-center gap-2">✓ 1,000,000 tokens / day</li>
                  <li className="flex items-center gap-2">✓ 10 registered projects</li>
                  <li className="flex items-center gap-2">✓ 50 specialized agents</li>
                  <li className="flex items-center gap-2">✓ Automated Adversarial Review</li>
                  <li className="flex items-center gap-2">✓ UI/UX Pro Max synthesis</li>
                </ul>
              </div>
              <a
                href={`${consoleUrl}/settings.html`}
                className="mt-8 block text-center py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition-all shadow-lg"
              >
                Upgrade to Pro
              </a>
            </div>

            {/* Enterprise Plan */}
            <div className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
              <div>
                <h4 className="text-xl font-bold text-white">Enterprise</h4>
                <p className="text-xs text-gray-400 mt-1">For organizations requiring high throughput</p>
                <div className="my-6">
                  <span className="text-4xl font-extrabold">$99</span>
                  <span className="text-gray-400 text-sm"> / month</span>
                </div>
                <ul className="space-y-3 text-sm text-gray-300">
                  <li className="flex items-center gap-2">✓ 1,000 requests / min</li>
                  <li className="flex items-center gap-2">✓ 5,000,000 tokens / day</li>
                  <li className="flex items-center gap-2">✓ Unlimited projects & agents</li>
                  <li className="flex items-center gap-2">✓ Custom model routing</li>
                  <li className="flex items-center gap-2">✓ Dedicated org trust charts</li>
                  <li className="flex items-center gap-2">✓ Admin Control Plane & SLA</li>
                </ul>
              </div>
              <a
                href={`${consoleUrl}/settings.html`}
                className="mt-8 block text-center py-2.5 px-4 rounded-xl border border-white/20 hover:bg-white hover:text-black font-medium text-sm transition-all"
              >
                Contact Enterprise
              </a>
            </div>
          </div>
        </div>
      </section>

      </main>
      {/* ═══════ FOOTER ═══════ */}
      <footer className="relative z-10 py-10 px-6 sm:px-12 md:px-20 bg-black border-t border-white/10 flex flex-col sm:flex-row justify-between items-center text-xs text-gray-500 font-mono gap-4">
        <div>© {new Date().getFullYear()} NOKTA AI OPERATING SYSTEM • ALL RIGHTS RESERVED</div>
        <div className="flex flex-wrap justify-center gap-6">
          <a href="#features" className="hover:text-white transition-colors">PLATFORM</a>
          <a href="#architecture" className="hover:text-white transition-colors">ARCHITECTURE</a>
          <a href="#pricing" className="hover:text-white transition-colors">PRICING</a>
          <a href={`${consoleUrl}/api/v1/docs`} className="hover:text-white transition-colors" target="_blank" rel="noreferrer">API DOCS</a>
          <a href={consoleUrl} className="hover:text-white transition-colors">CONSOLE</a>
        </div>
      </footer>
    </div>
  );
}

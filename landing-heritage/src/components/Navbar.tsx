import { useState } from "react";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-10 px-5 sm:px-8 py-4 sm:py-5 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <span
            className="text-[21px] sm:text-[26px] tracking-tight text-black"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            NOKTA
          </span>
          <span className="text-[25px] sm:text-[30px] text-black select-none" style={{ letterSpacing: "-0.02em" }}>
            ✳︎
          </span>
        </div>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center text-[23px] text-black gap-0">
          <a href="#features" className="hover:opacity-60 transition-opacity">Labs</a>
          <span className="mx-2 opacity-40">,</span>
          <a href="#how" className="hover:opacity-60 transition-opacity">Studio</a>
          <span className="mx-2 opacity-40">,</span>
          <a href="#agents" className="hover:opacity-60 transition-opacity">Openings</a>
          <span className="mx-2 opacity-40">,</span>
          <a href="#pricing" className="hover:opacity-60 transition-opacity">Shop</a>
        </div>

        {/* Desktop CTA */}
        <a
          href="#pricing"
          className="hidden md:block text-[23px] text-black underline underline-offset-2 hover:opacity-60 transition-opacity"
        >
          Get in touch
        </a>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col gap-[5px] p-2"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
        >
          <span
            className={`w-6 h-[2px] bg-black transition-all duration-300 ${
              isOpen ? "translate-y-[7px] rotate-45" : ""
            }`}
          />
          <span
            className={`w-6 h-[2px] bg-black transition-all duration-300 ${
              isOpen ? "opacity-0" : ""
            }`}
          />
          <span
            className={`w-6 h-[2px] bg-black transition-all duration-300 ${
              isOpen ? "-translate-y-[7px] -rotate-45" : ""
            }`}
          />
        </button>
      </nav>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-9 bg-white/95 backdrop-blur-sm flex flex-col items-start justify-center px-8 gap-8 transition-opacity duration-300 md:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <a href="#features" className="text-[32px] font-medium text-black" onClick={() => setIsOpen(false)}>
          Labs
        </a>
        <a href="#how" className="text-[32px] font-medium text-black" onClick={() => setIsOpen(false)}>
          Studio
        </a>
        <a href="#agents" className="text-[32px] font-medium text-black" onClick={() => setIsOpen(false)}>
          Openings
        </a>
        <a href="#pricing" className="text-[32px] font-medium text-black" onClick={() => setIsOpen(false)}>
          Shop
        </a>
        <a href="#pricing" className="text-[32px] font-medium text-black underline" onClick={() => setIsOpen(false)}>
          Get in touch
        </a>
      </div>
    </>
  );
}

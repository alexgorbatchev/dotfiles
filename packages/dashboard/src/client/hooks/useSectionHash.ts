import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { readHash, writeHash } from "../utils/urlState";

export function useSectionHash(sectionIds: readonly string[], enabled = true) {
  const [activeSection, setActiveSection] = useState(sectionIds[0] ?? "");
  const anchoredScrollRef = useRef<number | null>(null);

  const revealSection = useCallback((id: string): void => {
    const section = document.getElementById(id);
    if (!section) return;
    if (section instanceof HTMLDetailsElement) section.open = true;
    section.scrollIntoView({ block: "start" });
    anchoredScrollRef.current = window.scrollY;
    setActiveSection(id);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    const firstSection = sections[0];
    if (!firstSection) return;
    const startingSection = firstSection;
    let animationFrame = 0;

    function restoreHash(): void {
      const hash = readHash();
      if (sections.some((section) => section.id === hash)) revealSection(hash);
      else setActiveSection(startingSection.id);
    }

    function syncHashToScrollPosition(): void {
      animationFrame = 0;
      // A chosen anchor near the bottom cannot always reach the viewport's top.
      // Keep it selected until the user actually moves away.
      if (anchoredScrollRef.current === window.scrollY) return;
      anchoredScrollRef.current = null;
      let currentSection = startingSection;
      for (const section of sections) {
        if (section.getBoundingClientRect().top > 120) break;
        currentSection = section;
      }
      setActiveSection(currentSection.id);
      writeHash(currentSection === firstSection ? "" : currentSection.id);
    }

    function scheduleHashSync(): void {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(syncHashToScrollPosition);
    }

    restoreHash();
    window.addEventListener("hashchange", restoreHash);
    window.addEventListener("popstate", restoreHash);
    window.addEventListener("scroll", scheduleHashSync, { passive: true });
    window.addEventListener("resize", scheduleHashSync);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("hashchange", restoreHash);
      window.removeEventListener("popstate", restoreHash);
      window.removeEventListener("scroll", scheduleHashSync);
      window.removeEventListener("resize", scheduleHashSync);
    };
  }, [enabled, sectionIds, revealSection]);

  return { activeSection, revealSection };
}

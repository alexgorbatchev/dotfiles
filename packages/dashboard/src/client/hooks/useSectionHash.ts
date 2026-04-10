import { useEffect } from "preact/hooks";

import { readHash, writeHash } from "./urlState";

export function useSectionHash(sectionIds: readonly string[], enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const sections = sectionIds
      .map((sectionId) => document.getElementById(sectionId))
      .filter((section): section is HTMLElement => section !== null);

    if (sections.length === 0) {
      return;
    }

    const currentHash = readHash();
    const hashTarget = currentHash ? sections.find((section) => section.id === currentHash) : null;
    const firstSection = sections[0];
    if (!firstSection) {
      return;
    }

    let animationFrame = 0;

    const syncHashToScrollPosition = () => {
      animationFrame = 0;

      let currentSection = firstSection;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= 120) {
          currentSection = section;
          continue;
        }

        break;
      }

      writeHash(currentSection === firstSection ? "" : currentSection.id);
    };

    const scheduleHashSync = () => {
      if (animationFrame !== 0) {
        return;
      }

      animationFrame = window.requestAnimationFrame(syncHashToScrollPosition);
    };

    const restoreTimeout = window.setTimeout(() => {
      if (hashTarget) {
        hashTarget.scrollIntoView({ block: "start" });
      }

      scheduleHashSync();
    }, 0);

    window.addEventListener("scroll", scheduleHashSync, { passive: true });
    window.addEventListener("resize", scheduleHashSync);

    return () => {
      window.clearTimeout(restoreTimeout);
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("scroll", scheduleHashSync);
      window.removeEventListener("resize", scheduleHashSync);
    };
  }, [enabled, sectionIds]);
}

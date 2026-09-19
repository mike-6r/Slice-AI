import { useEffect, useRef, useState } from "react";
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** One passive, frame-bounded listener for the whole story; no scroll hijacking. */
export function useHomeMotion() {
  const ref = useRef<HTMLDivElement>(null);
  const [activeChapter, setActiveChapter] = useState("v2-hero-scene");
  const [journeyStep, setJourneyStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [scrollJourneyEnabled, setScrollJourneyEnabled] = useState(false);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 1100px) and (min-height: 800px)");
    const scenes = Array.from(root.querySelectorAll<HTMLElement>("[data-home-scene]"));
    const journeyContent = root.querySelector<HTMLElement>(".sh-journey__sticky");
    let frame = 0;
    let active = "";
    let step = -1;
    let largestJourneyHeight = 0;
    const update = () => {
      frame = 0;
      const viewport = window.innerHeight;
      // Keep a high-water mark until resize so stage copy cannot repeatedly
      // enable/disable pinning when the viewport is close to the fit threshold.
      largestJourneyHeight = Math.max(largestJourneyHeight, journeyContent?.offsetHeight ?? 0);
      // Pin only when the complete panel fits below both navigation bars.
      const canPin =
        !motion.matches &&
        wide.matches &&
        !!journeyContent &&
        largestJourneyHeight + 194 <= viewport;
      root.dataset.scrollJourney = canPin ? "on" : "off";
      setScrollJourneyEnabled((current) => (current === canPin ? current : canPin));
      const bounds = root.getBoundingClientRect();
      root.style.setProperty(
        "--story-progress",
        String(clamp(-bounds.top / Math.max(1, bounds.height - viewport))),
      );
      let current = scenes[0]?.id ?? "v2-hero-scene";
      for (const scene of scenes) {
        const rect = scene.getBoundingClientRect();
        if (rect.top < viewport * 0.42) current = scene.id;
        if (rect.top < viewport * 0.94) scene.classList.add("is-revealed");
        if (rect.bottom >= 0 && rect.top <= viewport) {
          scene.style.setProperty(
            "--scene-progress",
            String(motion.matches ? 0 : clamp((viewport - rect.top) / (viewport + rect.height))),
          );
        }
        if (scene.id === "v2-lifecycle-scene") {
          const nextStep = canPin
            ? Math.min(
                5,
                Math.floor(clamp((180 - rect.top) / Math.max(1, rect.height - viewport + 180)) * 6),
              )
            : !motion.matches && wide.matches
              ? Math.max(0, step)
              : 0;
          if (nextStep !== step) {
            step = nextStep;
            setJourneyStep(step);
          }
        }
      }
      if (current !== active) {
        active = current;
        setActiveChapter(current);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const syncMotion = () => {
      root.dataset.motion = motion.matches ? "off" : "on";
      setReducedMotion(motion.matches);
      schedule();
    };
    const resized = () => {
      largestJourneyHeight = 0;
      schedule();
    };
    syncMotion();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resized, { passive: true });
    motion.addEventListener("change", syncMotion);
    wide.addEventListener("change", schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    if (journeyContent) resize.observe(journeyContent);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resized);
      motion.removeEventListener("change", syncMotion);
      wide.removeEventListener("change", schedule);
      resize.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);
  return { ref, activeChapter, journeyStep, reducedMotion, scrollJourneyEnabled };
}

export function useCardTilt() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const card = ref.current;
    if (!card) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)");
    let frame = 0;
    const reset = () => {
      window.cancelAnimationFrame(frame);
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
    };
    const move = (event: PointerEvent) => {
      if (motion.matches || !fine.matches) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty(
          "--tilt-x",
          ((event.clientY - rect.top) / rect.height - 0.5) * -8 + "deg",
        );
        card.style.setProperty(
          "--tilt-y",
          ((event.clientX - rect.left) / rect.width - 0.5) * 12 + "deg",
        );
      });
    };
    card.addEventListener("pointermove", move, { passive: true });
    card.addEventListener("pointerleave", reset);
    motion.addEventListener("change", reset);
    return () => {
      window.cancelAnimationFrame(frame);
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerleave", reset);
      motion.removeEventListener("change", reset);
    };
  }, []);
  return ref;
}

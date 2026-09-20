import { useEffect, useRef, useState } from "react";
const clamp = (value: number) => Math.min(1, Math.max(0, value));
export const JOURNEY_STAGE_MS = 4800;

/** Intersection starts a complete animation. Scroll position only tracks navigation. */
export function useHomeMotion() {
  const ref = useRef<HTMLDivElement>(null);
  const [activeChapter, setActiveChapter] = useState("v2-hero-scene");
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scenes = Array.from(root.querySelectorAll<HTMLElement>("[data-home-scene]"));
    const reveals = Array.from(root.querySelectorAll<HTMLElement>("[data-home-reveal]"));
    let frame = 0;
    let active = "";
    const updateNavigation = () => {
      frame = 0;
      const viewport = window.innerHeight;
      const bounds = root.getBoundingClientRect();
      root.style.setProperty(
        "--story-progress",
        String(clamp(-bounds.top / Math.max(1, bounds.height - viewport))),
      );
      let current = scenes[0]?.id ?? "v2-hero-scene";
      for (const scene of scenes) {
        if (scene.getBoundingClientRect().top < viewport * 0.42) current = scene.id;
      }
      if (current !== active) {
        active = current;
        setActiveChapter(current);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(updateNavigation);
    };
    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                entry.target.classList.add("is-revealed");
                observer?.unobserve(entry.target);
              }
            },
            { threshold: 0.08, rootMargin: "0px 0px -48px 0px" },
          )
        : null;
    const syncMotion = () => {
      root.dataset.motion = motion.matches ? "off" : "on";
      setReducedMotion(motion.matches);
      if (motion.matches || !observer)
        reveals.forEach((element) => element.classList.add("is-revealed"));
      schedule();
    };
    reveals.forEach((element) => observer?.observe(element));
    syncMotion();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    motion.addEventListener("change", syncMotion);
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", syncMotion);
      observer?.disconnect();
      resize.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);
  return { ref, activeChapter, reducedMotion };
}

/** A finite, visible-only tour. Manual interaction pauses it; reduced motion disables autoplay. */
export function useJourneyPlayback(stageCount: number, reducedMotion: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [inView, setInView] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [manualStage, setManualStage] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              setInView(!!entry?.isIntersecting && entry.intersectionRatio >= 0.15);
            },
            { threshold: [0, 0.15], rootMargin: "-140px 0px -32px 0px" },
          )
        : null;
    observer?.observe(element);
    if (!observer) setInView(true);
    const sync = () => setDocumentVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const complete = index === stageCount - 1;
  const running = inView && documentVisible && !paused && !reducedMotion && !complete;
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(
      () => setIndex((current) => Math.min(current + 1, stageCount - 1)),
      JOURNEY_STAGE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [index, running, stageCount]);
  const select = (stage: number) => {
    const next = Math.min(stageCount - 1, Math.max(0, stage));
    setPaused(true);
    setIndex(next);
    setManualStage(next);
  };
  const toggle = () => {
    setManualStage(null);
    if (complete) {
      setIndex(0);
      setPaused(false);
    } else setPaused((current) => !current);
  };
  return {
    ref,
    index,
    paused,
    complete,
    running,
    manualStage,
    select,
    toggle,
    pause: () => setPaused(true),
  };
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

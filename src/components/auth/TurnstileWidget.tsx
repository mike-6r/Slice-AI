import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          theme: "dark";
          action: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

type Props = {
  siteKey: string;
  resetKey: number;
  onToken: (token: string) => void;
  onUnavailable: () => void;
};

/** Public-site-key-only Turnstile widget. Server-side Siteverify remains decisive. */
export function TurnstileWidget({ siteKey, resetKey, onToken, onUnavailable }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    const render = () => {
      if (disposed || !host.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(host.current, {
        sitekey: siteKey,
        theme: "dark",
        action: "signup",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => {
          onToken("");
          onUnavailable();
        },
      });
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-slice-turnstile]");
    if (window.turnstile) render();
    else if (existing) existing.addEventListener("load", render, { once: true });
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.sliceTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", onUnavailable, { once: true });
      document.head.append(script);
    }
    return () => {
      disposed = true;
    };
  }, [onToken, onUnavailable, siteKey]);

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [resetKey]);

  return <div className="turnstile-widget" ref={host} aria-label="Signup verification" />;
}

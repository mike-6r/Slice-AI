import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import "@/styles/admin-record-drawer.css";

/**
 * The shared admin record workspace. Every operational workspace keeps the
 * selected record in the URL, then opens its authoritative detail in a focused
 * workspace rather than squeezing a complex operational surface into a drawer.
 */
export function AdminRecordDrawer({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const headingId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="admin-record-drawer-layer" role="presentation">
      <aside
        className={`admin-record-drawer${wide ? " admin-record-drawer--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className="admin-record-drawer__header">
          <div>
            <p>Admin workspace · authoritative record</p>
            <h2 id={headingId}>{title}</h2>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="admin-record-drawer__close"
            onClick={onClose}
          >
            <X aria-hidden="true" /> <span>Close workspace</span>
          </button>
        </header>
        <div className="admin-record-drawer__body">{children}</div>
      </aside>
    </div>
  );
}

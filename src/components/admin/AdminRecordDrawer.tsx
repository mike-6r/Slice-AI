import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

import "@/styles/admin-record-drawer.css";

/**
 * The shared admin record container.  Every operational workspace keeps the
 * selected record in the URL, then presents its authoritative detail here so
 * an operator never has to leave the destination that owns the work.
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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="admin-record-drawer-layer" role="presentation">
      <button
        type="button"
        className="admin-record-drawer-scrim"
        aria-label="Close record"
        onClick={onClose}
      />
      <aside
        className={`admin-record-drawer${wide ? " admin-record-drawer--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="admin-record-drawer__header">
          <div>
            <p>Authoritative record</p>
            <h2>{title}</h2>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          <button type="button" className="admin-record-drawer__close" onClick={onClose}>
            <X aria-hidden="true" /> <span className="sr-only">Close record</span>
          </button>
        </header>
        <div className="admin-record-drawer__body">{children}</div>
      </aside>
    </div>
  );
}

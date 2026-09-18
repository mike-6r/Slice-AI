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
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      // A nested confirmation owns its own keyboard interaction.
      const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key === "Tab") {
        const controls = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0 && !element.closest("[inert]"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || !dialog.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !dialog.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className="slice-admin admin-record-drawer-layer"
      data-admin-theme="slice"
      role="presentation"
    >
      <aside
        ref={dialogRef}
        className={`admin-record-drawer${wide ? " admin-record-drawer--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={subtitle ? descriptionId : undefined}
      >
        <header className="admin-record-drawer__header">
          <div>
            <p>Slice console / Record workspace</p>
            <h2 id={headingId}>{title}</h2>
            {subtitle ? <span id={descriptionId}>{subtitle}</span> : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="admin-record-drawer__close"
            aria-label="Close workspace"
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

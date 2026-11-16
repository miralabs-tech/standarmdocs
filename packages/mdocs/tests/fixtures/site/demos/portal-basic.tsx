import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function PortalBasic(): ReactNode {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    surface.current?.focus();
    const close = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      <button ref={trigger} type="button" aria-expanded={open} onClick={() => setOpen(true)}>
        Open note
      </button>
      {open
        ? createPortal(
            <div ref={surface} role="note" tabIndex={-1} data-surface="note">
              A note, portalled out of the island.
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

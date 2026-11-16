import type { ReactNode } from "react";
import { useId, useState } from "react";

interface DisclosureProps {
  readonly label: string;
  readonly children: ReactNode;
}

function Disclosure({ label, children }: DisclosureProps): ReactNode {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open ? <p id={panel}>{children}</p> : null}
    </div>
  );
}

export function DisclosureBasic(): ReactNode {
  return (
    <>
      <Disclosure label="Show details">The details are here.</Disclosure>
      <Disclosure label="Just a title">Nothing more to say.</Disclosure>
      <Disclosure label="Delete project">This removes every file. There is no undo.</Disclosure>
    </>
  );
}

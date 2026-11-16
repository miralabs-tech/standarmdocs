import type { ReactNode } from "react";
import { withBase } from "../../core/base";
import type { SeeAlsoLink } from "../../core/model";
import { useLabels } from "../labels-context";

export function SeeAlso({
  links,
  base = "/",
}: {
  readonly links: readonly SeeAlsoLink[];
  readonly base?: string;
}): ReactNode {
  const labels = useLabels();
  return (
    <section className="mira-docs__see-also" aria-labelledby="mira-see-also">
      <h2 id="mira-see-also">{labels.seeAlso}</h2>
      <ul>
        {links.map((link) => (
          <li key={link.route}>
            <a href={withBase(base, link.route)}>{link.title}</a>
            {link.description === undefined || link.description === "" ? null : (
              <p>{link.description}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { ReactNode } from "react";
import { withBase } from "../../core/base";
import type { SeeAlsoLink } from "../../core/model";

export function SeeAlso({
  links,
  base = "/",
}: {
  readonly links: readonly SeeAlsoLink[];
  readonly base?: string;
}): ReactNode {
  return (
    <section className="mira-docs__see-also" aria-labelledby="mira-see-also">
      <h2 id="mira-see-also">See also</h2>
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

import type { ReactNode } from "react";
import { ASK_ISLAND, askIslandValue } from "../../core/ask-protocol";
import type { AskBlock } from "../../core/content/ask";

/**
 * What an ```ask fence becomes: the question and its answer as static, read-only
 * HTML.
 *
 * Nothing here is interactive — the answer is rewritten in the Markdown file and
 * the page is rebuilt, so what a reader sees is always what the file says. When
 * the scan located the fence (`file` and `hash`), the section also carries its
 * props for an island to take over; the markup stays what a reader gets without
 * one. The chosen options carry `data-chosen` and `aria-current` and not only a
 * colour, and the state is spelled out, for the same reason the tab strip is real
 * buttons: the page has to be true with no stylesheet.
 */
export function AskFence({
  block,
  file,
  hash,
}: {
  readonly block: AskBlock;
  readonly file: string | undefined;
  readonly hash: string | undefined;
}): ReactNode {
  const shown = block.kind === "yesno" ? ["yes", "no"] : block.options;
  const chosen = new Set(
    typeof block.answer === "string" ? [block.answer] : (block.answer ?? []),
  );

  return (
    <section
      className="mira-ask"
      data-ask-id={block.id}
      data-ask-state={block.answered ? "answered" : "pending"}
      {...(file === undefined || hash === undefined
        ? {}
        : { [ASK_ISLAND]: askIslandValue({ block, file, hash }) })}
    >
      <p className="mira-ask__state">{block.answered ? "Answered" : "Pending"}</p>
      <p className="mira-ask__question">{block.question}</p>
      {shown.length === 0 ? null : (
        <ul className="mira-ask__options">
          {shown.map((option) => (
            <li
              key={option}
              {...(chosen.has(option) ? { "data-chosen": "true", "aria-current": "true" } : {})}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
      {block.kind === "text" && typeof block.answer === "string" && block.answer !== "" ? (
        <p className="mira-ask__text">{block.answer}</p>
      ) : null}
      {block.comment === undefined || block.comment === "" ? null : (
        <p className="mira-ask__comment">{block.comment}</p>
      )}
    </section>
  );
}

import type { ComponentType, ReactNode } from "react";
import type { ApiTables, PageModel, Segment } from "../core/model";
import { type ChromeProps, NavBar, StaticChrome } from "./chrome";
import { AskFence } from "./fences/ask";
import { DemoFence } from "./fences/demo";
import { HomeFence } from "./fences/home";
import { IndexFence } from "./fences/index-fence";
import { PropsTable } from "./fences/props-table";
import { SeeAlso } from "./fences/see-also";
import { TabsFence } from "./fences/tabs";
import { TocFold, TocRail } from "./fences/toc";
import { islandSlot } from "./island";

export interface PageProps {
  readonly model: PageModel;
  readonly chrome: ChromeProps;
  readonly demos: Readonly<Record<string, ComponentType>>;
  readonly api: ApiTables;
  /** Slot → the island's own prerendered HTML. Absent renders islands inline instead. */
  readonly islands?: Readonly<Record<string, string>>;
  /** Demo id → that demo's own file, coloured at build time. */
  readonly sources?: Readonly<Record<string, string>>;
}

export function Page({ model, chrome, demos, api, islands, sources }: PageProps): ReactNode {
  // Named and recursive rather than inlined, because a tab panel holds segments
  // and not HTML: the ```props fence at the end of a component page has to
  // render inside its panel, through the same branch that renders it outside one.
  const renderSegments = (segments: readonly Segment[]): ReactNode =>
    segments.map((segment, index) => {
      if (segment.kind === "html") {
        return (
          <div
            // The segments of one article, in order and never reordered, so the
            // index is the identity here.
            // biome-ignore lint/suspicious/noArrayIndexKey: the article's own order is the key
            key={index}
            className="mira-docs__prose"
            // Safe because the article is NOT an island: nothing re-parses this
            // on the client, so there is no boundary for whitespace
            // normalisation to disagree across. Make the article an island and
            // every paragraph becomes a hydration mismatch.
            // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendered here, never a string from outside
            dangerouslySetInnerHTML={{ __html: segment.html }}
          />
        );
      }
      if (segment.kind === "demo") {
        const component = demos[segment.id];
        return component === undefined ? null : (
          <DemoFence
            key={islandSlot(segment.id, index)}
            id={segment.id}
            component={component}
            matrix={segment.matrix}
            islands={islands}
            source={sources?.[segment.id]}
          />
        );
      }
      if (segment.kind === "index") {
        return (
          <IndexFence
            key={`index:${segment.group}`}
            group={segment.group}
            entries={chrome.entries}
            base={chrome.base ?? "/"}
          />
        );
      }
      if (segment.kind === "home") return <HomeFence key="home" chrome={chrome} />;
      if (segment.kind === "ask") {
        return (
          <AskFence
            key={`ask:${segment.block.id}`}
            block={segment.block}
            file={segment.file}
            hash={segment.hash}
          />
        );
      }
      if (segment.kind === "tabs") {
        return (
          <TabsFence
            key={`tabs:${segment.tabs.map((tab) => tab.slug).join(",")}`}
            tabs={segment.tabs}
            render={renderSegments}
          />
        );
      }
      const tables = api[segment.name];
      return tables === undefined
        ? null
        : tables.map((table) => <PropsTable key={table.name} table={table} />);
    });

  const toc = model.toc.length >= 2 ? model.toc : null;

  return (
    <div className={toc === null ? "mira-docs" : "mira-docs mira-docs--toc"}>
      <NavBar siteName={chrome.siteName} />
      <StaticChrome {...chrome} />
      <main className="mira-docs__main">
        <h1>{model.title}</h1>
        {toc === null ? null : <TocFold toc={toc} />}
        {renderSegments(model.segments)}
        {model.seeAlso === undefined || model.seeAlso.length === 0 ? null : (
          <SeeAlso links={model.seeAlso} base={chrome.base ?? "/"} />
        )}
      </main>
      {toc === null ? null : <TocRail toc={toc} />}
    </div>
  );
}

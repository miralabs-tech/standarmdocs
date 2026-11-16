/**
 * The build-time entry point, and only that.
 *
 * It reaches `node:fs` through the content scan and `react-dom/static` through
 * the prerenderer, so importing this barrel from anything that runs in a browser
 * fails — loudly in a test, and silently expensive in a bundle, which is how 555
 * kB of prerenderer once reached a reader.
 *
 * Anything the client needs has its own subpath: `@standarx/mdocs/react/hydrate`,
 * `@standarx/mdocs/react/registry`, `@standarx/mdocs/ask`,
 * `@standarx/mdocs/search` and `@standarx/mdocs/sidebar`. None of them imports
 * anything but React, or nothing at all.
 */
export { BASE_ATTRIBUTE, normalizeBase, rootedHref, stripBase, withBase } from "./core/base";
export {
  type Axes,
  AXIS_CONTROLS,
  AXIS_READY,
  type AxisControl,
  axisAttributes,
  axisBootScript,
  axisControlsFor,
  axisKey,
  axisStorageKey,
  DEFAULT_MATRIX,
  MIRALABS_MATRIX,
} from "./core/axes";
export {
  type AskBlock,
  type AskEntry,
  type AskKind,
  type AskUpdate,
  askIndex,
  AskWriteError,
  type AskWriteCode,
  parseAsk,
  writeAnswer,
} from "./core/content/ask";
export {
  ASK_ANSWER_EVENT,
  ASK_ENDPOINT,
  ASK_ISLAND,
  ASK_WRITE_FLAG,
  type AskAnswerDetail,
  type AskIslandProps,
  askIslandValue,
  readAskIsland,
} from "./core/ask-protocol";
export { type Directive, parseDirective, toSegment } from "./core/content/fences";
export { createHighlight, type HighlightHandle } from "./core/content/highlight";
export {
  apiTableMarkdown,
  llmsFull,
  type LlmsEntry,
  type LlmsPlacement,
  type LlmsSite,
  llmsTxt,
  pageHref,
  pageMarkdown,
  type PageMarkdownContext,
} from "./core/content/llms";
export { type Frontmatter, parseFrontmatter } from "./core/content/frontmatter";
export { resolveRelated } from "./core/content/related";
export { type Highlight, type ParsePageOptions, parsePage } from "./core/content/markdown";
export {
  type ContentRoot,
  PRIVATE_DIR,
  rootFile,
  type ScanOptions,
  scanContent,
} from "./core/content/scan";
export {
  groupTabs,
  type Section,
  TAB,
  TAB_PANEL,
  TABS_BOOT_BODY,
  TABS_READY,
  TABS_STORAGE_KEY,
  tabButtonId,
  tabRun,
  tabsBootScript,
  tabSlug,
} from "./core/content/tabs";
export {
  assignHeadingIds,
  githubSlug,
  type HeadingSlugs,
  headingSlug,
  headingText,
  TOC,
} from "./core/content/toc";
export {
  type ApiRow,
  type ApiTable,
  type ApiTables,
  demoIds,
  type PageModel,
  type PageOrigin,
  type Segment,
  type SeeAlsoLink,
  type TabPanel,
  type TocEntry,
  withoutAsks,
} from "./core/model";
export {
  SEARCH_INDEX_FILE,
  type SearchDocument,
  type SearchIndex,
  searchIndex,
  type SearchOptions,
} from "./core/search";
export { escapeAttribute, shell, type ShellOptions } from "./core/shell";
export {
  SIDEBAR_BOOT_BODY,
  SIDEBAR_CATEGORY,
  SIDEBAR_CLOSED_KEY,
  SIDEBAR_SCROLL_KEY,
  sidebarBootScript,
} from "./core/sidebar";
export {
  type ChromeCategory,
  type ChromeEntry,
  type ChromeProps,
  placeEntries,
  StaticChrome,
} from "./react/chrome";
export { hydrateIslands, type HydratedIsland } from "./react/hydrate";
export {
  ISLAND_ID,
  ISLAND_INSTANCE,
  Island,
  islandPrefix,
  type IslandProps,
  islandSlot,
} from "./react/island";
export { Page, type PageProps } from "./react/page";
export { renderPage, type RenderPageOptions } from "./react/prerender";
export {
  type DemoModule,
  type DemoRegistry,
  loadDemo,
  loadDemos,
  pascalCase,
} from "./react/registry";

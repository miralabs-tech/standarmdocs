/**
 * What the sidebar remembers between two pages, and it has to remember it
 * because the site is one document per route.
 *
 * Every navigation is a full load, so the sidebar comes back scrolled to the top
 * with every category open, and the page the reader just chose is somewhere
 * below the fold of a column they had scrolled a moment ago. Measured on the
 * MiraLabs UI site, forty-eight pages in eight categories: the current link sat
 * out of the sidebar's view on every page past the first screen of it.
 *
 * Three things are kept, in the reader's browser and nowhere else:
 *
 *  - the column's scroll position, per tab (`sessionStorage`), restored before
 *    the reader sees the page and, failing that, the current link is brought into
 *    the column's view;
 *  - which categories the reader folded (`localStorage`), except that the
 *    category holding the current page is always unfolded — a page a reader is
 *    on is never hidden from them by a choice they made on another one.
 *
 * It is an inline script rendered *inside* the sidebar, after its markup, for
 * the reason the axis boot script is inline in `<head>`: a module is deferred
 * by definition, and a scroll restored after first paint is a column that jumps
 * under the reader's eyes. Rendered inside the sidebar rather than in the head so
 * that the element it works on already exists when it runs, and handed that
 * element by `document.currentScript` rather than by a selector, so two chromes
 * in one document — a test, a preview — each get their own.
 *
 * The body is exported on its own, as source, so a browser test can run it
 * against an element without a `currentScript`. Plain ES5 on purpose: it ships
 * verbatim to every browser the site reaches, minified by nothing.
 */

/** One tab's scroll position of the column. */
export const SIDEBAR_SCROLL_KEY = "standardoc:sidebar:scroll";

/** The category slugs a reader folded, as a JSON array. */
export const SIDEBAR_CLOSED_KEY = "standardoc:sidebar:closed";

/** On each category's `<details>`, the slug the closed list refers to. */
export const SIDEBAR_CATEGORY = "data-category";

/**
 * The script's body, taking the sidebar element as `s`.
 *
 * Reading the closed list before restoring the scroll is not a style choice: a
 * folded category is a shorter column, and a position saved against the folded
 * column only lands right once the column is folded again.
 */
export const SIDEBAR_BOOT_BODY = [
  `var K=${JSON.stringify(SIDEBAR_SCROLL_KEY)},C=${JSON.stringify(SIDEBAR_CLOSED_KEY)},A=${JSON.stringify(SIDEBAR_CATEGORY)};`,
  "function closed(){try{var v=JSON.parse(localStorage.getItem(C)||\"[]\");return v instanceof Array?v:[]}catch(e){return []}}",
  "var list=closed();for(var i=0;i<list.length;i++){var d=s.querySelector('details['+A+'=\"'+String(list[i]).replace(/[^\\w-]/g,\"\")+'\"]');if(d)d.removeAttribute(\"open\")}",
  "var cur=s.querySelector('[aria-current=\"page\"]');",
  "var own=cur&&cur.closest(\"details\");if(own)own.setAttribute(\"open\",\"\");",
  "var top=null;try{top=sessionStorage.getItem(K)}catch(e){}",
  "if(top!==null)s.scrollTop=+top;",
  // The link's own box against the column's: scrolled by arithmetic on the
  // column alone, never by `scrollIntoView`, which would also scroll every
  // ancestor and move the page under a reader who has not touched it.
  "if(cur){var r=cur.getBoundingClientRect(),b=s.getBoundingClientRect();if(r.top<b.top||r.bottom>b.bottom)s.scrollTop+=r.top-b.top-(b.height-r.height)/2}",
  "s.addEventListener(\"scroll\",function(){try{sessionStorage.setItem(K,String(s.scrollTop))}catch(e){}},{passive:true});",
  // `toggle` does not bubble; captured at the column instead of listened to on
  // each `<details>`, which is the same one-listener rule the axis switch keeps.
  "s.addEventListener(\"toggle\",function(e){var d=e.target;if(!d||!d.getAttribute||d.getAttribute(A)===null)return;var slug=d.getAttribute(A);var next=closed().filter(function(x){return x!==slug});if(!d.open)next.push(slug);try{localStorage.setItem(C,JSON.stringify(next))}catch(e){}},true);",
].join("");

/** The inline script, as rendered inside the sidebar. */
export function sidebarBootScript(): string {
  return `(function(s){if(!s)return;${SIDEBAR_BOOT_BODY}})(document.currentScript&&document.currentScript.parentElement)`;
}

/** On the compact top bar the chrome renders, which only a script ever shows. */
export const NAV_BAR = "data-mira-bar";

/** On the empty element inside the bar where the navigation drawer's trigger is mounted. */
export const NAV_MENU = "data-mira-bar-menu";

/** Set on `<html>` once the drawer is mounted; the stylesheet swaps the sidebar for the bar on it. */
export const NAV_READY = "data-mira-drawer-ready";

/** Where the sidebar becomes a drawer. The stylesheet spells the same breakpoint in `rem`. */
export const NAV_NARROW = "(width < 64rem)";

---
title: Disclosure
description: A button that opens and closes a region, with nothing rendered for the closed one
related: [/components/disclosure/callout]
---

A disclosure is a button and the region it controls. The region is absent from
the page until it opens, so a closed disclosure carries no panel text and no
dangling IDREF. For a note that is always shown, see
[Callout](../disclosure/callout.md#anatomy).

```demo disclosure-basic
```

## What the composed name settles

The button states `aria-expanded` and points `aria-controls` at the region it
opens, in the markup the reader gets before any script.

## Keyboard

| Key | Effect |
| --- | --- |
| `Enter` | Toggles the region |
| `Space` | Toggles the region |

## Parts

```tsx
<Disclosure label="Rename file">
  Choose a new name for this document.
</Disclosure>
```

## Props

The tables below are read from the file the site's `apiDir` names.

```props disclosure
```

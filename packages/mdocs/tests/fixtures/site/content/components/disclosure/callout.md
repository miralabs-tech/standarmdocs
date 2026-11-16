---
title: Callout
description: A note set apart from the prose around it
---

A callout is a note with a tone.

## Anatomy

A callout is one element with a title and a body. `CalloutTitle` names it and
`CalloutBody` holds the text, so a reader who skips the title still gets the
whole note.

```tsx
<Callout>
  <CalloutTitle>Heads up</CalloutTitle>
  <CalloutBody>Anyone with the link can view.</CalloutBody>
</Callout>
```

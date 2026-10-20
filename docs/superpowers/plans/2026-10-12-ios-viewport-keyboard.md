# iOS viewport and keyboard implementation plan

**Goal:** Fill the full dynamic viewport when the keyboard is closed and keep chat controls within the visual viewport during keyboard panning.
**Architecture:** One lifecycle-aware viewport controller; application shell follows its height and top offset. The document cannot scroll behind screens. Chat and comment screens consume the same dimensions.

- [x] Reproduce stale/smaller visual viewport and keyboard offset with regression tests and a local labelled simulation.
- [x] Use dynamic CSS height while closed; visual viewport height and offset during keyboard occlusion. Refresh on resize, scroll and resume.
- [x] Lock document scrolling; preserve nested screen scrolling. Remove independent chat height observers.
- [x] Run focused tests, typecheck and rendered viewport checks; record physical iPhone acceptance as pending.

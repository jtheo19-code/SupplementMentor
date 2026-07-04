---
name: Mobile flex text overflow
description: Long supplement/citation text overflows off-screen in flex rows unless text columns get min-w-0 + break-words.
---

# Mobile flex text overflow

In supps-timer, any flex row that puts long text (product names, ingredient
lists, placement reasons, source citations, audit product lists) next to another
element must give the text column `min-w-0 flex-1` and the text itself
`break-words`. Icons in those rows need `shrink-0`.

**Why:** Flexbox children default to `min-width: auto`, so a text column grows to
its content's max-content width instead of wrapping, pushing siblings (Add
button, mg value) off-screen on narrow mobile viewports (~402px). This has bitten
twice: the StackBuilder product rows and the TimingMap placement reason / source
citation / stack-audit rows. Avoid `truncate` on citations — users want to read
the full source, so wrap instead of clipping.

**How to apply:** When adding or editing any flex row in this app that contains
user/data-driven text, add `min-w-0 flex-1` to the text wrapper and `break-words`
to the text node before shipping. Verify at 402px width.

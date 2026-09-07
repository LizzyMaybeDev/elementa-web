# Elementa Web

A garbage TypeScript port of Elementa and Vigilance for the browser created solely for [wardrobes.gg](https://wardrobes.gg)

Elementa's constraint system and component model, and Vigilance's settings
screen, written again to run on a page.

Nothing here sets a coordinate. Every position and size is a constraint that
reads its parent, its previous sibling, or its own children, which is how
Elementa works in game, so a Kotlin layout transcribes across mostly by keeping
the same constraint names.

```ts
const panel = new UIBlock(palette.componentBackground)
  .constrain({
    x: center(),
    y: center(),
    width: percent(0.5),
    height: plus(childBasedSize(), pixels(20)),
  })
  .childOf(window_)
```

## What is in here

    src/elementa/    the layout engine
      state.ts       BasicState, derived values
      color.ts       RGBA colours and CSS conversion
      constraints.ts the constraint types and their factories
      component.ts   UIComponent, the tree, and Window
      components.ts  UIBlock, UIRoundedRectangle, UIText, UIWrappedText, UIImage
      dom.ts         renders a resolved tree into positioned divs
      animation.ts   Elementa's easing curves and eased state
      effects.ts     outlines, clipping, scrolling, arrivals, a pointer light
      image.ts       cached images and ImageAspectConstraint
      input.ts       UITextInput
      font.ts        the game's bitmap font, drawn glyph by glyph
      text.ts        line breaking, ported from getStringSplitToWidth
      frame.ts       when a layout pass is owed
    src/vigilance/   the settings screen, its chrome and its controls
    src/theme/       palette slots and the themes that fill them

## How layout runs

One invalidation at the root, then one read pass. Each constraint caches its
result the first time it is asked and serves that for the rest of the frame, so
a constraint ten others depend on still computes once.

A pass runs only when one is owed: a state was set, the tree changed, the
window resized, something scrolled, a picture or the font arrived, or a colour
is still easing. Everything else is left alone, and components that draw
themselves every frame say so with `live`.

Reading a bound can read other bounds, so constraining two components to each
other is a cycle. Rather than let that become a stack overflow, a constraint
that re-enters itself throws with the component and the slot named.

## Differences from upstream

Behaviourally faithful, including real pixel rounding and the precision
tolerance in cram wrapping. It differs in structure in one place: Elementa
writes each rule twice, once per axis, because Kotlin gives it no way to
abstract over that. Here an `Axis` descriptor lets each rule be written once
and applied to both, so `CramSiblingConstraint` and friends are single
implementations rather than mirrored pairs.

Not ported: `AnimatingConstraints`, scroll containers, markdown and SVG.

## Licence

GNU Lesser General Public License version 3, because this is a derivative work
of Elementa and Vigilance, both published by Sk1er LLC under that licence.

    Elementa    https://github.com/SparkUniverse/Elementa
    Vigilance   https://github.com/EssentialGG/Vigilance

The palette values in `src/theme/palette.ts` marked as Vigilance's are theirs
and are used verbatim; the other themes are not.

Not affiliated with, endorsed by, or connected to Essential, Sk1er LLC, ModCore
Inc, or Mojang.

## Building

```bash
npm install
npm run typecheck
```

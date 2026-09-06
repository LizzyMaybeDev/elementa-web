
import { test } from 'vitest'
import assert from 'node:assert/strict'

import type { DomRenderer } from '../elementa/dom'
import { Window } from '../elementa/component'
import { BasicState } from '../elementa/state'
import { setScaleFactor } from '../elementa/constraints'
import { createPalette } from '../theme/palette'
import { settingsScreen } from './screen'
import { DEFAULT_SETTINGS, appConfig } from './config'

setScaleFactor(1)

test('the settings screen resolves every bound', () => {
  const palette = createPalette()
  const config = appConfig({
    settings: { ...DEFAULT_SETTINGS },
    palette,
    renderer: {} as DomRenderer,
    fade: new BasicState(20),
  })

  const window_ = new Window()
  window_.setViewport(854, 480)
  settingsScreen(window_, palette, config)
  window_.invalidate()

  let seen = 0
  for (const component of window_.walk()) {
    const { width, height } = component.getBounds()
    assert.ok(Number.isFinite(width), `${component.name} width is not finite`)
    assert.ok(Number.isFinite(height), `${component.name} height is not finite`)
    seen++
  }
  assert.ok(seen > 40, `expected a populated tree, walked ${seen}`)
})

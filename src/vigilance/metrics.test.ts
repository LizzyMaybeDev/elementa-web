
import { test, describe } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { METRICS } from './shell'

const ROOT = join(import.meta.dirname, '../../../Vigilance/src/main/kotlin/gg/essential/vigilance')
const available = existsSync(ROOT)

function extract(file: string, pattern: RegExp, after = ''): number {
  const source = readFileSync(join(ROOT, file), 'utf8')
  const from = after ? source.indexOf(after) : 0
  assert.notEqual(from, -1, `anchor ${after} missing from ${file}`)
  const match = source.slice(from).match(pattern)
  assert.ok(match, `no match for ${pattern} after ${after || 'start'} in ${file}`)
  return Number(match[1])
}

describe.skipIf(!available)('metrics match the Vigilance source', () => {
  test('divider width', () => {
    assert.equal(
      extract('gui/SettingsGui.kt', /const val dividerWidth = ([\d.]+)f/),
      METRICS.divider,
    )
  })

  test('title bar height', () => {
    assert.equal(
      extract('gui/SettingsTitleBar.kt', /height = ([\d.]+)\.pixels/, 'init {'),
      METRICS.titleBar,
    )
  })

  test('sidebar fraction', () => {
    assert.equal(
      extract('gui/SettingsGui.kt', /width = ([\d.]+)\.percent/, 'private val sidebar') / 100,
      METRICS.sidebar,
    )
  })

  test('setting inner padding', () => {
    assert.equal(
      extract('gui/DataBackedSetting.kt', /const val INNER_PADDING = ([\d.]+)f/),
      METRICS.innerPadding,
    )
  })

  test('setting row spacing', () => {
    assert.equal(
      extract('gui/DataBackedSetting.kt', /y = SiblingConstraint\(([\d.]+)f\)/),
      METRICS.rowGap,
    )
  })

  test('text column cap', () => {
    assert.equal(
      extract('gui/DataBackedSetting.kt', /coerceAtMost\(([\d.]+)f\)/),
      METRICS.textColumnMax,
    )
  })

  test('switch size', () => {
    const source = readFileSync(join(ROOT, 'gui/settings/SwitchComponent.kt'), 'utf8')
    const match = source.match(/width = ([\d.]+)\.pixels\s*\n\s*height = ([\d.]+)\.pixels/)
    assert.ok(match, 'no switch size in SwitchComponent.kt')
    assert.equal(Number(match[1]), METRICS.switchWidth)
    assert.equal(Number(match[2]), METRICS.switchHeight)
  })
})

describe.skipIf(!available)('palette matches VigilanceConfig', () => {
  test('every slot we claim is verbatim is verbatim', async () => {
    const source = readFileSync(join(ROOT, 'VigilanceConfig.kt'), 'utf8')
    const upstream = new Map<string, string>()
    for (const [, name, hex] of source.matchAll(/private var (\w+) = Color\(0x([0-9A-Fa-f]{6})\)/g)) {
      upstream.set(name, `#${hex.toUpperCase()}`)
    }
    assert.ok(upstream.size > 15, `expected a full palette, found ${upstream.size}`)

    const { VIGILANCE } = await import('../theme/palette')
    for (const [name, hex] of upstream) {
      if (!(name in VIGILANCE)) continue
      assert.equal(
        VIGILANCE[name as keyof typeof VIGILANCE].toUpperCase(),
        hex,
        `palette slot ${name} has drifted from VigilanceConfig`,
      )
    }
  })
})

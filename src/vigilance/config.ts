
import { setMotion } from '../elementa/effects'
import type { DomRenderer } from '../elementa/dom'
import type { BasicState } from '../elementa/state'
import { THEMES, applyTheme, type Palette } from '../theme/palette'
import type { SettingsConfig } from './screen'

export interface AppSettings {
  theme: number
  guiScale: number
  scrollFade: number
  reducedMotion: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 0,
  guiScale: 0,
  scrollFade: 20,
  reducedMotion: false,
}

const SCALES = [
  { label: 'Auto', scale: 0 },
  { label: '2x', scale: 2 },
  { label: '3x', scale: 3 },
  { label: '4x', scale: 4 },
]
const MAX_FADE = 40

export interface ConfigDeps {
  settings: AppSettings
  palette: Palette
  renderer: DomRenderer
  fade: BasicState<number>
}

export function appConfig(deps: ConfigDeps): SettingsConfig {
  const { settings, palette, renderer, fade } = deps

  const absolute = (value: number, min: number, max: number) =>
    Math.round(min + value * (max - min))

  return {
    title: 'Settings',
    categories: [
      {
        name: 'Appearance',
        settings: [
          {
            name: 'Theme',
            description:
              'Palette slots are state objects, so switching repaints everything already bound without rebuilding a single component.',
            control: {
              kind: 'dropdown',
              options: THEMES.map((t) => t.name),
              index: () => settings.theme,
              onChange: (index) => {
                settings.theme = index
                applyTheme(palette, THEMES[index])
              },
            },
          },
          {
            name: 'GUI Scale',
            description:
              'Layouts are authored on a fixed pixel grid, so a small window scales rather than reflowing. Auto picks the largest whole scale that fits.',
            control: {
              kind: 'dropdown',
              options: SCALES.map((step) => step.label),
              index: () => settings.guiScale,
              onChange: (index) => {
                settings.guiScale = index
                const { scale } = SCALES[index]
                renderer.autoScale = scale === 0
                if (scale > 0) renderer.scale = scale
              },
            },
          },
          {
            name: 'Reduced Motion',
            description: 'Turns every animation off. Things are where they are, at once.',
            control: {
              kind: 'switch',
              value: () => settings.reducedMotion,
              onChange: (value) => {
                settings.reducedMotion = value
                setMotion(!value)
              },
            },
          },
          {
            name: 'Scroll Fade',
            description:
              'Softens the top and bottom of a scrolling area so clipped content reads as scrolled rather than cut off.',
            control: {
              kind: 'slider',
              value: () => fade.get() / MAX_FADE,
              onChange: (value) => fade.set(absolute(value, 0, MAX_FADE)),
            },
          },
        ],
      },
    ],
  }
}

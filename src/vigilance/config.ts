import { invalidateLayout } from '../elementa/frame'

import { setLight, setMotion } from '../elementa/effects'
import { touch } from '../elementa/device'
import type { DomRenderer } from '../elementa/dom'
import type { BasicState } from '../elementa/state'
import { THEMES, applyTheme, type Palette } from '../theme/palette'
import type { SettingsConfig } from './screen'

export interface AppSettings {
  theme: number
  guiScale: number

  zoom: number
  scrollFade: number
  reducedMotion: boolean
  lightsOut: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 0,
  guiScale: 0,
  zoom: 2,
  scrollFade: 20,
  reducedMotion: false,
  lightsOut: false,
}

const SCALES = [
  { label: 'Auto', scale: 0 },
  { label: '2x', scale: 2 },
  { label: '3x', scale: 3 },
  { label: '4x', scale: 4 },
]

const ZOOMS = [
  { label: 'Auto', zoom: 1 },
  { label: 'Wider', zoom: 0.85 },
  { label: 'Closer', zoom: 1.15 },
  { label: 'Closest', zoom: 1.35 },
]
const MAX_FADE = 40

const STORED = 'wardrobe:settings'

export function loadSettings(): AppSettings {
  const settings = { ...DEFAULT_SETTINGS }
  try {
    const held = localStorage.getItem(STORED)
    if (!held) return settings
    const read = JSON.parse(held) as Partial<Record<keyof AppSettings, unknown>>

    for (const key of Object.keys(settings) as (keyof AppSettings)[]) {
      const value = read[key]
      if (typeof value === typeof settings[key]) (settings[key] as unknown) = value
    }
  } catch {

  }
  return clamp(settings)
}

function clamp(settings: AppSettings): AppSettings {
  settings.theme = bounded(settings.theme, THEMES.length - 1)
  settings.guiScale = bounded(settings.guiScale, SCALES.length - 1)
  settings.zoom = bounded(settings.zoom, ZOOMS.length - 1)
  settings.scrollFade = Math.max(0, Math.min(MAX_FADE, Math.round(settings.scrollFade)))
  return settings
}

const bounded = (value: number, max: number): number =>
  Math.max(0, Math.min(max, Math.round(value) || 0))

function remember(settings: AppSettings): void {
  try {
    localStorage.setItem(STORED, JSON.stringify(settings))
  } catch {

  }
}

export function applySettings(deps: ConfigDeps): void {
  const { settings, palette, renderer, fade } = deps
  applyTheme(palette, THEMES[settings.theme])
  fade.set(settings.scrollFade)
  setMotion(!settings.reducedMotion)
  setLight(!settings.lightsOut)
  if (renderer.compact) {
    renderer.autoScale = true
    renderer.compactZoom = ZOOMS[settings.zoom].zoom
    return
  }
  const { scale } = SCALES[settings.guiScale] ?? SCALES[0]
  renderer.autoScale = scale === 0
  if (scale > 0) renderer.scale = scale
}

export interface ConfigDeps {
  settings: AppSettings
  palette: Palette
  renderer: DomRenderer
  fade: BasicState<number>

  onTheme?: (name: string, undo: () => void) => void
}

export function appConfig(deps: ConfigDeps): SettingsConfig {
  const { settings, palette, renderer, fade } = deps

  const kept = <T,>(change: (value: T) => void) => (value: T) => {
    change(value)
    remember(settings)
  }

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
              onChange: kept((index: number) => {
                const was = settings.theme
                settings.theme = index
                applyTheme(palette, THEMES[index])
                deps.onTheme?.(THEMES[index].name, () => {
                  settings.theme = was
                  applyTheme(palette, THEMES[was])
                  remember(settings)
                })
              }),
            },
          },
          {
            name: 'GUI Scale',
            description: renderer.compact
              ? 'How close in the shelf sits. Auto fits three cards across the screen.'
              : 'Layouts are authored on a fixed pixel grid, so a small window scales rather than reflowing. Auto picks the largest whole scale that fits.',
            control: {
              kind: 'dropdown',
              options: (renderer.compact ? ZOOMS : SCALES).map((step) => step.label),
              index: () => (renderer.compact ? settings.zoom : settings.guiScale),
              onChange: kept((index: number) => {
                if (renderer.compact) {
                  settings.zoom = index
                  renderer.autoScale = true
                  renderer.compactZoom = ZOOMS[index].zoom
                  invalidateLayout()
                  return
                }
                settings.guiScale = index
                const { scale } = SCALES[index]
                renderer.autoScale = scale === 0
                if (scale > 0) renderer.scale = scale
              }),
            },
          },
          {
            name: 'Reduced Motion',
            description: 'Turns every animation off. Things are where they are, at once.',
            control: {
              kind: 'switch',
              value: () => settings.reducedMotion,
              onChange: kept((value: boolean) => {
                settings.reducedMotion = value
                setMotion(!value)
              }),
            },
          },

          ...(touch
            ? []
            : [
                {
                  name: 'Turn off the lights! {note}',
                  description: 'The glow that follows the pointer across buttons and cards.',
                  control: {
                    kind: 'switch' as const,
                    value: () => settings.lightsOut,
                    onChange: kept((value: boolean) => {
                      settings.lightsOut = value
                      setLight(!value)
                    }),
                  },
                },
              ]),
          {
            name: 'Scroll Fade',
            description:
              'Softens the top and bottom of a scrolling area so clipped content reads as scrolled rather than cut off.',
            control: {
              kind: 'slider',
              value: () => fade.get() / MAX_FADE,

              onChange: kept((value: number) => {
                settings.scrollFade = absolute(value, 0, MAX_FADE)
                fade.set(settings.scrollFade)
              }),
            },
          },
        ],
      },
    ],
  }
}

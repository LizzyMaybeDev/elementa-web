import { UIComponent } from './component'
import { type Color, rgba, shadowOf, toCss } from './color'
import { BasicState } from './state'
import { invalidateLayout } from './frame'
import { FAMILY, LINE_HEIGHT, measureText } from './font'

const SELECTION_BACKGROUND = rgba(255, 255, 255)
const SELECTION_FOREGROUND = rgba(64, 139, 229)
const CURSOR = rgba(255, 255, 255)
const CURSOR_BLINK_SECONDS = 1
const BASELINE = 7

void document.fonts?.ready.then(invalidateLayout)

let focused: UITextInput | null = null
const fallbackHandlers = new Set<(event: KeyboardEvent) => boolean>()
let listening = false

export function onUnfocusedType(handler: (event: KeyboardEvent) => boolean): () => void {
  fallbackHandlers.add(handler)
  ensureListening()
  return () => fallbackHandlers.delete(handler)
}

export const focusedInput = (): UITextInput | null => focused

function ensureListening(): void {
  if (listening) return
  listening = true

  document.addEventListener('keydown', (event) => {
    if (focused) {
      if (event.target === keyboard) {
        if (event.key === 'Enter' || event.key === 'Escape') {
          const done = focused
          done.blur()
          if (event.key === 'Enter' && done.value.get().trim()) done.onSubmit?.()
        }
        return
      }
      focused.handleKey(event)
      return
    }
    for (const handler of fallbackHandlers) if (handler(event)) return
  })

  document.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text')
    if (!focused || !text) return
    event.preventDefault()
    focused.insert(text.replace(/\n/g, ' '))
  })

  for (const kind of ['copy', 'cut'] as const) {
    document.addEventListener(kind, (event) => {
      if (!focused || !focused.hasSelection()) return
      event.preventDefault()
      event.clipboardData?.setData('text/plain', focused.selectedText())
      if (kind === 'cut') focused.deleteSelection()
    })
  }
}

let keyboard: HTMLInputElement | null = null

const touchable = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

function raiseKeyboard(owner: UITextInput): void {
  if (typeof document === 'undefined') return
  if (!keyboard) {
    keyboard = document.createElement('input')
    keyboard.type = 'text'
    keyboard.autocapitalize = 'off'
    keyboard.autocomplete = 'off'
    keyboard.spellcheck = false
    keyboard.tabIndex = -1
    keyboard.setAttribute('aria-hidden', 'true')
    keyboard.style.cssText =
      'position:fixed;opacity:0;border:0;padding:0;background:transparent;color:transparent;pointer-events:none'
    document.body.appendChild(keyboard)
    keyboard.addEventListener('input', () => {
      if (keyboard) focused?.replaceAll(keyboard.value)
    })
    keyboard.addEventListener('blur', () => focused?.blur())
  }
  const box = owner.element?.getBoundingClientRect()
  if (box) {
    keyboard.style.left = `${box.left}px`
    keyboard.style.top = `${box.top}px`
    keyboard.style.width = `${Math.max(1, box.width)}px`
    keyboard.style.height = `${Math.max(1, box.height)}px`
  }
  keyboard.value = owner.value.get()
  keyboard.focus({ preventScroll: true })
}

function dropKeyboard(): void {
  if (keyboard && document.activeElement === keyboard) keyboard.blur()
}

const isWordChar = (character: string): boolean => /[\p{L}\p{N}_]/u.test(character)

export interface TextInputOptions {
  placeholder?: string
  scale?: number
  shadow?: boolean
}

export class UITextInput extends UIComponent {
  override name = 'UITextInput'
  override readonly tag = 'canvas'

  override get live(): boolean {
    return this.isFocused
  }

  readonly value = new BasicState('')
  onSubmit: (() => void) | null = null
  readonly placeholder: string
  readonly scale: number
  readonly shadow: boolean

  private caret = 0
  private anchor = 0
  private scrollOffset = 0
  private undoStack: { text: string; cursor: number }[] = []
  private redoStack: { text: string; cursor: number }[] = []

  constructor(options: TextInputOptions = {}) {
    super()
    this.placeholder = options.placeholder ?? ''
    this.scale = options.scale ?? 1
    this.shadow = options.shadow ?? true

    ensureListening()
    this.onClick = (event) => {
      this.focus()
      const box = this.element?.getBoundingClientRect()
      if (!box) return
      const local = (event.clientX - box.left) / (box.width / Math.max(1, this.getWidth()))
      this.setCaret(this.columnAt(local))
    }
  }

  focus(): void {
    focused = this
    if (touchable()) raiseKeyboard(this)
  }

  replaceAll(text: string): void {
    if (text === this.value.get()) return
    this.value.set(text)
    this.setCaret(text.length)
  }

  blur(): void {
    if (focused !== this) return
    focused = null
    dropKeyboard()
  }

  get isFocused(): boolean {
    return focused === this
  }

  getText(): string {
    return this.value.get()
  }

  setText(text: string): void {
    this.value.set(text)
    this.setCaret(Math.min(this.caret, text.length))
  }

  hasSelection(): boolean {
    return this.caret !== this.anchor
  }

  selectedText(): string {
    return this.getText().slice(this.selectionStart(), this.selectionEnd())
  }

  private selectionStart(): number {
    return Math.min(this.caret, this.anchor)
  }

  private selectionEnd(): number {
    return Math.max(this.caret, this.anchor)
  }

  private setCaret(column: number): void {
    this.caret = Math.max(0, Math.min(this.getText().length, column))
    this.anchor = this.caret
  }

  private textWidth(text: string): number {
    return measureText(text, this.scale)
  }

  private columnAt(x: number): number {
    const target = x + this.scrollOffset
    const text = this.getText()
    let cursor = 0
    for (let index = 0; index < text.length; index++) {
      const advance = this.textWidth(text[index])
      if (cursor + advance / 2 >= target) return index
      cursor += advance
    }
    return text.length
  }

  private wordBoundary(direction: -1 | 1): number {
    const text = this.getText()
    let index = this.caret
    const peek = (): string => text[direction < 0 ? index - 1 : index] ?? ''
    while (index + direction >= 0 && index + direction <= text.length && !isWordChar(peek())) {
      index += direction
    }
    while (index + direction >= 0 && index + direction <= text.length && isWordChar(peek())) {
      index += direction
    }
    return index
  }

  private record(): void {
    this.undoStack.push({ text: this.getText(), cursor: this.caret })
    this.redoStack.length = 0
  }

  insert(text: string): void {
    this.record()
    const current = this.getText()
    const start = this.selectionStart()
    this.value.set(current.slice(0, start) + text + current.slice(this.selectionEnd()))
    this.setCaret(start + text.length)
  }

  deleteSelection(): void {
    if (!this.hasSelection()) return
    this.record()
    const current = this.getText()
    const start = this.selectionStart()
    this.value.set(current.slice(0, start) + current.slice(this.selectionEnd()))
    this.setCaret(start)
  }

  private removeRange(start: number, end: number): void {
    if (start === end) return
    this.record()
    const current = this.getText()
    this.value.set(current.slice(0, start) + current.slice(end))
    this.setCaret(start)
  }

  private swap(from: typeof this.undoStack, to: typeof this.undoStack): void {
    const entry = from.pop()
    if (!entry) return
    to.push({ text: this.getText(), cursor: this.caret })
    this.value.set(entry.text)
    this.setCaret(entry.cursor)
  }

  handleKey(event: KeyboardEvent): boolean {
    const ctrl = event.ctrlKey || event.metaKey
    const shift = event.shiftKey
    const text = this.getText()

    const move = (column: number): void => {
      this.caret = Math.max(0, Math.min(text.length, column))
      if (!shift) this.anchor = this.caret
    }

    const consume = (): true => {
      event.preventDefault()
      return true
    }

    if (ctrl && event.key.toLowerCase() === 'a') {
      this.anchor = 0
      this.caret = text.length
      return consume()
    }
    if (ctrl && event.key.toLowerCase() === 'z') {
      this.swap(shift ? this.redoStack : this.undoStack, shift ? this.undoStack : this.redoStack)
      return consume()
    }
    if (ctrl && event.key.toLowerCase() === 'y') {
      this.swap(this.redoStack, this.undoStack)
      return consume()
    }

    if (ctrl && 'cxv'.includes(event.key.toLowerCase())) return false

    switch (event.key) {
      case 'ArrowLeft':
        move(ctrl ? this.wordBoundary(-1) : !shift && this.hasSelection() ? this.selectionStart() : this.caret - 1)
        return consume()
      case 'ArrowRight':
        move(ctrl ? this.wordBoundary(1) : !shift && this.hasSelection() ? this.selectionEnd() : this.caret + 1)
        return consume()
      case 'Home':
        move(0)
        return consume()
      case 'End':
        move(text.length)
        return consume()
      case 'Backspace':
        if (this.hasSelection()) this.deleteSelection()
        else if (this.caret > 0) this.removeRange(ctrl ? this.wordBoundary(-1) : this.caret - 1, this.caret)
        return consume()
      case 'Delete':
        if (this.hasSelection()) this.deleteSelection()
        else if (this.caret < text.length)
          this.removeRange(this.caret, ctrl ? this.wordBoundary(1) : this.caret + 1)
        return consume()
      case 'Escape':
        this.blur()
        return consume()
      case 'Enter':
        this.blur()
        if (text.trim()) this.onSubmit?.()
        return consume()
    }

    if (!ctrl && !event.altKey && event.key.length === 1) {
      this.insert(event.key)
      return consume()
    }
    return false
  }

  private updateScroll(): void {
    const box = this.getWidth()
    const before = this.textWidth(this.getText().slice(0, this.caret))

    if (this.textWidth(this.getText()) < box) this.scrollOffset = 0
    else if (this.scrollOffset > before) this.scrollOffset = before
    else if (before - this.scrollOffset > box) this.scrollOffset = before - box
  }

  override paint(element: HTMLElement, scale: number): void {
    const canvas = element as HTMLCanvasElement
    const factor = scale * (globalThis.devicePixelRatio || 1)
    const width = Math.max(1, this.getWidth())
    const height = Math.max(1, this.getHeight())

    this.updateScroll()

    const text = this.getText()
    const blink = Math.floor(performance.now() / (CURSOR_BLINK_SECONDS * 500)) % 2 === 0
    const showCursor = this.isFocused && blink

    const deviceWidth = Math.ceil(width * factor)
    const deviceHeight = Math.ceil(height * factor)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
      canvas.width = deviceWidth
      canvas.height = deviceHeight
    } else ctx.clearRect(0, 0, deviceWidth, deviceHeight)
    ctx.setTransform(factor, 0, 0, factor, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, width, height)
    ctx.translate(-this.scrollOffset, 0)

    const color = this.getColor()
    const draw = (value: string, x: number, tone: Color): void => {
      if (!value) return
      ctx.save()
      ctx.scale(this.scale, this.scale)
      ctx.font = `${LINE_HEIGHT}px ${FAMILY}`
      ctx.textBaseline = 'alphabetic'
      const y = (height - LINE_HEIGHT * this.scale) / 2 / this.scale + BASELINE
      if (this.shadow && tone !== SELECTION_FOREGROUND) {
        ctx.fillStyle = toCss(shadowOf(tone))
        ctx.fillText(value, x / this.scale + 1, y + 1)
      }
      ctx.fillStyle = toCss(tone)
      ctx.fillText(value, x / this.scale, y)
      ctx.restore()
    }

    if (!text) {
      draw(this.placeholder, 0, { ...color, a: color.a * 0.5 })
    } else if (this.hasSelection()) {
      const start = this.selectionStart()
      const end = this.selectionEnd()
      const startX = this.textWidth(text.slice(0, start))
      const endX = this.textWidth(text.slice(0, end))

      ctx.fillStyle = toCss(SELECTION_BACKGROUND)
      ctx.fillRect(startX, 0, endX - startX, height)

      draw(text.slice(0, start), 0, color)
      draw(text.slice(start, end), startX, SELECTION_FOREGROUND)
      draw(text.slice(end), endX, color)
    } else {
      draw(text, 0, color)
    }

    if (showCursor) {
      ctx.fillStyle = toCss(CURSOR)
      ctx.fillRect(this.textWidth(text.slice(0, this.caret)), 1, this.scale, height - 2)
    }
  }
}

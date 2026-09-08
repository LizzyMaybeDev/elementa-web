import { type Node_, invalidateFor, reader } from './frame'

export type Listener<T> = (value: T) => void

export interface State<T> {
  get(): T
  onSetValue(listener: Listener<T>): () => void
}

export class BasicState<T> implements State<T> {
  private value: T
  private listeners = new Set<Listener<T>>()
  private readonly readers = new Set<Node_>()

  constructor(value: T) {
    this.value = value
  }

  get(): T {
    const who = reader()
    if (who) this.readers.add(who)
    return this.value
  }

  set = (value: T): void => {
    if (Object.is(this.value, value)) return
    this.value = value
    invalidateFor(this.readers)
    for (const listener of this.listeners) listener(value)
  }

  onSetValue(listener: Listener<T>): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  map<R>(mapper: (value: T) => R): State<R> {
    return new MappedState(this, mapper)
  }
}

export class MappedState<T, R> implements State<R> {
  constructor(
    private readonly source: State<T>,
    private readonly mapper: (value: T) => R,
  ) {}

  get(): R {
    return this.mapper(this.source.get())
  }

  onSetValue(listener: Listener<R>): () => void {
    return this.source.onSetValue((value) => listener(this.mapper(value)))
  }
}

export function derived<T>(compute: () => T): State<T> {
  return {
    get: compute,
    onSetValue: () => () => {},
  }
}

export function constant<T>(value: T): State<T> {
  return {
    get: () => value,
    onSetValue: () => () => {},
  }
}

export function isState<T>(value: T | State<T>): value is State<T> {
  return typeof value === 'object' && value !== null && 'get' in value && 'onSetValue' in value
}

export function toState<T>(value: T | State<T>): State<T> {
  return isState(value) ? value : constant(value)
}

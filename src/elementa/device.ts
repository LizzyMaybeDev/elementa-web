export const touch =
  typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches

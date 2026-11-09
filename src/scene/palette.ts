/**
 * The library's limited palette. Everything in the interior is drawn from these warm tones;
 * ACCENT is the single cool colour and is reserved for interactive states only
 * (hover, focus, active/selected). Keep it that way.
 */
export const PALETTE = {
  oxblood: 0x4a1418,
  oxbloodDeep: 0x2e0b0e,
  oxbloodBright: 0x6a1c20,
  brass: 0xb08d4a,
  brassBright: 0xd8b56a,
  parchment: 0xefe3c4,
  walnut: 0x3a2214,
  walnutDark: 0x24140b,
  umber: 0x5a331b,
  candle: 0xffa850,
} as const

/** Interactive-only cool accent (pale verdigris blue). */
export const ACCENT = 0x8fd3df
export const ACCENT_CSS = '#8fd3df'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape a value for safe interpolation into HTML text or attributes. */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch])
}

/**
 * Shared HSL color conversion and formatting utilities.
 *
 * The app stores shift colors as space-separated HSL strings (e.g. "199 89% 48%").
 * These helpers centralise parsing, CSS formatting, and conversion to hex/RGB
 * so the same logic isn't repeated across components and export functions.
 */

/** Parse a stored HSL string like "199 89% 48%" into numeric components. */
export function parseHslString(color: string): { h: number; s: number; l: number } | null {
  const parts = color.split(/\s+/).map(v => parseFloat(v));
  if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return null;
  return { h: parts[0], s: parts[1], l: parts[2] };
}

/** Format a stored HSL string for use in CSS (replaces spaces with commas). */
export function formatHslForCss(color: string): string {
  return color.replace(/ /g, ",");
}

/** Convert HSL values to a hex color string (without leading #). */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0").toUpperCase();
  return `${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Convert HSL values to an RGB tuple [r, g, b] (0-255). */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Get a light-tint hex fill color for Excel export from a stored HSL string. */
export function getShiftFillHex(color?: string): string | undefined {
  if (!color) return undefined;
  const parsed = parseHslString(color);
  if (!parsed) return undefined;
  return hslToHex(parsed.h, parsed.s, Math.min(95, parsed.l + 35));
}

/** Get a light-tint RGB fill color for PDF export from a stored HSL string. */
export function getShiftFillRgb(color?: string): [number, number, number] | undefined {
  if (!color) return undefined;
  const parsed = parseHslString(color);
  if (!parsed) return undefined;
  return hslToRgb(parsed.h, parsed.s, Math.min(95, parsed.l + 35));
}

/** Build an inline cell background style from a stored HSL color string. */
export function getShiftCellStyle(color?: string): React.CSSProperties {
  if (!color) return {};
  const c = formatHslForCss(color);
  return { backgroundColor: `hsla(${c}, 0.18)`, color: "hsl(0 0% 10%)", fontWeight: 800 };
}

/** Convert a stored HSL string to a full `hsl(...)` CSS value. */
export function hslStringToCss(color: string): string {
  return `hsl(${formatHslForCss(color)})`;
}

/** Convert a stored HSL string to a `hsla(..., alpha)` CSS value. */
export function hslStringToHsla(color: string, alpha: number): string {
  return `hsla(${formatHslForCss(color)},${alpha})`;
}

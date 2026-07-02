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

/** Compute perceived relative luminance from an RGB tuple (0-255). */
function rgbRelativeLuminance([r, g, b]: [number, number, number]): number {
  // Convert to sRGB 0..1
  const srgb = [r, g, b].map(c => c / 255);
  const linear = srgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** Choose a contrasting text color (black or white) for a given stored HSL color. */
export function getContrastingTextColor(color?: string): string {
  if (!color) return "hsl(0 0% 10%)"; // default dark text
  const parsed = parseHslString(color);
  if (!parsed) return "hsl(0 0% 10%)";
  const rgb = hslToRgb(parsed.h, parsed.s, parsed.l);
  const lum = rgbRelativeLuminance(rgb);
  // WCAG suggests threshold around 0.179 for choosing black/white; we tune slightly
  return lum > 0.55 ? "hsl(0 0% 10%)" : "hsl(0 0% 100%)";
}

/** Build an inline cell background style from a stored HSL color string. */
export function getShiftCellStyle(color?: string): React.CSSProperties {
  if (!color) return {};
  const c = formatHslForCss(color);
  return { backgroundColor: `hsla(${c}, 0.18)`, color: getContrastingTextColor(color), fontWeight: 800 };
}

/** Convert a stored HSL string to a full `hsl(...)` CSS value. */
export function hslStringToCss(color: string): string {
  return `hsl(${formatHslForCss(color)})`;
}

/** Convert a stored HSL string to a `hsla(..., alpha)` CSS value. */
export function hslStringToHsla(color: string, alpha: number): string {
  return `hsla(${formatHslForCss(color)},${alpha})`;
}

/**
 * Generate a palette of visually-distinct HSL colors as stored strings like "199 89% 48%".
 * - counts are spaced by hue, with optional slight variation in saturation/lightness to reduce collisions.
 */
export function generateDistinctHslColors(count: number, opts?: { saturation?: number; lightness?: number; lightnessVariance?: number }): string[] {
  const sat = opts?.saturation ?? 85;
  const light = opts?.lightness ?? 50;
  const varL = opts?.lightnessVariance ?? 8;

  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const hue = Math.round((360 * i) / count);
    // gently vary lightness to avoid identical perceived tones when count is large
    const l = Math.max(30, Math.min(75, light + Math.round(((i % 3) - 1) * varL)));
    colors.push(`${hue} ${sat}% ${l}%`);
  }
  return colors;
}

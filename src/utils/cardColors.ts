import React from 'react';

export interface CardColorPreset {
  id: string;
  name: string;
  label: string;
  cardColor: string;
  cardBorderColor: string;
  cardTextColor: '#1A1C23' | '#FFFFFF';
  previewSwatch: string;
  badgeBg: string;
  badgeText: string;
  borderDashColor: string;
  accentQuoteColor: string;
}

export const CARD_COLOR_PRESETS: CardColorPreset[] = [
  {
    id: 'lavender',
    name: 'Lavender Dusk',
    label: 'Classic Twilight',
    cardColor: '#D8D4FF',
    cardBorderColor: '#C0B9FF',
    cardTextColor: '#1A1C23',
    previewSwatch: '#D8D4FF',
    badgeBg: 'rgba(255, 255, 255, 0.65)',
    badgeText: '#1A1C23',
    borderDashColor: 'rgba(26, 28, 35, 0.20)',
    accentQuoteColor: 'rgba(26, 28, 35, 0.90)',
  },
  {
    id: 'peach',
    name: 'Peach Dawn',
    label: 'Morning Haze',
    cardColor: '#FFE1D6',
    cardBorderColor: '#F7C4B2',
    cardTextColor: '#1A1C23',
    previewSwatch: '#FFE1D6',
    badgeBg: 'rgba(255, 255, 255, 0.65)',
    badgeText: '#1A1C23',
    borderDashColor: 'rgba(26, 28, 35, 0.20)',
    accentQuoteColor: 'rgba(26, 28, 35, 0.90)',
  },
  {
    id: 'sage',
    name: 'Misty Sage',
    label: 'Submerged Pines',
    cardColor: '#D8EBD9',
    cardBorderColor: '#BCD8BE',
    cardTextColor: '#1A1C23',
    previewSwatch: '#D8EBD9',
    badgeBg: 'rgba(255, 255, 255, 0.65)',
    badgeText: '#1A1C23',
    borderDashColor: 'rgba(26, 28, 35, 0.20)',
    accentQuoteColor: 'rgba(26, 28, 35, 0.90)',
  },
  {
    id: 'celeste',
    name: 'Celeste Blue',
    label: 'Oceanic Lucid',
    cardColor: '#D2E7FF',
    cardBorderColor: '#B4D5FF',
    cardTextColor: '#1A1C23',
    previewSwatch: '#D2E7FF',
    badgeBg: 'rgba(255, 255, 255, 0.65)',
    badgeText: '#1A1C23',
    borderDashColor: 'rgba(26, 28, 35, 0.20)',
    accentQuoteColor: 'rgba(26, 28, 35, 0.90)',
  },
  {
    id: 'rose',
    name: 'Nebula Rose',
    label: 'Soft Velvet',
    cardColor: '#FFD6E8',
    cardBorderColor: '#F5B8D4',
    cardTextColor: '#1A1C23',
    previewSwatch: '#FFD6E8',
    badgeBg: 'rgba(255, 255, 255, 0.65)',
    badgeText: '#1A1C23',
    borderDashColor: 'rgba(26, 28, 35, 0.20)',
    accentQuoteColor: 'rgba(26, 28, 35, 0.90)',
  },
  {
    id: 'sunlit',
    name: 'Sunlit Mirage',
    label: 'Warm Reverie',
    cardColor: '#FFF1C5',
    cardBorderColor: '#F3DD9C',
    cardTextColor: '#1A1C23',
    previewSwatch: '#FFF1C5',
    badgeBg: 'rgba(255, 255, 255, 0.65)',
    badgeText: '#1A1C23',
    borderDashColor: 'rgba(26, 28, 35, 0.20)',
    accentQuoteColor: 'rgba(26, 28, 35, 0.90)',
  },
  {
    id: 'parchment',
    name: 'Warm Parchment',
    label: 'Nocturnal Journal',
    cardColor: '#F6EFE2',
    cardBorderColor: '#E6DCB8',
    cardTextColor: '#1A1C23',
    previewSwatch: '#F6EFE2',
    badgeBg: 'rgba(255, 255, 255, 0.75)',
    badgeText: '#1A1C23',
    borderDashColor: 'rgba(26, 28, 35, 0.20)',
    accentQuoteColor: 'rgba(26, 28, 35, 0.90)',
  },
  {
    id: 'nocturne',
    name: 'Nocturne Indigo',
    label: 'Midnight Reverie',
    cardColor: '#1E1B38',
    cardBorderColor: '#342F5C',
    cardTextColor: '#FFFFFF',
    previewSwatch: '#1E1B38',
    badgeBg: 'rgba(255, 255, 255, 0.18)',
    badgeText: '#FFFFFF',
    borderDashColor: 'rgba(255, 255, 255, 0.22)',
    accentQuoteColor: 'rgba(255, 255, 255, 0.90)',
  },
  {
    id: 'obsidian',
    name: 'Obsidian Velvet',
    label: 'Deep Void',
    cardColor: '#141419',
    cardBorderColor: '#282832',
    cardTextColor: '#FFFFFF',
    previewSwatch: '#141419',
    badgeBg: 'rgba(255, 255, 255, 0.18)',
    badgeText: '#FFFFFF',
    borderDashColor: 'rgba(255, 255, 255, 0.20)',
    accentQuoteColor: 'rgba(255, 255, 255, 0.90)',
  },
];

export const DEFAULT_CARD_PRESET = CARD_COLOR_PRESETS[0];

/**
 * Parses 3 or 6 digit hex string to { r, g, b }
 */
export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || typeof hex !== 'string') return null;
  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Calculates perceived brightness (0 to 1) using WCAG formula
 */
export function isColorDark(hex: string): boolean {
  const rgb = parseHexColor(hex);
  if (!rgb) return false;
  // Perceived luminance formula
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < 0.52;
}

/**
 * Lightens or darkens a hex color by a given percentage
 */
export function adjustColor(hex: string, percent: number): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return hex;
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, rgb.r + amt));
  const G = Math.min(255, Math.max(0, rgb.g + amt));
  const B = Math.min(255, Math.max(0, rgb.b + amt));
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1).toUpperCase()}`;
}

/**
 * Derives a full CardColorPreset from any valid custom hex color
 */
export function deriveCardTheme(customHex?: string, customName: string = 'Custom Atmosphere'): CardColorPreset {
  if (!customHex || typeof customHex !== 'string') {
    return DEFAULT_CARD_PRESET;
  }

  // Check if it matches an existing preset
  const matched = CARD_COLOR_PRESETS.find(
    (p) => p.cardColor.toLowerCase() === customHex.toLowerCase() || p.id === customHex
  );
  if (matched) return matched;

  const validHex = customHex.startsWith('#') ? customHex : `#${customHex}`;
  const dark = isColorDark(validHex);
  const borderColor = dark ? adjustColor(validHex, 18) : adjustColor(validHex, -14);

  return {
    id: 'custom',
    name: customName,
    label: 'Custom Choice',
    cardColor: validHex,
    cardBorderColor: borderColor,
    cardTextColor: dark ? '#FFFFFF' : '#1A1C23',
    previewSwatch: validHex,
    badgeBg: dark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(255, 255, 255, 0.65)',
    badgeText: dark ? '#FFFFFF' : '#1A1C23',
    borderDashColor: dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(26, 28, 35, 0.20)',
    accentQuoteColor: dark ? 'rgba(255, 255, 255, 0.90)' : 'rgba(26, 28, 35, 0.90)',
  };
}

/**
 * Get unified styles and classes for any Dream card
 */
export function getDreamCardStyle(dream?: {
  cardColor?: string;
  cardBorderColor?: string;
  cardTextColor?: string;
  cardGradient?: string;
}) {
  const baseColor = dream?.cardColor || '#D8D4FF';
  const matched = CARD_COLOR_PRESETS.find(
    (p) => p.cardColor.toLowerCase() === baseColor.toLowerCase()
  );

  const isDark = dream?.cardTextColor === '#FFFFFF' || (matched ? matched.cardTextColor === '#FFFFFF' : isColorDark(baseColor));
  const cardBorder = dream?.cardBorderColor || (matched ? matched.cardBorderColor : (isDark ? adjustColor(baseColor, 18) : adjustColor(baseColor, -14)));
  const textColor = isDark ? '#FFFFFF' : '#1A1C23';
  const subtextColor = isDark ? 'rgba(255, 255, 255, 0.70)' : 'rgba(26, 28, 35, 0.60)';
  const badgeBg = isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(255, 255, 255, 0.60)';
  const dashedBorder = isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(26, 28, 35, 0.20)';

  const containerStyle: React.CSSProperties = {
    backgroundColor: baseColor,
    borderBottomColor: cardBorder,
    color: textColor,
  };

  return {
    isDark,
    cardColor: baseColor,
    cardBorderColor: cardBorder,
    cardTextColor: textColor,
    textColor,
    subtextColor,
    badgeBg,
    dashedBorder,
    containerStyle,
  };
}

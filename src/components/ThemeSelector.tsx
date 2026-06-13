import { Monitor, Moon, Sun, Palette, Check } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type Theme } from '@/contexts/AppContext';
import {
  themePresets,
  builtinThemes,
  type CoreThemeColors,
  type ThemePreset,
} from '@/themes';
import { hslStringToHex, hexToHslString, isValidHex } from '@/lib/colorUtils';
import { getBundledFont } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MODES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'custom', label: 'Custom', icon: Palette },
];

const FONT_OPTIONS = ['Inter', 'Space Grotesk', 'JetBrains Mono'];

/** A small swatch preview of a preset's three core colors. */
function PresetSwatch({ colors }: { colors: CoreThemeColors }) {
  return (
    <span className="flex overflow-hidden rounded-full ring-1 ring-border">
      {(['background', 'primary', 'text'] as const).map((role) => (
        <span
          key={role}
          className="size-3.5"
          style={{ background: `hsl(${colors[role]})` }}
        />
      ))}
    </span>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string; // bare HSL string
  onChange: (hsl: string) => void;
}) {
  const hex = isValidHex(hslStringToHex(value)) ? hslStringToHex(value) : '#000000';
  return (
    <label className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(hexToHslString(e.target.value))}
        className="size-10 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
        aria-label={label}
      />
      {label}
    </label>
  );
}

/**
 * Full appearance control: pick a theme mode, apply a preset, customize the
 * three core colors and body font, and optionally share the theme to your
 * Nostr profile (kind 16767) when logged in.
 */
export function ThemeSelector() {
  const { user } = useCurrentUser();
  const {
    theme,
    customTheme,
    autoShareTheme,
    setTheme,
    applyCustomTheme,
    setAutoShareTheme,
  } = useTheme();

  // The colors currently shown in the custom editor: the active custom theme,
  // or the builtin colors for whichever mode is resolved, as a starting point.
  const editingColors: CoreThemeColors =
    customTheme?.colors ??
    (theme === 'light' ? builtinThemes.light : builtinThemes.dark);

  const applyPreset = (preset: ThemePreset) => {
    applyCustomTheme({
      title: preset.label,
      colors: preset.colors,
      ...(preset.font && { font: preset.font }),
      ...(preset.titleFont && { titleFont: preset.titleFont }),
      ...(preset.background && { background: preset.background }),
    });
  };

  const updateColor = (role: keyof CoreThemeColors, hsl: string) => {
    applyCustomTheme({
      ...customTheme,
      title: customTheme?.title ?? 'Custom',
      colors: { ...editingColors, [role]: hsl },
    });
  };

  const updateFont = (family: string) => {
    applyCustomTheme({
      ...customTheme,
      title: customTheme?.title ?? 'Custom',
      colors: editingColors,
      font: family === '__default' ? undefined : { family },
    });
  };

  const activePresetKey = customTheme
    ? Object.entries(themePresets).find(
        ([, p]) => JSON.stringify(p.colors) === JSON.stringify(customTheme.colors),
      )?.[0]
    : undefined;

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="space-y-2">
        <Label>Theme mode</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors',
                'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                theme === value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground',
              )}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Light and Dark use NostrHub's signature palette. Choose Custom or a preset
          below to fully recolor the app.
        </p>
      </div>

      {/* Presets */}
      <div className="space-y-2">
        <Label>Presets</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(themePresets).map(([key, preset]) => {
            const active = theme === 'custom' && activePresetKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(preset)}
                aria-pressed={active}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors',
                  'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary bg-primary/10' : 'border-border',
                )}
              >
                <span aria-hidden className="text-base leading-none">{preset.emoji}</span>
                <PresetSwatch colors={preset.colors} />
                <span className="min-w-0 flex-1 truncate">{preset.label}</span>
                {active && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom colors */}
      <div className="space-y-3">
        <Label>Custom colors</Label>
        <div className="flex flex-wrap gap-5">
          <ColorField
            label="Background"
            value={editingColors.background}
            onChange={(hsl) => updateColor('background', hsl)}
          />
          <ColorField
            label="Text"
            value={editingColors.text}
            onChange={(hsl) => updateColor('text', hsl)}
          />
          <ColorField
            label="Primary"
            value={editingColors.primary}
            onChange={(hsl) => updateColor('primary', hsl)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Every other color (cards, borders, accents, charts) is derived from these
          three. Editing a color switches you to Custom mode.
        </p>
      </div>

      {/* Font */}
      <div className="space-y-2">
        <Label htmlFor="theme-font">Font</Label>
        <Select
          value={customTheme?.font?.family ?? '__default'}
          onValueChange={updateFont}
        >
          <SelectTrigger id="theme-font" className="max-w-xs">
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default">Default</SelectItem>
            {FONT_OPTIONS.map((family) => (
              <SelectItem
                key={family}
                value={family}
                style={{ fontFamily: getBundledFont(family) ? `${family} Variable, ${family}` : family }}
              >
                {family}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Share to profile */}
      {user && (
        <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
          <div className="space-y-0.5">
            <Label htmlFor="share-theme">Share theme to profile</Label>
            <p className="text-sm text-muted-foreground">
              Publish your custom theme to Nostr so other clients can show it on your
              profile, and sync it across your devices.
            </p>
          </div>
          <Switch
            id="share-theme"
            checked={autoShareTheme}
            onCheckedChange={setAutoShareTheme}
            aria-label="Share theme to profile"
          />
        </div>
      )}
    </div>
  );
}

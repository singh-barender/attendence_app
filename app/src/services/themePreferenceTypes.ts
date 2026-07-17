/** Shared between themePreference.native.ts/.web.ts and
 * ThemePreferenceContext.tsx (task 4.7) — its own file so neither imports
 * the other just for this type.
 *
 * `ThemePreference` is deliberately narrower than what a user can *select*:
 * it's the already-resolved value every actual rendering consumer uses
 * (Tamagui's `<Theme name={resolvedTheme}>`, `GLASS_PALETTES` lookups) —
 * these never need to know about "system," only the final light/dark
 * answer. `StoredThemePreference` (task 4.13 follow-up) is the broader set
 * a user can actually pick in `ProfileScreen`'s toggle, including "follow
 * the OS," which resolves to one of the two concrete values at render time
 * rather than being a third thing everything else has to handle. */
export type ThemePreference = 'light' | 'dark';
export type StoredThemePreference = ThemePreference | 'system';

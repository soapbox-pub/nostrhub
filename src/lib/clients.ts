/** Known Nostr client tag values tracked by the client metrics charts. */
export interface ClientDef {
  /** Exact value(s) of the `client` tag on events. Multiple values are OR'd in the filter. */
  tags: string[];
  /** Display label. */
  label: string;
  /** Chart/UI color. */
  color: string;
}

export const CLIENTS: ClientDef[] = [
  { tags: ['Ditto'], label: 'Ditto', color: 'hsl(221, 83%, 53%)' },
  { tags: ['Amethyst'], label: 'Amethyst', color: 'hsl(258, 70%, 55%)' },
  { tags: ['Primal Web', 'Primal Android'], label: 'Primal', color: 'hsl(348, 83%, 47%)' },
  { tags: ['Damus'], label: 'Damus', color: 'hsl(204, 88%, 53%)' },
  { tags: ['nostur'], label: 'Nostur', color: 'hsl(160, 75%, 42%)' },
  { tags: ['Coracle'], label: 'Coracle', color: 'hsl(25, 95%, 53%)' },
  { tags: ['snort'], label: 'Snort', color: 'hsl(280, 68%, 55%)' },
];

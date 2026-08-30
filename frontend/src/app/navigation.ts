export type PrimaryNavItem =
  | 'dashboard'
  | 'campaigns'
  | 'calendar'
  | 'performance'
  | 'library';

export type SecondaryNavItem =
  | 'brand'
  | 'objectives'
  | 'offers'
  | 'audiences'
  | 'sops'
  | 'integrations'
  | 'total-edit'
  | 'settings';

export const PRIMARY_NAV: { id: PrimaryNavItem; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'performance', label: 'Performance' },
  { id: 'library', label: 'Library' },
];

import React from 'react';
import Box from '@mui/material/Box';

const GROUP_TYPE_EMOJI: Record<string, string> = {
  trip: '✈️',
  home: '🏠',
  couple: '💑',
  other: '👥',
};

// A small curated set of flat, muted tile colors (Reconcile has no gradient —
// Design Spec §1/§2) so group tiles read as colorful/distinct without looking
// randomly hashed/muddy the way raw HSL-from-id would.
const TILE_COLORS = [
  '#7E8CA3', // slate
  '#C97B4D', // clay
  '#5E9C8F', // teal-green
  '#B98CC2', // mauve
  '#A3A86B', // olive
  '#C77B9E', // rose
];

function tileColorForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length];
}

interface GroupAvatarProps {
  seed: string;
  groupType?: string;
  size?: number;
}

/** Rounded-square gradient tile with the group's type emoji — the group-list
 * equivalent of MemberAvatarStack's per-person colored circles. */
const GroupAvatar: React.FC<GroupAvatarProps> = ({ seed, groupType = 'other', size = 48 }) => (
  <Box
    sx={{
      width: size,
      height: size,
      minWidth: size,
      borderRadius: size / 3,
      backgroundColor: tileColorForSeed(seed),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.5,
    }}
  >
    {GROUP_TYPE_EMOJI[groupType] || GROUP_TYPE_EMOJI.other}
  </Box>
);

export default GroupAvatar;

import React from 'react';
import Box from '@mui/material/Box';

const GROUP_TYPE_EMOJI: Record<string, string> = {
  trip: '✈️',
  home: '🏠',
  couple: '💑',
  other: '👥',
};

// A small curated set of gradient pairs (kept in the app's existing blue→purple
// family, spec §11.3-adjacent) so group tiles read as colorful/distinct without
// looking randomly hashed/muddy the way raw HSL-from-id would.
const GRADIENTS = [
  ['#007AFF', '#AF52DE'], // blue → purple (brand default)
  ['#FF9500', '#FF2D55'], // orange → pink
  ['#34C759', '#007AFF'], // green → blue
  ['#AF52DE', '#FF2D55'], // purple → pink
  ['#00C7BE', '#007AFF'], // teal → blue
  ['#FF9500', '#AF52DE'], // orange → purple
];

function gradientForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const [start, end] = GRADIENTS[Math.abs(hash) % GRADIENTS.length];
  return `linear-gradient(135deg, ${start} 0%, ${end} 100%)`;
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
      background: gradientForSeed(seed),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.5,
      boxShadow: `0 4px 14px ${'rgba(0,0,0,0.15)'}`,
    }}
  >
    {GROUP_TYPE_EMOJI[groupType] || GROUP_TYPE_EMOJI.other}
  </Box>
);

export default GroupAvatar;

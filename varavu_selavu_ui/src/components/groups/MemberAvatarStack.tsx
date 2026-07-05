import React from 'react';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';

/** Deterministic color from a member UUID (spec §11.3) — same id always renders
 * the same hue, independent of the display name. */
export function colorFromMemberId(memberId: string): string {
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) {
    hash = memberId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim()[0]?.toUpperCase() || '?';
}

export interface MemberAvatarStackMember {
  member_id: string;
  display_name: string;
}

interface MemberAvatarStackProps {
  members: MemberAvatarStackMember[];
  max?: number;
  size?: number;
}

const MemberAvatarStack: React.FC<MemberAvatarStackProps> = ({ members, max = 5, size = 32 }) => {
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((m, idx) => (
        <Tooltip key={m.member_id} title={m.display_name}>
          <Avatar
            sx={{
              width: size,
              height: size,
              fontSize: size * 0.4,
              bgcolor: colorFromMemberId(m.member_id),
              ml: idx === 0 ? 0 : -1,
              border: '2px solid',
              borderColor: 'background.paper',
            }}
          >
            {initialsFromName(m.display_name)}
          </Avatar>
        </Tooltip>
      ))}
      {overflow > 0 && (
        <Avatar sx={{ width: size, height: size, fontSize: size * 0.35, ml: -1, border: '2px solid', borderColor: 'background.paper' }}>
          +{overflow}
        </Avatar>
      )}
    </Box>
  );
};

export default MemberAvatarStack;

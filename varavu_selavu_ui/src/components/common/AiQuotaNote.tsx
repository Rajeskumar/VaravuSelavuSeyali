import React from 'react';
import { Typography } from '@mui/material';
import { AiUsage, AiFeatureUsage, formatResetTime } from '../../api/aiUsage';

/** One-line "N of M questions left today" under an AI input, or why AI is unavailable. Renders
 * nothing for unlimited users or while usage is loading. */
export default function AiQuotaNote({ usage, feature }: { usage?: AiUsage; feature?: AiFeatureUsage }) {
  if (!usage) return null;
  let text: string | null = null;
  let tone: 'text.secondary' | 'error.main' = 'text.secondary';
  if (!usage.ai_enabled) {
    text = 'AI features are turned off right now.';
  } else if (usage.blocked) {
    text = "AI features aren't available on this account.";
  } else if (usage.requires_verified_email && !usage.email_verified) {
    text = 'Verify your email to use AI features — check your inbox for the link.';
  } else if (usage.paused) {
    text = 'AI is taking a break right now. Please try again later.';
  } else if (feature && feature.limit !== null && feature.remaining !== null) {
    if (feature.remaining <= 0) {
      text = `Daily limit reached. More questions at ${formatResetTime(usage.resets_at)}.`;
      tone = 'error.main';
    } else {
      text = `${feature.remaining} of ${feature.limit} questions left today`;
    }
  }
  if (!text) return null;
  return (
    <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 11.5, color: tone, textAlign: 'center', mt: 0.75 }}>
      {text}
    </Typography>
  );
}

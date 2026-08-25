/** Classic O(n*m) edit-distance, used only for TagInput's client-side near-duplicate suggestion
 * (PRD §9.1) over a user's own tag list (capped at 100 entries — cheap at this scale, no need
 * for a smarter algorithm or a server round trip). */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dist[i][0] = i;
  for (let j = 0; j < cols; j++) dist[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,      // deletion
        dist[i][j - 1] + 1,      // insertion
        dist[i - 1][j - 1] + cost, // substitution
      );
    }
  }
  return dist[rows - 1][cols - 1];
}

/** Normalized similarity in [0, 1] — 1 means identical, 0 means completely different. Used to
 * find a "did you mean X?" candidate at a conservative threshold (PRD §14 Open Question #4:
 * "start conservative, adjust after Gate 1"). */
export function similarity(a: string, b: string): number {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(normA, normB) / maxLen;
}

/** TS-GRP-130: pure URL builders for payment deep links. TrackSpense never
 * touches money or these providers' APIs — opening a link just launches the
 * user's own Venmo/PayPal/UPI app with the amount pre-filled; the settlement
 * itself is still recorded separately via the existing Settle Up flow. */

export function venmoLink(handle: string, amount: number, note: string): string {
  const cleanHandle = handle.replace(/^@/, '');
  const params = new URLSearchParams({
    txn: 'pay',
    recipients: cleanHandle,
    amount: amount.toFixed(2),
    note,
  });
  return `venmo://paycharge?${params.toString()}`;
}

export function paypalMeLink(handle: string, amount: number): string {
  const cleanHandle = handle.replace(/^https?:\/\/(www\.)?paypal\.me\//i, '');
  return `https://paypal.me/${encodeURIComponent(cleanHandle)}/${amount.toFixed(2)}`;
}

export function upiLink(vpa: string, amount: number, note: string): string {
  const params = new URLSearchParams({
    pa: vpa,
    am: amount.toFixed(2),
    tn: note,
    cu: 'INR',
  });
  return `upi://pay?${params.toString()}`;
}

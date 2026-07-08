import { venmoLink, paypalMeLink, upiLink } from './paymentDeepLinks';

test('venmoLink builds a correctly encoded deep link', () => {
  const link = venmoLink('@rajesh', 42.5, 'TrackSpense settlement');
  expect(link).toBe('venmo://paycharge?txn=pay&recipients=rajesh&amount=42.50&note=TrackSpense+settlement');
});

test('paypalMeLink appends the amount', () => {
  expect(paypalMeLink('rajesh.paypal', 30)).toBe('https://paypal.me/rajesh.paypal/30.00');
});

test('upiLink encodes amount and note', () => {
  const link = upiLink('rajesh@upi', 15, 'Trip settlement');
  expect(link).toBe('upi://pay?pa=rajesh%40upi&am=15.00&tn=Trip+settlement&cu=INR');
});

/**
 * UPI payment links (NPCI deep-link format). Opening one on a phone shows the
 * installed UPI apps (GPay, PhonePe, Paytm, BHIM…) with the payee and amount
 * filled in. No payment gateway or account is needed; the owner confirms
 * receipt in their own UPI app.
 */

export const isUpiId = (vpa) => /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/i.test(String(vpa || ''));

export function upiLink({ pa, pn, am, tn }) {
  if (!isUpiId(pa)) throw new Error('Invalid UPI ID');
  const amount = Math.round(Number(am) * 100) / 100;
  if (!(amount > 0)) throw new Error('Invalid amount');
  const q = new URLSearchParams({ pa, pn: String(pn || '').slice(0, 50), am: amount.toFixed(2), cu: 'INR', tn: String(tn || '').slice(0, 80) });
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
}

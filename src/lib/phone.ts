// Phone numbers in one shape everywhere (+<country code><number>, E.164), for the staff call list,
// the customer's own number on the website, and the number a phone call came from. No imports, so
// it can run anywhere.

/**
 * "07576 593472" → "+447576593472", "00216 90 217 664" → "+21690217664". A number starting with a
 * single 0 is read as a UK number, the way people write them in the UK. Null when it is not a number.
 */
export function normalisePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let phone = input.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  else if (/^0\d{9,10}$/.test(phone)) phone = `+44${phone.slice(1)}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

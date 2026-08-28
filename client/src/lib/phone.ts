/* Phone number normalisation, shared in spirit (not in code — client and
   server are separate bundles) with server/lib/phone.ts. Keep the two in
   sync: this is what lets "0917 123 4567", "+63 917 123 4567" and
   "639171234567" all resolve to the same profiles.phone row.

   PH-specific: a 12-digit number starting with the "63" country code is
   rewritten to the local 11-digit "0917…" form used everywhere else in the
   app (input placeholders, profiles.phone as stored at signup). Anything
   that doesn't match a recognised shape is returned digits-only, which at
   worst fails to match rather than matching the wrong account. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length === 12) return '0' + digits.slice(2)
  if (digits.startsWith('9') && digits.length === 10) return '0' + digits
  return digits
}

/** True when the typed identifier looks like an email rather than a phone number. */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@')
}

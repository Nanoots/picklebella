import qrphImg from '@/imports/qrph.png'
import gcashImg from '@/imports/gcash.png'
import mayaImg from '@/imports/maya.png'

// Fee rates PayMongo charges PickleBella per method; passed through to the guest.
// Single source of truth — the booking flow (BookingModal) and the admin
// Reservations table both read from this so payment method labels/icons stay in sync.
export const PAYMENT_METHODS = [
  { id: 'instapay', label: 'QR Ph (InstaPay)', feeRate: 0.0134, logo: qrphImg as string | null },
  { id: 'gcash', label: 'GCash', feeRate: 0.0223, logo: gcashImg as string | null },
  { id: 'maya', label: 'Maya', feeRate: 0.0179, logo: mayaImg as string | null },
  { id: 'card', label: 'Credit / Debit Card', feeRate: 0, logo: null as string | null, disabled: true },
]

export function getPaymentMethod(id: string) {
  return PAYMENT_METHODS.find((p) => p.id === id)
}

export function calcTotal(base: number, feeRate: number) {
  return Math.round(base * (1 + feeRate))
}

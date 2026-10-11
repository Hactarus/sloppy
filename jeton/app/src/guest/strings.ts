/** Guest page strings only - kept separate so the public page ships no other dictionary. */
export type Lang = 'fr' | 'nl' | 'en'
export const strings = {
  en: {
    'title': 'Your balance', 'tokens': 'tokens', 'worth': 'worth about {eur}', 'recent': 'Recent activity', 'none': 'No activity yet', 'notFound': 'Tag not found',
    'blocked': 'This tag is blocked. Please visit the cash desk.', 'policy': 'Refund and expiry policy: {v}', 'privacy': 'Privacy', 'refundUntil': 'Refundable until {d}', 'expires': 'Expires {d}',
    'topup': 'Top-up', 'sale': 'Purchase', 'order_refund': 'Refund', 'cashout': 'Cash-out', 'promo_grant': 'Free tokens', 'tag_replacement': 'Tag replaced', 'reversal': 'Correction',
    'error': 'Could not load. Try again.',
  },
  fr: {
    'title': 'Votre solde', 'tokens': 'jetons', 'worth': 'environ {eur}', 'recent': 'Activité récente', 'none': 'Aucune activité', 'notFound': 'Badge introuvable',
    'blocked': 'Ce badge est bloqué. Passez à la caisse.', 'policy': 'Politique de remboursement et d\'expiration : {v}', 'privacy': 'Confidentialité', 'refundUntil': 'Remboursable jusqu\'au {d}', 'expires': 'Expire le {d}',
    'topup': 'Recharge', 'sale': 'Achat', 'order_refund': 'Remboursement', 'cashout': 'Retrait', 'promo_grant': 'Jetons offerts', 'tag_replacement': 'Badge remplacé', 'reversal': 'Correction',
    'error': 'Chargement impossible. Réessayez.',
  },
  nl: {
    'title': 'Jouw saldo', 'tokens': 'munten', 'worth': 'ongeveer {eur}', 'recent': 'Recente activiteit', 'none': 'Nog geen activiteit', 'notFound': 'Tag niet gevonden',
    'blocked': 'Deze tag is geblokkeerd. Ga naar de kassa.', 'policy': 'Terugbetalings- en vervalbeleid: {v}', 'privacy': 'Privacy', 'refundUntil': 'Terugbetaalbaar tot {d}', 'expires': 'Vervalt op {d}',
    'topup': 'Opladen', 'sale': 'Aankoop', 'order_refund': 'Terugbetaling', 'cashout': 'Uitbetaling', 'promo_grant': 'Gratis munten', 'tag_replacement': 'Tag vervangen', 'reversal': 'Correctie',
    'error': 'Laden mislukt. Probeer opnieuw.',
  },
} as const

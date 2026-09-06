const encryptedMessageBodies = {
  en: 'New encrypted message',
  ar: 'رسالة مشفرة جديدة',
  bn: 'নতুন এনক্রিপ্ট করা বার্তা',
  de: 'Neue verschlüsselte Nachricht',
  es: 'Nuevo mensaje cifrado',
  fr: 'Nouveau message chiffré',
  hi: 'नया एन्क्रिप्टेड संदेश',
  id: 'Pesan terenkripsi baru',
  it: 'Nuovo messaggio crittografato',
  pt: 'Nova mensagem criptografada',
  ru: 'Новое зашифрованное сообщение',
  ur: 'نیا رمز کردہ پیغام',
  'zh-Hans': '新的加密消息',
} as const

const walletActivityBodies: Record<keyof typeof encryptedMessageBodies, string> = {
  en: 'New wallet activity',
  ar: 'نشاط جديد في المحفظة',
  bn: 'নতুন ওয়ালেট কার্যকলাপ',
  de: 'Neue Wallet-Aktivität',
  es: 'Nueva actividad de cartera',
  fr: 'Nouvelle activité du portefeuille',
  hi: 'नई वॉलेट गतिविधि',
  id: 'Aktivitas dompet baru',
  it: 'Nuova attività del portafoglio',
  pt: 'Nova atividade da carteira',
  ru: 'Новая активность кошелька',
  ur: 'والیٹ کی نئی سرگرمی',
  'zh-Hans': '新的钱包活动',
}

type PushNotificationLocale = keyof typeof encryptedMessageBodies

export interface GenericPushNotificationCopy {
  title: 'Spectra'
  body: string
}

function resolveLocale(value: unknown): PushNotificationLocale {
  if (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(encryptedMessageBodies, value)
  ) {
    return value as PushNotificationLocale
  }

  return 'en'
}

export function getGenericEncryptedMessagePushCopy(locale: unknown): GenericPushNotificationCopy {
  return {
    title: 'Spectra',
    body: encryptedMessageBodies[resolveLocale(locale)],
  }
}

export function getGenericWalletActivityPushCopy(locale: unknown): GenericPushNotificationCopy {
  return {
    title: 'Spectra',
    body: walletActivityBodies[resolveLocale(locale)],
  }
}

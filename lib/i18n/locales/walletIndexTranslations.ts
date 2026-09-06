/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import type { LanguageTranslations } from '../schema'

type WalletIndexLanguage =
  | 'ar'
  | 'bn'
  | 'de'
  | 'en'
  | 'es'
  | 'fr'
  | 'hi'
  | 'id'
  | 'it'
  | 'pt'
  | 'ru'
  | 'ur'
  | 'zh-Hans'

type WalletIndexTranslations = Partial<LanguageTranslations>

export const walletIndexTranslations: Record<WalletIndexLanguage, WalletIndexTranslations> = {
  en: {
    common: {
      'Wallet indexing': 'Wallet indexing',
      'Could not activate wallet indexing': 'Could not activate wallet indexing',
      'Activate wallet indexing for {{network}}': 'Activate wallet indexing for {{network}}',
      Activate: 'Activate',
      'Wallet indexing is inactive': 'Wallet indexing is inactive',
      'Activate indexing to save new activity on this device':
        'Activate indexing to save new activity on this device',
    },
    settings: {
      'Activating wallet indexing': 'Activating wallet indexing',
    },
  },
  ar: {
    common: {
      'Wallet indexing': 'فهرسة المحفظة',
      'Could not activate wallet indexing': 'تعذر تفعيل فهرسة المحفظة',
      'Activate wallet indexing for {{network}}': 'تفعيل فهرسة المحفظة لـ {{network}}',
      Activate: 'تفعيل',
      'Wallet indexing is inactive': 'فهرسة المحفظة غير نشطة',
      'Activate indexing to save new activity on this device':
        'فعّل الفهرسة لحفظ النشاط الجديد على هذا الجهاز',
    },
    settings: {
      'Activating wallet indexing': 'جارٍ تفعيل فهرسة المحفظة',
    },
  },
  bn: {
    common: {
      'Wallet indexing': 'ওয়ালেট ইনডেক্সিং',
      'Could not activate wallet indexing': 'ওয়ালেট ইনডেক্সিং সক্রিয় করা যায়নি',
      'Activate wallet indexing for {{network}}': '{{network}}-এর জন্য ওয়ালেট ইনডেক্সিং সক্রিয় করুন',
      Activate: 'সক্রিয় করুন',
      'Wallet indexing is inactive': 'ওয়ালেট ইনডেক্সিং নিষ্ক্রিয়',
      'Activate indexing to save new activity on this device':
        'এই ডিভাইসে নতুন কার্যকলাপ সংরক্ষণ করতে ইনডেক্সিং সক্রিয় করুন',
    },
    settings: {
      'Activating wallet indexing': 'ওয়ালেট ইনডেক্সিং সক্রিয় করা হচ্ছে',
    },
  },
  de: {
    common: {
      'Wallet indexing': 'Wallet-Indexierung',
      'Could not activate wallet indexing': 'Die Wallet-Indexierung konnte nicht aktiviert werden',
      'Activate wallet indexing for {{network}}': 'Wallet-Indexierung für {{network}} aktivieren',
      Activate: 'Aktivieren',
      'Wallet indexing is inactive': 'Wallet-Indexierung ist inaktiv',
      'Activate indexing to save new activity on this device':
        'Aktiviere die Indexierung, um neue Aktivitäten auf diesem Gerät zu speichern',
    },
    settings: {
      'Activating wallet indexing': 'Wallet-Indexierung wird aktiviert',
    },
  },
  es: {
    common: {
      'Wallet indexing': 'Indexación de cartera',
      'Could not activate wallet indexing': 'No se pudo activar la indexación de cartera',
      'Activate wallet indexing for {{network}}': 'Activar indexación de cartera para {{network}}',
      Activate: 'Activar',
      'Wallet indexing is inactive': 'La indexación de cartera está inactiva',
      'Activate indexing to save new activity on this device':
        'Activa la indexación para guardar nueva actividad en este dispositivo',
    },
    settings: {
      'Activating wallet indexing': 'Activando indexación de cartera',
    },
  },
  fr: {
    common: {
      'Wallet indexing': 'Indexation du portefeuille',
      'Could not activate wallet indexing': 'Impossible d’activer l’indexation du portefeuille',
      'Activate wallet indexing for {{network}}': 'Activer l’indexation du portefeuille pour {{network}}',
      Activate: 'Activer',
      'Wallet indexing is inactive': 'L’indexation du portefeuille est inactive',
      'Activate indexing to save new activity on this device':
        'Activez l’indexation pour enregistrer les nouvelles activités sur cet appareil',
    },
    settings: {
      'Activating wallet indexing': 'Activation de l’indexation du portefeuille',
    },
  },
  hi: {
    common: {
      'Wallet indexing': 'वॉलेट इंडेक्सिंग',
      'Could not activate wallet indexing': 'वॉलेट इंडेक्सिंग सक्रिय नहीं की जा सकी',
      'Activate wallet indexing for {{network}}': '{{network}} के लिए वॉलेट इंडेक्सिंग सक्रिय करें',
      Activate: 'सक्रिय करें',
      'Wallet indexing is inactive': 'वॉलेट इंडेक्सिंग निष्क्रिय है',
      'Activate indexing to save new activity on this device':
        'इस डिवाइस पर नई गतिविधि सहेजने के लिए इंडेक्सिंग सक्रिय करें',
    },
    settings: {
      'Activating wallet indexing': 'वॉलेट इंडेक्सिंग सक्रिय की जा रही है',
    },
  },
  id: {
    common: {
      'Wallet indexing': 'Pengindeksan dompet',
      'Could not activate wallet indexing': 'Tidak dapat mengaktifkan pengindeksan dompet',
      'Activate wallet indexing for {{network}}': 'Aktifkan pengindeksan dompet untuk {{network}}',
      Activate: 'Aktifkan',
      'Wallet indexing is inactive': 'Pengindeksan dompet tidak aktif',
      'Activate indexing to save new activity on this device':
        'Aktifkan pengindeksan untuk menyimpan aktivitas baru di perangkat ini',
    },
    settings: {
      'Activating wallet indexing': 'Mengaktifkan pengindeksan dompet',
    },
  },
  it: {
    common: {
      'Wallet indexing': 'Indicizzazione del portafoglio',
      'Could not activate wallet indexing': 'Impossibile attivare l’indicizzazione del portafoglio',
      'Activate wallet indexing for {{network}}': 'Attiva l’indicizzazione del portafoglio per {{network}}',
      Activate: 'Attiva',
      'Wallet indexing is inactive': 'L’indicizzazione del portafoglio non è attiva',
      'Activate indexing to save new activity on this device':
        'Attiva l’indicizzazione per salvare le nuove attività su questo dispositivo',
    },
    settings: {
      'Activating wallet indexing': 'Attivazione dell’indicizzazione del portafoglio',
    },
  },
  pt: {
    common: {
      'Wallet indexing': 'Indexação da carteira',
      'Could not activate wallet indexing': 'Não foi possível ativar a indexação da carteira',
      'Activate wallet indexing for {{network}}': 'Ativar indexação da carteira para {{network}}',
      Activate: 'Ativar',
      'Wallet indexing is inactive': 'A indexação da carteira está inativa',
      'Activate indexing to save new activity on this device':
        'Ative a indexação para salvar novas atividades neste dispositivo',
    },
    settings: {
      'Activating wallet indexing': 'Ativando indexação da carteira',
    },
  },
  ru: {
    common: {
      'Wallet indexing': 'Индексирование кошелька',
      'Could not activate wallet indexing': 'Не удалось активировать индексирование кошелька',
      'Activate wallet indexing for {{network}}': 'Активировать индексирование кошелька для {{network}}',
      Activate: 'Активировать',
      'Wallet indexing is inactive': 'Индексирование кошелька неактивно',
      'Activate indexing to save new activity on this device':
        'Активируйте индексирование, чтобы сохранять новую активность на этом устройстве',
    },
    settings: {
      'Activating wallet indexing': 'Активация индексирования кошелька',
    },
  },
  ur: {
    common: {
      'Wallet indexing': 'والیٹ انڈیکسنگ',
      'Could not activate wallet indexing': 'والیٹ انڈیکسنگ فعال نہیں کی جا سکی',
      'Activate wallet indexing for {{network}}': '{{network}} کے لیے والیٹ انڈیکسنگ فعال کریں',
      Activate: 'فعال کریں',
      'Wallet indexing is inactive': 'والیٹ انڈیکسنگ غیر فعال ہے',
      'Activate indexing to save new activity on this device':
        'اس آلے پر نئی سرگرمی محفوظ کرنے کے لیے انڈیکسنگ فعال کریں',
    },
    settings: {
      'Activating wallet indexing': 'والیٹ انڈیکسنگ فعال کی جا رہی ہے',
    },
  },
  'zh-Hans': {
    common: {
      'Wallet indexing': '钱包索引',
      'Could not activate wallet indexing': '无法启用钱包索引',
      'Activate wallet indexing for {{network}}': '为 {{network}} 启用钱包索引',
      Activate: '启用',
      'Wallet indexing is inactive': '钱包索引未启用',
      'Activate indexing to save new activity on this device':
        '启用索引以将新活动保存在此设备上',
    },
    settings: {
      'Activating wallet indexing': '正在启用钱包索引',
    },
  },
}

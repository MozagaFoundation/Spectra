/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LanguageTranslations } from '../schema'

type FeatureLanguage =
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

type FeatureNamespaceTranslations = Partial<LanguageTranslations>

export const localProfileVdfTranslations: Record<
  FeatureLanguage,
  FeatureNamespaceTranslations
> = {
  en: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250,000 complete VDF iterations; target solve time: 12 seconds.',
      'Calibration failed. Confirm that this is a native release build.':
        'Calibration failed. Confirm that this is a native release build.',
      'Candidate: {{value}} iterations': 'Candidate: {{value}} iterations',
      'Cancel calibration': 'Cancel calibration',
      'Local-only benchmark': 'Local-only benchmark',
      'No calibration modulus is configured.': 'No calibration modulus is configured.',
      'Rate: {{value}} iterations/second': 'Rate: {{value}} iterations/second',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.',
      'Run calibration': 'Run calibration',
      Sample: 'Sample',
      'Sample: {{value}} ms': 'Sample: {{value}} ms',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.',
      'VDF calibration': 'VDF calibration',
    },
    auth: {
      'Choose a Contact Name': 'Choose a Contact Name',
      'Contact profile name': 'Contact profile name',
      'Contact profile name is invalid.': 'Contact profile name is invalid.',
      'Optional name for chats': 'Optional name for chats',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Contact profile data cannot be edited while Spectre Mode is active.',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Contact profile data is read-only while Spectre Mode is active.',
      'Contact profile name': 'Contact profile name',
      'Contact profile name is invalid.': 'Contact profile name is invalid.',
      'Name shared with your contacts': 'Name shared with your contacts',
      'Save profile name': 'Save profile name',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'Stored locally and shared only with people who add you. Discovery leases never include this profile.',
    },
  },
  ar: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250,000 تكرار VDF كامل؛ زمن الحل المستهدف: 12 ثانية.',
      'Calibration failed. Confirm that this is a native release build.':
        'فشلت المعايرة. تأكد من أن هذا إصدار أصلي للإنتاج.',
      'Candidate: {{value}} iterations': 'المرشح: {{value}} تكرار',
      'Cancel calibration': 'إلغاء المعايرة',
      'Local-only benchmark': 'اختبار أداء محلي فقط',
      'No calibration modulus is configured.': 'لم يتم تكوين معامل للمعايرة.',
      'Rate: {{value}} iterations/second': 'المعدل: {{value}} تكرار/ثانية',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'أعد البناء مع تعيين EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX إلى معامل RSA العام المقصود.',
      'Run calibration': 'تشغيل المعايرة',
      Sample: 'عينة',
      'Sample: {{value}} ms': 'العينة: {{value}} مللي ثانية',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'يشغّل هذا عينة تربيع متتابع أصلية على هذا الجهاز. لا يرفع الجهاز أو يخزّنه أو يعرّفه.',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'استخدم المرشح من أبطأ جهاز إصدار مدعوم، ثم أكّده بحل VDF كامل قبل النشر.',
      'VDF calibration': 'معايرة VDF',
    },
    auth: {
      'Choose a Contact Name': 'اختر اسم جهة اتصال',
      'Contact profile name': 'اسم ملف جهة الاتصال',
      'Contact profile name is invalid.': 'اسم ملف جهة الاتصال غير صالح.',
      'Optional name for chats': 'اسم اختياري للمحادثات',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'يُخزَّن هذا الاسم الاختياري على هذا الجهاز ولا يُشارك إلا مع الأشخاص الذين يضيفونك. يمكنك تغييره أو إزالته لاحقًا.',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'اسم جهة اتصالك ليس بيانات تعريف عامة للدليل. يُشارك في تبادلات جهات الاتصال المشفرة ولا يُدرج في عبارة الاسترداد.',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'لا يمكن تعديل بيانات ملف جهة الاتصال أثناء تفعيل وضع Spectre.',
      'Contact profile data is read-only while Spectre Mode is active.':
        'بيانات ملف جهة الاتصال للقراءة فقط أثناء تفعيل وضع Spectre.',
      'Contact profile name': 'اسم ملف جهة الاتصال',
      'Contact profile name is invalid.': 'اسم ملف جهة الاتصال غير صالح.',
      'Name shared with your contacts': 'الاسم المشترك مع جهات اتصالك',
      'Save profile name': 'حفظ اسم الملف',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'يُخزَّن محليًا ولا يُشارك إلا مع الأشخاص الذين يضيفونك. لا تتضمن صلاحيات الاكتشاف هذا الملف مطلقًا.',
    },
  },
  bn: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250,000টি সম্পূর্ণ VDF পুনরাবৃত্তি; লক্ষ্য সমাধান সময়: 12 সেকেন্ড।',
      'Calibration failed. Confirm that this is a native release build.':
        'ক্যালিব্রেশন ব্যর্থ হয়েছে। এটি একটি নেটিভ রিলিজ বিল্ড কিনা নিশ্চিত করুন।',
      'Candidate: {{value}} iterations': 'প্রার্থী: {{value}} পুনরাবৃত্তি',
      'Cancel calibration': 'ক্যালিব্রেশন বাতিল করুন',
      'Local-only benchmark': 'শুধু স্থানীয় বেঞ্চমার্ক',
      'No calibration modulus is configured.': 'কোনো ক্যালিব্রেশন মডুলাস কনফিগার করা নেই।',
      'Rate: {{value}} iterations/second': 'হার: {{value}} পুনরাবৃত্তি/সেকেন্ড',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'উদ্দেশ্যকৃত পাবলিক RSA মডুলাসে EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX সেট করে পুনরায় বিল্ড করুন।',
      'Run calibration': 'ক্যালিব্রেশন চালান',
      Sample: 'নমুনা',
      'Sample: {{value}} ms': 'নমুনা: {{value}} মি.সে.',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'এটি এই ডিভাইসে একটি নেটিভ ক্রমিক-বর্গ নমুনা চালায়। এটি ডিভাইস আপলোড, সংরক্ষণ বা শনাক্ত করে না।',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'সমর্থিত সবচেয়ে ধীর রিলিজ ডিভাইসের প্রার্থী ব্যবহার করুন, তারপর মোতায়েনের আগে একটি সম্পূর্ণ VDF সমাধানের মাধ্যমে নিশ্চিত করুন।',
      'VDF calibration': 'VDF ক্যালিব্রেশন',
    },
    auth: {
      'Choose a Contact Name': 'একটি যোগাযোগের নাম বেছে নিন',
      'Contact profile name': 'যোগাযোগ প্রোফাইলের নাম',
      'Contact profile name is invalid.': 'যোগাযোগ প্রোফাইলের নামটি অবৈধ।',
      'Optional name for chats': 'চ্যাটের জন্য ঐচ্ছিক নাম',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'এই ঐচ্ছিক নামটি এই ডিভাইসে সংরক্ষিত থাকে এবং যারা আপনাকে যোগ করে তাদের সঙ্গেই ভাগ করা হয়। আপনি পরে এটি পরিবর্তন বা সরাতে পারেন।',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'আপনার যোগাযোগের নাম সর্বজনীন ডিরেক্টরি মেটাডেটা নয়। এটি এনক্রিপ্ট করা যোগাযোগ বিনিময়ে ভাগ করা হয় এবং আপনার পুনরুদ্ধার বাক্যে অন্তর্ভুক্ত নয়।',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Spectre মোড সক্রিয় থাকলে যোগাযোগ প্রোফাইলের ডেটা সম্পাদনা করা যায় না।',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Spectre মোড সক্রিয় থাকলে যোগাযোগ প্রোফাইলের ডেটা শুধু-পঠনযোগ্য।',
      'Contact profile name': 'যোগাযোগ প্রোফাইলের নাম',
      'Contact profile name is invalid.': 'যোগাযোগ প্রোফাইলের নামটি অবৈধ।',
      'Name shared with your contacts': 'আপনার যোগাযোগগুলোর সঙ্গে ভাগ করা নাম',
      'Save profile name': 'প্রোফাইলের নাম সংরক্ষণ করুন',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'স্থানীয়ভাবে সংরক্ষিত এবং যারা আপনাকে যোগ করে তাদের সঙ্গেই ভাগ করা হয়। আবিষ্কার লিজে কখনও এই প্রোফাইল অন্তর্ভুক্ত থাকে না।',
    },
  },
  de: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250.000 vollständige VDF-Iterationen; angestrebte Lösungszeit: 12 Sekunden.',
      'Calibration failed. Confirm that this is a native release build.':
        'Die Kalibrierung ist fehlgeschlagen. Bestätige, dass dies ein nativer Release-Build ist.',
      'Candidate: {{value}} iterations': 'Kandidat: {{value}} Iterationen',
      'Cancel calibration': 'Kalibrierung abbrechen',
      'Local-only benchmark': 'Nur lokaler Benchmark',
      'No calibration modulus is configured.': 'Es ist kein Kalibrierungsmodul konfiguriert.',
      'Rate: {{value}} iterations/second': 'Rate: {{value}} Iterationen/Sekunde',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'Erstelle die App erneut mit EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX für den vorgesehenen öffentlichen RSA-Modulus.',
      'Run calibration': 'Kalibrierung starten',
      Sample: 'Probe',
      'Sample: {{value}} ms': 'Probe: {{value}} ms',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'Dies führt auf diesem Gerät eine native Probe mit sequenziellem Quadrieren aus. Das Gerät wird weder hochgeladen, gespeichert noch identifiziert.',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'Verwende den Kandidaten des langsamsten unterstützten Release-Geräts und bestätige ihn vor der Bereitstellung mit einer vollständigen VDF-Lösung.',
      'VDF calibration': 'VDF-Kalibrierung',
    },
    auth: {
      'Choose a Contact Name': 'Kontaktnamen wählen',
      'Contact profile name': 'Kontaktprofilname',
      'Contact profile name is invalid.': 'Der Kontaktprofilname ist ungültig.',
      'Optional name for chats': 'Optionaler Name für Chats',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'Dieser optionale Name wird auf diesem Gerät gespeichert und nur mit Personen geteilt, die dich hinzufügen. Du kannst ihn später ändern oder entfernen.',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'Dein Kontaktname ist kein öffentliches Verzeichnis-Metadatum. Er wird in verschlüsselten Kontaktaustauschen geteilt und ist nicht in deiner Wiederherstellungsphrase enthalten.',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Kontaktprofildaten können nicht bearbeitet werden, während der Spectre-Modus aktiv ist.',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Kontaktprofildaten sind schreibgeschützt, während der Spectre-Modus aktiv ist.',
      'Contact profile name': 'Kontaktprofilname',
      'Contact profile name is invalid.': 'Der Kontaktprofilname ist ungültig.',
      'Name shared with your contacts': 'Mit deinen Kontakten geteilter Name',
      'Save profile name': 'Profilnamen speichern',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'Lokal gespeichert und nur mit Personen geteilt, die dich hinzufügen. Discovery-Leases enthalten dieses Profil nie.',
    },
  },
  es: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250.000 iteraciones VDF completas; tiempo objetivo de resolución: 12 segundos.',
      'Calibration failed. Confirm that this is a native release build.':
        'La calibración falló. Confirma que esta es una compilación nativa de lanzamiento.',
      'Candidate: {{value}} iterations': 'Candidato: {{value}} iteraciones',
      'Cancel calibration': 'Cancelar calibración',
      'Local-only benchmark': 'Prueba de rendimiento solo local',
      'No calibration modulus is configured.': 'No se ha configurado un módulo de calibración.',
      'Rate: {{value}} iterations/second': 'Velocidad: {{value}} iteraciones/segundo',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'Vuelve a compilar con EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX configurado con el módulo RSA público previsto.',
      'Run calibration': 'Ejecutar calibración',
      Sample: 'Muestra',
      'Sample: {{value}} ms': 'Muestra: {{value}} ms',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'Esto ejecuta una muestra nativa de cuadrados secuenciales en este dispositivo. No carga, almacena ni identifica el dispositivo.',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'Usa el candidato del dispositivo de lanzamiento compatible más lento y luego confírmalo con una resolución VDF completa antes de la implementación.',
      'VDF calibration': 'Calibración VDF',
    },
    auth: {
      'Choose a Contact Name': 'Elige un nombre de contacto',
      'Contact profile name': 'Nombre del perfil de contacto',
      'Contact profile name is invalid.': 'El nombre del perfil de contacto no es válido.',
      'Optional name for chats': 'Nombre opcional para chats',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'Este nombre opcional se almacena en este dispositivo y solo se comparte con las personas que te agregan. Puedes cambiarlo o eliminarlo más adelante.',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'Tu nombre de contacto no son metadatos públicos del directorio. Se comparte en intercambios de contactos cifrados y no está incluido en tu frase de recuperación.',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Los datos del perfil de contacto no se pueden editar mientras el modo Spectre está activo.',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Los datos del perfil de contacto son de solo lectura mientras el modo Spectre está activo.',
      'Contact profile name': 'Nombre del perfil de contacto',
      'Contact profile name is invalid.': 'El nombre del perfil de contacto no es válido.',
      'Name shared with your contacts': 'Nombre compartido con tus contactos',
      'Save profile name': 'Guardar nombre del perfil',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'Se almacena localmente y solo se comparte con las personas que te agregan. Las concesiones de descubrimiento nunca incluyen este perfil.',
    },
  },
  fr: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250 000 itérations VDF complètes ; durée de résolution cible : 12 secondes.',
      'Calibration failed. Confirm that this is a native release build.':
        'L’étalonnage a échoué. Vérifiez qu’il s’agit d’une version native de production.',
      'Candidate: {{value}} iterations': 'Candidat : {{value}} itérations',
      'Cancel calibration': 'Annuler l’étalonnage',
      'Local-only benchmark': 'Test de performance local uniquement',
      'No calibration modulus is configured.': 'Aucun module d’étalonnage n’est configuré.',
      'Rate: {{value}} iterations/second': 'Cadence : {{value}} itérations/seconde',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'Reconstruisez avec EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX défini sur le module RSA public prévu.',
      'Run calibration': 'Lancer l’étalonnage',
      Sample: 'Échantillon',
      'Sample: {{value}} ms': 'Échantillon : {{value}} ms',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'Cette opération exécute un échantillon natif de mises au carré séquentielles sur cet appareil. Elle ne téléverse, ne stocke ni n’identifie l’appareil.',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'Utilisez le candidat de l’appareil de production pris en charge le plus lent, puis confirmez-le avec une résolution VDF complète avant le déploiement.',
      'VDF calibration': 'Étalonnage VDF',
    },
    auth: {
      'Choose a Contact Name': 'Choisir un nom de contact',
      'Contact profile name': 'Nom du profil de contact',
      'Contact profile name is invalid.': 'Le nom du profil de contact est invalide.',
      'Optional name for chats': 'Nom facultatif pour les discussions',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'Ce nom facultatif est stocké sur cet appareil et partagé uniquement avec les personnes qui vous ajoutent. Vous pourrez le modifier ou le supprimer plus tard.',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'Votre nom de contact n’est pas une métadonnée publique de répertoire. Il est partagé dans des échanges de contacts chiffrés et n’est pas inclus dans votre phrase de récupération.',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Les données du profil de contact ne peuvent pas être modifiées lorsque le mode Spectre est actif.',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Les données du profil de contact sont en lecture seule lorsque le mode Spectre est actif.',
      'Contact profile name': 'Nom du profil de contact',
      'Contact profile name is invalid.': 'Le nom du profil de contact est invalide.',
      'Name shared with your contacts': 'Nom partagé avec vos contacts',
      'Save profile name': 'Enregistrer le nom du profil',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'Stocké localement et partagé uniquement avec les personnes qui vous ajoutent. Les baux de découverte n’incluent jamais ce profil.',
    },
  },
  hi: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250,000 पूर्ण VDF पुनरावृत्तियाँ; लक्ष्य समाधान समय: 12 सेकंड।',
      'Calibration failed. Confirm that this is a native release build.':
        'कैलिब्रेशन विफल रहा। पुष्टि करें कि यह एक नेटिव रिलीज़ बिल्ड है।',
      'Candidate: {{value}} iterations': 'उम्मीदवार: {{value}} पुनरावृत्तियाँ',
      'Cancel calibration': 'कैलिब्रेशन रद्द करें',
      'Local-only benchmark': 'केवल स्थानीय बेंचमार्क',
      'No calibration modulus is configured.': 'कोई कैलिब्रेशन मॉड्यूलस कॉन्फ़िगर नहीं है।',
      'Rate: {{value}} iterations/second': 'दर: {{value}} पुनरावृत्तियाँ/सेकंड',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'इच्छित सार्वजनिक RSA मॉड्यूलस पर EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX सेट करके पुनः बिल्ड करें।',
      'Run calibration': 'कैलिब्रेशन चलाएँ',
      Sample: 'नमूना',
      'Sample: {{value}} ms': 'नमूना: {{value}} मि.से.',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'यह इस डिवाइस पर मूल अनुक्रमिक-वर्गीकरण नमूना चलाता है। यह डिवाइस को अपलोड, संग्रहीत या पहचानता नहीं है।',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'सबसे धीमे समर्थित रिलीज़ डिवाइस के उम्मीदवार का उपयोग करें, फिर परिनियोजन से पहले एक पूर्ण VDF समाधान से इसकी पुष्टि करें।',
      'VDF calibration': 'VDF कैलिब्रेशन',
    },
    auth: {
      'Choose a Contact Name': 'संपर्क नाम चुनें',
      'Contact profile name': 'संपर्क प्रोफ़ाइल नाम',
      'Contact profile name is invalid.': 'संपर्क प्रोफ़ाइल नाम अमान्य है।',
      'Optional name for chats': 'चैट के लिए वैकल्पिक नाम',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'यह वैकल्पिक नाम इस डिवाइस पर संग्रहीत रहता है और केवल उन लोगों के साथ साझा होता है जो आपको जोड़ते हैं। आप इसे बाद में बदल या हटा सकते हैं।',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'आपका संपर्क नाम सार्वजनिक निर्देशिका मेटाडेटा नहीं है। इसे एन्क्रिप्टेड संपर्क आदान-प्रदान में साझा किया जाता है और यह आपके पुनर्प्राप्ति वाक्यांश में शामिल नहीं है।',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Spectre मोड सक्रिय होने पर संपर्क प्रोफ़ाइल डेटा संपादित नहीं किया जा सकता।',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Spectre मोड सक्रिय होने पर संपर्क प्रोफ़ाइल डेटा केवल पढ़ने योग्य है।',
      'Contact profile name': 'संपर्क प्रोफ़ाइल नाम',
      'Contact profile name is invalid.': 'संपर्क प्रोफ़ाइल नाम अमान्य है।',
      'Name shared with your contacts': 'आपके संपर्कों के साथ साझा किया गया नाम',
      'Save profile name': 'प्रोफ़ाइल नाम सहेजें',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'स्थानीय रूप से संग्रहीत और केवल उन लोगों के साथ साझा किया जाता है जो आपको जोड़ते हैं। डिस्कवरी लीज़ में यह प्रोफ़ाइल कभी शामिल नहीं होती।',
    },
  },
  id: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250.000 iterasi VDF lengkap; waktu penyelesaian target: 12 detik.',
      'Calibration failed. Confirm that this is a native release build.':
        'Kalibrasi gagal. Pastikan ini adalah build rilis native.',
      'Candidate: {{value}} iterations': 'Kandidat: {{value}} iterasi',
      'Cancel calibration': 'Batalkan kalibrasi',
      'Local-only benchmark': 'Tolok ukur khusus lokal',
      'No calibration modulus is configured.': 'Tidak ada modulus kalibrasi yang dikonfigurasi.',
      'Rate: {{value}} iterations/second': 'Laju: {{value}} iterasi/detik',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'Build ulang dengan EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX diatur ke modulus RSA publik yang dimaksud.',
      'Run calibration': 'Jalankan kalibrasi',
      Sample: 'Sampel',
      'Sample: {{value}} ms': 'Sampel: {{value}} md',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'Ini menjalankan sampel kuadrat berurutan native di perangkat ini. Ini tidak mengunggah, menyimpan, atau mengidentifikasi perangkat.',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'Gunakan kandidat dari perangkat rilis yang didukung paling lambat, lalu konfirmasikan dengan satu penyelesaian VDF penuh sebelum penerapan.',
      'VDF calibration': 'Kalibrasi VDF',
    },
    auth: {
      'Choose a Contact Name': 'Pilih Nama Kontak',
      'Contact profile name': 'Nama profil kontak',
      'Contact profile name is invalid.': 'Nama profil kontak tidak valid.',
      'Optional name for chats': 'Nama opsional untuk chat',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'Nama opsional ini disimpan di perangkat ini dan hanya dibagikan dengan orang yang menambahkan Anda. Anda dapat mengubah atau menghapusnya nanti.',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'Nama kontak Anda bukan metadata direktori publik. Nama ini dibagikan dalam pertukaran kontak terenkripsi dan tidak disertakan dalam frasa pemulihan Anda.',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Data profil kontak tidak dapat diedit saat Mode Spectre aktif.',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Data profil kontak hanya-baca saat Mode Spectre aktif.',
      'Contact profile name': 'Nama profil kontak',
      'Contact profile name is invalid.': 'Nama profil kontak tidak valid.',
      'Name shared with your contacts': 'Nama yang dibagikan dengan kontak Anda',
      'Save profile name': 'Simpan nama profil',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'Disimpan secara lokal dan hanya dibagikan dengan orang yang menambahkan Anda. Masa sewa penemuan tidak pernah menyertakan profil ini.',
    },
  },
  it: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250.000 iterazioni VDF complete; tempo di risoluzione previsto: 12 secondi.',
      'Calibration failed. Confirm that this is a native release build.':
        'Calibrazione non riuscita. Verifica che si tratti di una build nativa di rilascio.',
      'Candidate: {{value}} iterations': 'Candidato: {{value}} iterazioni',
      'Cancel calibration': 'Annulla calibrazione',
      'Local-only benchmark': 'Benchmark solo locale',
      'No calibration modulus is configured.': 'Nessun modulo di calibrazione configurato.',
      'Rate: {{value}} iterations/second': 'Velocità: {{value}} iterazioni/secondo',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'Ricompila con EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX impostato sul modulo RSA pubblico previsto.',
      'Run calibration': 'Avvia calibrazione',
      Sample: 'Campione',
      'Sample: {{value}} ms': 'Campione: {{value}} ms',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'Esegue su questo dispositivo un campione nativo di quadratura sequenziale. Non carica, memorizza né identifica il dispositivo.',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'Usa il candidato del dispositivo di rilascio supportato più lento, poi confermalo con una risoluzione VDF completa prima della distribuzione.',
      'VDF calibration': 'Calibrazione VDF',
    },
    auth: {
      'Choose a Contact Name': 'Scegli un nome di contatto',
      'Contact profile name': 'Nome del profilo del contatto',
      'Contact profile name is invalid.': 'Il nome del profilo del contatto non è valido.',
      'Optional name for chats': 'Nome facoltativo per le chat',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'Questo nome facoltativo è memorizzato su questo dispositivo e condiviso solo con le persone che ti aggiungono. Puoi modificarlo o rimuoverlo in seguito.',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'Il tuo nome di contatto non è metadato pubblico della directory. Viene condiviso in scambi di contatti cifrati e non è incluso nella frase di recupero.',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'I dati del profilo del contatto non possono essere modificati mentre la modalità Spectre è attiva.',
      'Contact profile data is read-only while Spectre Mode is active.':
        'I dati del profilo del contatto sono di sola lettura mentre la modalità Spectre è attiva.',
      'Contact profile name': 'Nome del profilo del contatto',
      'Contact profile name is invalid.': 'Il nome del profilo del contatto non è valido.',
      'Name shared with your contacts': 'Nome condiviso con i tuoi contatti',
      'Save profile name': 'Salva nome del profilo',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'Memorizzato localmente e condiviso solo con le persone che ti aggiungono. I lease di individuazione non includono mai questo profilo.',
    },
  },
  pt: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250.000 iterações VDF completas; tempo de resolução alvo: 12 segundos.',
      'Calibration failed. Confirm that this is a native release build.':
        'A calibração falhou. Confirme que esta é uma compilação nativa de lançamento.',
      'Candidate: {{value}} iterations': 'Candidato: {{value}} iterações',
      'Cancel calibration': 'Cancelar calibração',
      'Local-only benchmark': 'Teste de desempenho apenas local',
      'No calibration modulus is configured.': 'Nenhum módulo de calibração está configurado.',
      'Rate: {{value}} iterations/second': 'Taxa: {{value}} iterações/segundo',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'Compile novamente com EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX definido para o módulo RSA público pretendido.',
      'Run calibration': 'Executar calibração',
      Sample: 'Amostra',
      'Sample: {{value}} ms': 'Amostra: {{value}} ms',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'Isto executa uma amostra nativa de quadratura sequencial neste dispositivo. Não carrega, armazena nem identifica o dispositivo.',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'Use o candidato do dispositivo de lançamento compatível mais lento e confirme-o com uma resolução VDF completa antes da implantação.',
      'VDF calibration': 'Calibração VDF',
    },
    auth: {
      'Choose a Contact Name': 'Escolha um nome de contato',
      'Contact profile name': 'Nome do perfil de contato',
      'Contact profile name is invalid.': 'O nome do perfil de contato é inválido.',
      'Optional name for chats': 'Nome opcional para conversas',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'Este nome opcional é armazenado neste dispositivo e compartilhado apenas com pessoas que adicionam você. Você pode alterá-lo ou removê-lo depois.',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'Seu nome de contato não é metadado público de diretório. Ele é compartilhado em trocas de contatos criptografadas e não está incluído na sua frase de recuperação.',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Os dados do perfil de contato não podem ser editados enquanto o modo Spectre está ativo.',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Os dados do perfil de contato são somente leitura enquanto o modo Spectre está ativo.',
      'Contact profile name': 'Nome do perfil de contato',
      'Contact profile name is invalid.': 'O nome do perfil de contato é inválido.',
      'Name shared with your contacts': 'Nome compartilhado com seus contatos',
      'Save profile name': 'Salvar nome do perfil',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'Armazenado localmente e compartilhado apenas com pessoas que adicionam você. As concessões de descoberta nunca incluem este perfil.',
    },
  },
  ru: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250 000 полных итераций VDF; целевое время решения: 12 секунд.',
      'Calibration failed. Confirm that this is a native release build.':
        'Калибровка не удалась. Убедитесь, что это нативная сборка для выпуска.',
      'Candidate: {{value}} iterations': 'Кандидат: {{value}} итераций',
      'Cancel calibration': 'Отменить калибровку',
      'Local-only benchmark': 'Тест производительности только на устройстве',
      'No calibration modulus is configured.': 'Модуль для калибровки не настроен.',
      'Rate: {{value}} iterations/second': 'Скорость: {{value}} итераций/секунду',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'Пересоберите приложение, задав EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX для требуемого публичного модуля RSA.',
      'Run calibration': 'Запустить калибровку',
      Sample: 'Образец',
      'Sample: {{value}} ms': 'Образец: {{value}} мс',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'На этом устройстве выполняется нативный образец последовательного возведения в квадрат. Устройство не загружается, не сохраняется и не идентифицируется.',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'Используйте кандидат с самого медленного поддерживаемого устройства выпуска, затем подтвердите его полным решением VDF перед развёртыванием.',
      'VDF calibration': 'Калибровка VDF',
    },
    auth: {
      'Choose a Contact Name': 'Выберите имя контакта',
      'Contact profile name': 'Имя профиля контакта',
      'Contact profile name is invalid.': 'Имя профиля контакта недопустимо.',
      'Optional name for chats': 'Необязательное имя для чатов',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'Это необязательное имя хранится на этом устройстве и передаётся только людям, которые добавляют вас. Позже его можно изменить или удалить.',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'Ваше имя контакта не является общедоступными метаданными каталога. Оно передаётся в зашифрованном обмене контактами и не включено в фразу восстановления.',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Данные профиля контакта нельзя редактировать, пока активен режим Spectre.',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Данные профиля контакта доступны только для чтения, пока активен режим Spectre.',
      'Contact profile name': 'Имя профиля контакта',
      'Contact profile name is invalid.': 'Имя профиля контакта недопустимо.',
      'Name shared with your contacts': 'Имя, передаваемое вашим контактам',
      'Save profile name': 'Сохранить имя профиля',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'Хранится локально и передаётся только людям, которые добавляют вас. Аренды обнаружения никогда не включают этот профиль.',
    },
  },
  ur: {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250,000 مکمل VDF تکرار؛ ہدف حل کا وقت: 12 سیکنڈ۔',
      'Calibration failed. Confirm that this is a native release build.':
        'کیلیبریشن ناکام ہو گئی۔ تصدیق کریں کہ یہ مقامی ریلیز بلڈ ہے۔',
      'Candidate: {{value}} iterations': 'امیدوار: {{value}} تکرار',
      'Cancel calibration': 'کیلیبریشن منسوخ کریں',
      'Local-only benchmark': 'صرف مقامی بینچ مارک',
      'No calibration modulus is configured.': 'کوئی کیلیبریشن موڈیولس ترتیب نہیں دیا گیا۔',
      'Rate: {{value}} iterations/second': 'رفتار: {{value}} تکرار/سیکنڈ',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        'EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX کو مطلوبہ عوامی RSA موڈیولس پر سیٹ کر کے دوبارہ بنائیں۔',
      'Run calibration': 'کیلیبریشن چلائیں',
      Sample: 'نمونہ',
      'Sample: {{value}} ms': 'نمونہ: {{value}} ملی سیکنڈ',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        'یہ اس آلے پر مقامی ترتیبی مربع سازی کا نمونہ چلاتا ہے۔ یہ آلے کو اپ لوڈ، ذخیرہ یا شناخت نہیں کرتا۔',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        'سب سے سست معاون ریلیز ڈیوائس کا امیدوار استعمال کریں، پھر تعیناتی سے پہلے اسے ایک مکمل VDF حل سے تصدیق کریں۔',
      'VDF calibration': 'VDF کیلیبریشن',
    },
    auth: {
      'Choose a Contact Name': 'رابطے کا نام منتخب کریں',
      'Contact profile name': 'رابطہ پروفائل کا نام',
      'Contact profile name is invalid.': 'رابطہ پروفائل کا نام غلط ہے۔',
      'Optional name for chats': 'چیٹس کے لیے اختیاری نام',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        'یہ اختیاری نام اس آلے پر محفوظ ہوتا ہے اور صرف ان لوگوں کے ساتھ شیئر کیا جاتا ہے جو آپ کو شامل کرتے ہیں۔ آپ اسے بعد میں تبدیل یا ہٹا سکتے ہیں۔',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        'آپ کا رابطے کا نام عوامی ڈائریکٹری میٹا ڈیٹا نہیں ہے۔ یہ خفیہ کردہ رابطہ تبادلوں میں شیئر ہوتا ہے اور آپ کے بازیابی فقرے میں شامل نہیں ہے۔',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Spectre موڈ فعال ہونے پر رابطہ پروفائل کا ڈیٹا ترمیم نہیں کیا جا سکتا۔',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Spectre موڈ فعال ہونے پر رابطہ پروفائل کا ڈیٹا صرف پڑھنے کے لیے ہے۔',
      'Contact profile name': 'رابطہ پروفائل کا نام',
      'Contact profile name is invalid.': 'رابطہ پروفائل کا نام غلط ہے۔',
      'Name shared with your contacts': 'آپ کے رابطوں کے ساتھ شیئر کیا گیا نام',
      'Save profile name': 'پروفائل نام محفوظ کریں',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        'مقامی طور پر محفوظ اور صرف ان لوگوں کے ساتھ شیئر کیا جاتا ہے جو آپ کو شامل کرتے ہیں۔ دریافت کی لیز میں یہ پروفائل کبھی شامل نہیں ہوتا۔',
    },
  },
  'zh-Hans': {
    common: {
      '250,000 complete VDF iterations; target solve time: 12 seconds.':
        '250,000 次完整 VDF 迭代；目标求解时间：12 秒。',
      'Calibration failed. Confirm that this is a native release build.':
        '校准失败。请确认这是原生发布构建。',
      'Candidate: {{value}} iterations': '候选值：{{value}} 次迭代',
      'Cancel calibration': '取消校准',
      'Local-only benchmark': '仅本地基准测试',
      'No calibration modulus is configured.': '未配置校准模数。',
      'Rate: {{value}} iterations/second': '速率：{{value}} 次迭代/秒',
      'Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.':
        '请使用设为预期公开 RSA 模数的 EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX 重新构建。',
      'Run calibration': '运行校准',
      Sample: '样本',
      'Sample: {{value}} ms': '样本：{{value}} 毫秒',
      'This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.':
        '这会在此设备上运行原生顺序平方样本。它不会上传、存储或识别该设备。',
      'Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.':
        '使用最慢的受支持发布设备的候选值，然后在部署前通过一次完整的 VDF 求解进行确认。',
      'VDF calibration': 'VDF 校准',
    },
    auth: {
      'Choose a Contact Name': '选择联系人名称',
      'Contact profile name': '联系人资料名称',
      'Contact profile name is invalid.': '联系人资料名称无效。',
      'Optional name for chats': '聊天的可选名称',
      'This optional name is stored on this device and shared only with people who add you. You can change or remove it later.':
        '此可选名称存储在此设备上，仅与添加您的人共享。您以后可以更改或删除它。',
      'Your contact name is not public directory metadata. It is shared in encrypted contact exchanges and is not included in your recovery phrase.':
        '您的联系人名称不是公共目录元数据。它会在加密联系人交换中共享，且不包含在您的恢复短语中。',
    },
    profile: {
      'Contact profile data cannot be edited while Spectre Mode is active.':
        'Spectre 模式启用时，无法编辑联系人资料数据。',
      'Contact profile data is read-only while Spectre Mode is active.':
        'Spectre 模式启用时，联系人资料数据为只读。',
      'Contact profile name': '联系人资料名称',
      'Contact profile name is invalid.': '联系人资料名称无效。',
      'Name shared with your contacts': '与您的联系人共享的名称',
      'Save profile name': '保存资料名称',
      'Stored locally and shared only with people who add you. Discovery leases never include this profile.':
        '仅在本地存储，并只与添加您的人共享。发现租约绝不会包含此资料。',
    },
  },
}

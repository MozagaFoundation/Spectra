/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LocaleTranslationOverrides } from './translationOverrideTypes'

const translations = {
  common: {
    'Creating your post-quantum identity...': 'جارٍ إنشاء هويتك ما بعد الكم...',
    'Encrypted group sender keys': 'مفاتيح مُرسِل المجموعة المشفّرة',
    'End-to-end encrypted': 'مشفّر من طرف إلى طرف',
    'End-to-end encryption available for supported chats':
      'التشفير من طرف إلى طرف متاح للمحادثات المدعومة',
    'Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.':
      'تُوزَّع مفاتيح المجموعة عبر جلساتك المباشرة المشفّرة الحالية. تؤدي إزالة عضو إلى تدوير مفتاح المجموعة النشط تلقائيًا.',
    'Hybrid post-quantum messaging': 'مراسلة هجينة ما بعد الكم',
    'ML-DSA-65 post-quantum signatures': 'توقيعات ML-DSA-65 ما بعد الكم',
    'Post-quantum': 'ما بعد الكم',
    'Post-quantum identity keys ready': 'مفاتيح الهوية ما بعد الكم جاهزة',
    'Securing your encrypted vault...': 'جارٍ تأمين خزنتك المشفّرة...',
    'Supported direct messages are end-to-end encrypted.':
      'الرسائل المباشرة المدعومة مشفّرة من طرف إلى طرف.',
    ' +{{count}} more': ' +{{count}} إضافية',
    '+ gas in': '+ رسوم الغاز بعملة',
    'Account Name (Optional)': 'اسم الحساب (اختياري)',
    'Account ready': 'الحساب جاهز',
    'Add ETH before sending this token.': 'أضف ETH قبل إرسال هذا الرمز المميز.',
    'Add text': 'إضافة نص',
    'Add user': 'إضافة مستخدم',
    'Add {{count}}': 'إضافة {{count}}',
    Allowed: 'مسموح',
    'Apply crop': 'تطبيق الاقتصاص',
    'Applying bridge configuration…': 'جارٍ تطبيق إعدادات الجسور…',
    'Applying direct Tor…': 'جارٍ تطبيق اتصال Tor المباشر…',
    'Archive Exported': 'تم تصدير الأرشيف',
    'Archive Passphrase': 'عبارة مرور الأرشيف',
    'Archive Passphrase Required': 'عبارة مرور الأرشيف مطلوبة',
    'Archives unavailable': 'الأرشيفات غير متاحة',
    'At least 16 characters': '16 حرفًا على الأقل',
    Available: 'متاح',
    'BIP39 word suggestions': 'اقتراحات كلمات BIP39',
    Back: 'رجوع',
    Block: 'حظر',
    'Block {{displayName}}? You will no longer receive messages from them.':
      'حظر {{displayName}}؟ لن تتلقى رسائل منه بعد الآن.',
    'Bridge Update Failed': 'فشل تحديث الجسور',
    Buy: 'شراء',
    'Calculated by network': 'يُحتسب بواسطة الشبكة',
    'Calls are only supported in direct chats.': 'المكالمات مدعومة في الدردشات المباشرة فقط.',
    'Calls unavailable': 'المكالمات غير متاحة',
    'Cancel Spectre Mode': 'إلغاء وضع Spectre',
    'Canceling Spectre Mode...': 'جارٍ إلغاء وضع Spectre...',
    'Chat bundle is still missing from the server.': 'لا تزال حزمة الدردشة مفقودة من الخادم.',
    'Chat identity did not finish switching. Try reconnecting.':
      'لم يكتمل تبديل هوية الدردشة. حاول إعادة الاتصال.',
    'Chat identity is not ready for this EXO account.':
      'هوية الدردشة ليست جاهزة لحساب EXO هذا.',
    'Chat unavailable': 'الدردشة غير متاحة',
    Chats: 'الدردشات',
    'Choose how long messages remain visible after they are read.':
      'اختر مدة بقاء الرسائل مرئية بعد قراءتها.',
    'Claim Refund': 'طلب استرداد الأموال',
    'Clear chat': 'مسح الدردشة',
    Close: 'إغلاق',
    'Close media preview': 'إغلاق معاينة الوسائط',
    'Close poll failed': 'فشل إغلاق الاستطلاع',
    Color: 'اللون',
    'Confirm & Send': 'تأكيد وإرسال',
    'Confirm Payment': 'تأكيد الدفع',
    'Confirm Transaction': 'تأكيد المعاملة',
    'Confirm that you backed up the recovery phrase before using this EXO account.':
      'أكد أنك احتفظت بنسخة احتياطية من عبارة الاسترداد قبل استخدام حساب EXO هذا.',
    'Connecting encrypted chat...': 'جارٍ توصيل الدردشة المشفرة...',
    'Connecting securely...': 'جارٍ الاتصال بأمان...',
    'Connecting...': 'جارٍ الاتصال...',
    'Connection failed': 'فشل الاتصال',
    'Connection problem': 'مشكلة في الاتصال',
    'Contact Archive': 'أرشيف جهات الاتصال',
    'Contact archives are unavailable for Spectre accounts.':
      'أرشيفات جهات الاتصال غير متاحة لحسابات Spectre.',
    'Contact archives are unavailable while Spectre Mode is active.':
      'أرشيفات جهات الاتصال غير متاحة أثناء تفعيل وضع Spectre.',
    'Contacts: {{contacts}}': 'جهات الاتصال: {{contacts}}',
    'Copy TX': 'نسخ المعاملة',
    'Could not add members': 'تعذرت إضافة الأعضاء',
    'Could not import shared content': 'تعذر استيراد المحتوى المشترك',
    'Could not link this chat identity to the server.':
      'تعذر ربط هوية الدردشة هذه بالخادم.',
    'Could not open this chat': 'تعذر فتح هذه الدردشة',
    'Could not open this chat.': 'تعذر فتح هذه الدردشة.',
    'Could not prepare this EXO account.': 'تعذر تجهيز حساب EXO هذا.',
    'Could not publish chat bundle.': 'تعذر نشر حزمة الدردشة.',
    'Could not save the edited image. Please try again.':
      'تعذر حفظ الصورة المعدلة. حاول مرة أخرى.',
    'Could not save your public name. Please try again.':
      'تعذر حفظ اسمك العام. حاول مرة أخرى.',
    'Could not switch EXO account': 'تعذر تبديل حساب EXO',
    'Could not switch back to the root EXO account.':
      'تعذر الرجوع إلى حساب EXO الجذر.',
    'Could not update notifications': 'تعذر تحديث الإشعارات',
    'Could not update this image. Please try again.':
      'تعذر تحديث هذه الصورة. حاول مرة أخرى.',
    'Could not verify the server session for this EXO account.':
      'تعذر التحقق من جلسة الخادم لحساب EXO هذا.',
    'Create EXO Account': 'إنشاء حساب EXO',
    'Create a new transparent EXO account for work, friends, or another chat identity.':
      'أنشئ حساب EXO شفافًا جديدًا للعمل أو الأصدقاء أو هوية دردشة أخرى.',
    Created: 'تم الإنشاء',
    Creator: 'المنشئ',
    Crop: 'اقتصاص',
    'Diffusion channels require Spectre access.': 'تتطلب قنوات البث وصول Spectre.',
    'Disappearing messages': 'الرسائل المختفية',
    'Drag text on the image to reposition it.': 'اسحب النص على الصورة لتغيير موضعه.',
    'Drag the crop frame or its corners, then apply.':
      'اسحب إطار الاقتصاص أو زواياه، ثم طبّق التغيير.',
    Draw: 'رسم',
    'ERC-20 Tokens': 'رموز ERC-20',
    'ERC-20 on Ethereum Mainnet': 'ERC-20 على شبكة Ethereum الرئيسية',
    'EXO Account {{number}}': 'حساب EXO {{number}}',
    'EXO account creation is disabled while Spectre Mode is active.':
      'إنشاء حسابات EXO معطّل أثناء تفعيل وضع Spectre.',
    'Each recovery phrase restores up to 5 transparent EXO accounts.':
      'تستعيد كل عبارة استرداد ما يصل إلى 5 حسابات EXO شفافة.',
    Edit: 'تعديل',
    'Edit and resend': 'تعديل وإعادة إرسال',
    'Edit image': 'تعديل الصورة',
    'Encrypted contact archive': 'أرشيف جهات اتصال مشفر',
    'Enter a valid EXO price greater than zero.': 'أدخل سعر EXO صالحًا أكبر من صفر.',
    'Enter a valid amount': 'أدخل مبلغًا صالحًا',
    'Erasing...': 'جارٍ المسح...',
    'Est. gas: {{amount}} {{symbol}}': 'رسوم الغاز التقديرية: {{amount}} {{symbol}}',
    'Establishing secure call...': 'جارٍ إنشاء مكالمة آمنة...',
    'Estimated fee': 'الرسوم التقديرية',
    'Export Failed': 'فشل التصدير',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'صدّر ملفًا مشفرًا تتحكم فيه، ثم استورده لاحقًا للحفاظ على جهات الاتصال المحفوظة.',
    'Export file': 'تصدير ملف',
    'Failed to Load': 'فشل التحميل',
    'Failed to claim refund': 'فشل طلب استرداد الأموال',
    'Failed to complete the paid join flow': 'فشل إكمال عملية الانضمام المدفوعة',
    'Failed to create poll': 'فشل إنشاء الاستطلاع',
    'Failed to create poll message': 'فشل إنشاء رسالة الاستطلاع',
    'Failed to create request': 'فشل إنشاء الطلب',
    'Failed to generate account': 'فشل إنشاء الحساب',
    'Failed to import account': 'فشل استيراد الحساب',
    'Failed to load market': 'فشل تحميل السوق',
    'Failed to save EXO account': 'فشل حفظ حساب EXO',
    'Failed to save membership access settings': 'فشل حفظ إعدادات وصول العضوية',
    'Failed to switch EXO account': 'فشل تبديل حساب EXO',
    'Failed to verify the payment confirmation.': 'فشل التحقق من تأكيد الدفع.',
    'Fetched over the normal network while Tor was disabled.':
      'تم الجلب عبر الشبكة العادية أثناء تعطيل Tor.',
    'Generating secure keys...': 'جارٍ إنشاء مفاتيح آمنة...',
    'Group members': 'أعضاء المجموعة',
    Hidden: 'مخفي',
    "Hide this contact's public name in your push notifications.":
      'إخفاء الاسم العام لجهة الاتصال هذه في إشعاراتك الفورية.',
    'Hide {{displayName}} from your Contacts tab on this device? Chats and encryption keys will stay intact.':
      'إخفاء {{displayName}} من علامة تبويب جهات الاتصال على هذا الجهاز؟ ستبقى الدردشات ومفاتيح التشفير سليمة.',
    'I backed up this recovery phrase offline.': 'احتفظت بنسخة احتياطية من عبارة الاسترداد هذه دون اتصال.',
    'I understand': 'أفهم ذلك',
    Import: 'استيراد',
    'Import Complete': 'اكتمل الاستيراد',
    'Import EXO Account': 'استيراد حساب EXO',
    'Import Failed': 'فشل الاستيراد',
    'Import a transparent EXO recovery phrase into this unlocked root vault.':
      'استورد عبارة استرداد EXO شفافة إلى هذه الخزنة الجذرية المفتوحة.',
    'Import and Use Account': 'استيراد الحساب واستخدامه',
    'Import contact archive?': 'استيراد أرشيف جهات الاتصال؟',
    'Import file': 'استيراد ملف',
    'Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.':
      'تُدمج جهات الاتصال المستوردة مع جهات الاتصال الموجودة بالفعل على هذا الجهاز. لا تُستورد الدردشات أو الرسائل أو الجلسات أو مفاتيح المجموعات أو الوسائط مطلقًا.',
    'Importing...': 'جارٍ الاستيراد...',
    'Incorrect PIN': 'رمز PIN غير صحيح',
    'Invalid amount': 'مبلغ غير صالح',
    'Invalid market ID': 'معرّف السوق غير صالح',
    'Invalid recipient address': 'عنوان المستلم غير صالح',
    'Invalid recovery phrase': 'عبارة استرداد غير صالحة',
    'Invalid {{network}} address': 'عنوان {{network}} غير صالح',
    'Load this image before editing it.': 'حمّل هذه الصورة قبل تعديلها.',
    'Loading pool data...': 'جارٍ تحميل بيانات المجمع...',
    'Loading shared content...': 'جارٍ تحميل المحتوى المشترك...',
    'Loading voice note...': 'جارٍ تحميل الرسالة الصوتية...',
    'Make sure no one is watching your screen': 'تأكد من أن لا أحد يراقب شاشتك',
    Max: 'الحد الأقصى',
    Media: 'الوسائط',
    'Media, links and docs': 'الوسائط والروابط والمستندات',
    'Message unavailable': 'الرسالة غير متاحة',
    'Minimize call': 'تصغير المكالمة',
    Muted: 'مكتوم',
    'My {{network}} Address': 'عنوان {{network}} الخاص بي',
    'Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}':
      'تعذر اتصال الإعداد المطلوب أو الجسور السابقة. يبقى Tor مفعّلًا وتظل حركة المرور الخلفية محجوبة. {{error}}',
    Network: 'الشبكة',
    'Network Fee': 'رسوم الشبكة',
    'Network State': 'حالة الشبكة',
    'Network: Mozaga native EXO': 'الشبكة: EXO الأصلي لـ Mozaga',
    'Never share your recovery phrase': 'لا تشارك عبارة الاسترداد الخاصة بك مطلقًا',
    'New EXO Account': 'حساب EXO جديد',
    Next: 'التالي',
    'No Spectra chats are available for sharing yet.':
      'لا تتوفر دردشات Spectra للمشاركة بعد.',
    'No active wallet is available.': 'لا توجد محفظة نشطة متاحة.',
    'No address for this network': 'لا يوجد عنوان لهذه الشبكة',
    'No documents shared yet': 'لم تُشارك مستندات بعد',
    'No links shared yet': 'لم تُشارك روابط بعد',
    'No tokens found': 'لم يُعثر على رموز',
    Notifications: 'الإشعارات',
    On: 'تشغيل',
    'Only import a recovery phrase you control. Imported accounts can send and receive chats independently.':
      'استورد فقط عبارة استرداد تتحكم فيها. يمكن للحسابات المستوردة إرسال الرسائل واستقبالها بشكل مستقل.',
    'Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.':
      'لا تُضمَّن سوى جهات الاتصال المحفوظة وتسمياتها. تُحتفظ بجهات الاتصال الموجودة، وتصبح جهات الاتصال المستعادة متاحة فور الاستيراد.',
    'Opening...': 'جارٍ الفتح...',
    'Paid access setup incomplete': 'إعداد الوصول المدفوع غير مكتمل',
    'Paid by {{payerName}}': 'دفع بواسطة {{payerName}}',
    'Paid in {{symbol}}': 'مدفوع بعملة {{symbol}}',
    'Paste recovery phrase': 'لصق عبارة الاسترداد',
    'Pay request': 'ادفع الطلب',
    'Pay {{amount}}': 'ادفع {{amount}}',
    Payment: 'دفع',
    'Payment Pending': 'الدفع قيد الانتظار',
    'Payment Required': 'الدفع مطلوب',
    'Payment already submitted': 'تم إرسال الدفع بالفعل',
    'Payment failed': 'فشل الدفع',
    'Payment message received': 'تم استلام رسالة دفع',
    'Payment paid': 'تم الدفع',
    'Payment recorded': 'تم تسجيل الدفع',
    'Payment request: {{amount}} {{symbol}}': 'طلب دفع: {{amount}} {{symbol}}',
    'Payment submitted': 'تم إرسال الدفع',
    'Payment submitted: {{amount}} {{symbol}}': 'تم إرسال الدفع: {{amount}} {{symbol}}',
    'Platform fee: {{fee}}': 'رسوم المنصة: {{fee}}',
    'Please allow access to your photo library to change the group photo.':
      'يرجى السماح بالوصول إلى مكتبة الصور لتغيير صورة المجموعة.',
    'Please retry the chat setup first.': 'يرجى إعادة محاولة إعداد الدردشة أولًا.',
    'Please wait until this chat is ready.': 'يرجى الانتظار حتى تصبح هذه الدردشة جاهزة.',
    'Post request': 'نشر الطلب',
    'Preparing voice note...': 'جارٍ تجهيز الرسالة الصوتية...',
    Previous: 'السابق',
    'Previous Bridges Restored': 'تمت استعادة الجسور السابقة',
    'Private handoff': 'تسليم خاص',
    'Public name in notifications': 'الاسم العام في الإشعارات',
    'Publishing chat bundle...': 'جارٍ نشر حزمة الدردشة...',
    'Receive Crypto': 'استلام العملات المشفرة',
    'Receive address': 'عنوان الاستلام',
    Recipient: 'المستلم',
    'Recipient {{network}} Address': 'عنوان {{network}} للمستلم',
    'Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.':
      'يُعرض المستلمون داخل Spectra فقط. يرى iOS وجهة تطبيق Spectra فقط.',
    'Reconnecting...': 'جارٍ إعادة الاتصال...',
    'Recovering secure call...': 'جارٍ استعادة المكالمة الآمنة...',
    'Recovery word {{number}}': 'كلمة الاسترداد {{number}}',
    Refresh: 'تحديث',
    Regenerate: 'إعادة الإنشاء',
    'Request a payment in this chat': 'اطلب دفعًا في هذه الدردشة',
    'Requested asset is not available in this wallet':
      'الأصل المطلوب غير متاح في هذه المحفظة',
    Reset: 'إعادة تعيين',
    'Retry failed': 'فشلت إعادة المحاولة',
    'Review Send': 'مراجعة الإرسال',
    'Root account': 'الحساب الجذر',
    'Root account required': 'الحساب الجذر مطلوب',
    Rotate: 'تدوير',
    'SPL Tokens': 'رموز SPL',
    'SPL tokens on Solana': 'رموز SPL على Solana',
    'Save and Use Account': 'حفظ الحساب واستخدامه',
    'Save encrypted contact archive': 'حفظ أرشيف جهات الاتصال المشفر',
    'Search contacts...': 'البحث في جهات الاتصال...',
    'Secure call waiting': 'مكالمة آمنة قيد الانتظار',
    'Securing chat...': 'جارٍ تأمين الدردشة...',
    'Preparing secure channel...': 'جارٍ تأمين الدردشة...',
    'Select Blockchain': 'اختر سلسلة الكتل',
    'Select drawing color': 'اختر لون الرسم',
    Sell: 'بيع',
    'Send ETH': 'إرسال ETH',
    'Send {{symbol}}': 'إرسال {{symbol}}',
    'Send {{symbol}} to my {{network}} address:\n{{address}}':
      'أرسل {{symbol}} إلى عنوان {{network}} الخاص بي:\n{{address}}',
    'Sending as {{account}}': 'جارٍ الإرسال باسم {{account}}',
    'Sending transaction...': 'جارٍ إرسال المعاملة...',
    'Share contact': 'مشاركة جهة اتصال',
    'Share to Spectra': 'مشاركة إلى Spectra',
    'Share {{network}} Address': 'مشاركة عنوان {{network}}',
    'Shared content is missing. Please share it again.':
      'المحتوى المشترك مفقود. يرجى مشاركته مرة أخرى.',
    'Show {{displayName}} in your Contacts tab again?':
      'إظهار {{displayName}} في علامة تبويب جهات الاتصال مجددًا؟',
    'Snowflake bootstrap privacy notice': 'إشعار خصوصية تمهيد Snowflake',
    'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.':
      'يستخدم Snowflake بنية WebRTC التحتية للتمهيد، بما يشمل الوسيط وخدمات STUN والوكلاء المتطوعين. يمكن لهذه الخدمات رصد عنوان IP لجهازك وتوقيت اتصالك. يحمي Tor حركة المرور بعد إنشاء الدائرة، لكنه لا يخفي اتصال التمهيد هذا.',
    'Solana private key is not available': 'المفتاح الخاص لـ Solana غير متاح',
    'Solana wallet not available': 'محفظة Solana غير متاحة',
    'Something went wrong. Please try again.': 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
    'Spectre access includes one diffusion channel.':
      'يتضمن وصول Spectre قناة بث واحدة.',
    Stroke: 'سُمك الخط',
    'Switch to your root EXO account to create transparent EXO accounts.':
      'بدّل إلى حساب EXO الجذر لإنشاء حسابات EXO شفافة.',
    'Switch to your root EXO account to import transparent EXO accounts.':
      'بدّل إلى حساب EXO الجذر لاستيراد حسابات EXO شفافة.',
    'Switching EXO account...': 'جارٍ تبديل حساب EXO...',
    'Switching...': 'جارٍ التبديل...',
    'TRC-20 Tokens': 'رموز TRC-20',
    'TRC-20 on Tron': 'TRC-20 على Tron',
    'Tap to load voice note': 'اضغط لتحميل الرسالة الصوتية',
    'Tap to reveal your recovery phrase': 'اضغط لإظهار عبارة الاسترداد',
    'Tap to review and pay': 'اضغط للمراجعة والدفع',
    'Tap to view shared links and documents': 'اضغط لعرض الروابط والمستندات المشتركة',
    Text: 'نص',
    'Text or link': 'نص أو رابط',
    'The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.':
      'يُشفَّر الأرشيف على هذا الجهاز قبل مشاركته. لا يُرفع إلى Spectra مطلقًا. احتفظ بالملف وعبارة المرور منفصلين؛ لا يستطيع Spectra استعادة أيٍّ منهما.',
    'The payment transaction failed on-chain.': 'فشلت معاملة الدفع على السلسلة.',
    'This EXO account already exists on this device.':
      'حساب EXO هذا موجود بالفعل على هذا الجهاز.',
    'This fetch used the normal network while Tor was disabled.':
      'استخدم هذا الجلب الشبكة العادية أثناء تعطيل Tor.',
    'This file is not available on this device yet.':
      'هذا الملف غير متاح على هذا الجهاز بعد.',
    'This image could not be edited right now.':
      'تعذر تعديل هذه الصورة في الوقت الحالي.',
    'This message was deleted': 'تم حذف هذه الرسالة',
    'This recovery phrase is shown only now. Store it offline before saving the new EXO account.':
      'تُعرض عبارة الاسترداد هذه الآن فقط. احفظها دون اتصال قبل حفظ حساب EXO الجديد.',
    'This request has already been marked as paid.': 'تم وضع علامة مدفوع على هذا الطلب بالفعل.',
    'This secure chat is not ready yet. Please try again in a moment.':
      'هذه الدردشة الآمنة ليست جاهزة بعد. حاول مرة أخرى بعد قليل.',
    'This voice note could not be loaded right now.':
      'تعذر تحميل هذه الرسالة الصوتية في الوقت الحالي.',
    'This wallet does not have an account for {{network}}.':
      'لا تحتوي هذه المحفظة على حساب لشبكة {{network}}.',
    To: 'إلى',
    'Toggle media controls': 'تبديل عناصر التحكم بالوسائط',
    'Tor Bridges': 'جسور Tor',
    'Tor Connection Failed': 'فشل اتصال Tor',
    'Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}':
      'تعذر اتصال Tor بالإعداد المطلوب، لذلك تمت استعادة الجسور السابقة العاملة. {{error}}',
    'Tor is disabled, so bridge requests will use the normal network.':
      'Tor معطّل، لذا ستستخدم طلبات الجسور الشبكة العادية.',
    'Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.':
      'Tor مفعّل لكنه غير متصل. عطّل Tor قبل جلب جسور التمهيد عبر الشبكة العادية.',
    'Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.':
      'لا يزال Tor يتصل. تبقى طلبات الجسور محجوبة حتى تتوفر دائرة Tor.',
    'Transaction failed on-chain': 'فشلت المعاملة على السلسلة',
    'Transparent EXO accounts are restored from your recovery phrase.':
      'تُستعاد حسابات EXO الشفافة من عبارة الاسترداد الخاصة بك.',
    'Tron private key is not available': 'المفتاح الخاص لـ Tron غير متاح',
    'Tron wallet not available': 'محفظة Tron غير متاحة',
    'Try Again': 'حاول مرة أخرى',
    'Unable to edit image': 'تعذر تعديل الصورة',
    'Unable to load voice note': 'تعذر تحميل الرسالة الصوتية',
    'Unable to open link': 'تعذر فتح الرابط',
    'Unable to remove recipient': 'تعذر إزالة المستلم',
    'Unable to retry': 'تعذرت إعادة المحاولة',
    'Unable to send': 'تعذر الإرسال',
    'Unable to switch EXO account': 'تعذر تبديل حساب EXO',
    Unblock: 'إلغاء الحظر',
    'Unblock {{displayName}}? They will be able to send you messages again.':
      'إلغاء حظر {{displayName}}؟ سيتمكن من إرسال رسائل إليك مجددًا.',
    Undo: 'تراجع',
    'Unlock the wallet that will pay for this membership and try again.':
      'افتح المحفظة التي ستدفع مقابل هذه العضوية ثم حاول مرة أخرى.',
    'Unlock your vault before managing a contact archive.':
      'افتح خزنتك قبل إدارة أرشيف جهات الاتصال.',
    'Unsupported attachment': 'مرفق غير مدعوم',
    'Unsupported {{type}} attachment': 'مرفق {{type}} غير مدعوم',
    'Upgrade to Spectre to create one diffusion channel.':
      'قم بالترقية إلى Spectre لإنشاء قناة بث واحدة.',
    Use: 'استخدام',
    'Use Biometric': 'استخدام القياسات الحيوية',
    'Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.':
      'استخدم عبارة مرور فريدة من 16 حرفًا على الأقل، تتضمن حروفًا وأرقامًا ورموزًا. لا يستطيع Spectra استعادتها.',
    'Use original': 'استخدام الأصل',
    'Use the original offline backup you created during onboarding if you need the phrase again. If it is lost, create a newly backed up wallet and migrate to it. The device cannot reveal the old phrase.':
      'استخدم النسخة الاحتياطية الأصلية دون اتصال التي أنشأتها أثناء الإعداد الأولي إذا احتجت إلى العبارة مرة أخرى. إذا فُقدت، أنشئ محفظة جديدة مع نسخة احتياطية وانتقل إليها. لا يمكن للجهاز إظهار العبارة القديمة.',
    'Use {{word}} for recovery word {{number}}':
      'استخدم {{word}} لكلمة الاسترداد {{number}}',
    'V1 supports Mozaga native EXO only. The company fee is {{fee}}.':
      'يدعم الإصدار V1 عملة EXO الأصلية لـ Mozaga فقط. رسوم الشركة هي {{fee}}.',
    'Voice note unavailable': 'الرسالة الصوتية غير متاحة',
    Volume: 'مستوى الصوت',
    Wallets: 'المحافظ',
    'Work, Friends, Personal...': 'العمل، الأصدقاء، شخصي...',
    'You can import up to 5 transparent EXO accounts from one recovery phrase.':
      'يمكنك استيراد ما يصل إلى 5 حسابات EXO شفافة من عبارة استرداد واحدة.',
    'You requested': 'لقد طلبت',
    "You'll enter the {{network}} address in the next step":
      'ستُدخل عنوان {{network}} في الخطوة التالية',
    'Your payment was submitted but is still waiting for confirmation. Reopen this invite in a moment to finish joining.':
      'تم إرسال دفعتك لكنها لا تزال بانتظار التأكيد. أعد فتح هذه الدعوة بعد قليل لإكمال الانضمام.',
    'via {{account}}': 'عبر {{account}}',
    '{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}':
      'تم تحميل {{bridgeCount}} من جسور {{transport}}. {{routeMessage}}',
    '{{count}} attachment_zero': '{{count}} مرفقات',
    '{{count}} attachment_one': '{{count}} مرفق',
    '{{count}} attachment_two': '{{count}} مرفقان',
    '{{count}} attachment_few': '{{count}} مرفقات',
    '{{count}} attachment_many': '{{count}} مرفقًا',
    '{{count}} attachment_other': '{{count}} مرفق',
    '{{count}} groups in common': '{{count}} مجموعات مشتركة',
    '{{count}} slots available': '{{count}} خانات متاحة',
    '{{error}} This request used the normal network while Tor was disabled.':
      '{{error}} استخدم هذا الطلب الشبكة العادية أثناء تعطيل Tor.',
    '{{network}} address': 'عنوان {{network}}',
    '{{senderName}} requested': 'طلب {{senderName}}',
    'Spectra logo': 'شعار Spectra',
    '{{width}} px': '{{width}} بكسل',
    'External links unavailable': 'الروابط الخارجية غير متاحة',
    'External links are unavailable while Spectre Mode is active.':
      'الروابط الخارجية غير متاحة أثناء تفعيل وضع Spectre.',
    'New encrypted message': 'رسالة مشفرة جديدة',
    'New message': 'رسالة جديدة',
    'New group message': 'رسالة جماعية جديدة',
    Default: 'الافتراضي',
    Messages: 'الرسائل',
    Calls: 'المكالمات',
    Transfers: 'التحويلات',
    'New message notifications': 'إشعارات الرسائل الجديدة',
    'Secure call notifications': 'إشعارات المكالمات الآمنة',
    'Wallet transfer notifications': 'إشعارات تحويلات المحفظة',
    'Secure call': 'مكالمة آمنة',
    'A newer version of Spectra is available. Update to get the latest features and fixes.':
      'يتوفر إصدار أحدث من Spectra. حدِّثه للحصول على أحدث الميزات والإصلاحات.',
    'This version of Spectra is no longer supported. Update to continue using secure services.':
      'لم يعد هذا الإصدار من Spectra مدعومًا. حدِّث التطبيق لمواصلة استخدام الخدمات الآمنة.',
    'Update available': 'تحديث متاح',
    'Update required': 'التحديث مطلوب',
    'Update Spectra': 'تحديث Spectra',
  },
  auth: {
    'Account import progress': 'تقدّم استيراد الحساب',
    'Authenticate to upgrade biometric unlock': 'صادق لتحديث فتح القفل بالقياسات الحيوية',
    'Choose a Public Name': 'اختر اسمًا عامًا',
    'Deriving wallets...': 'جارٍ اشتقاق المحافظ...',
    'Finishing previous account deletion...': 'جارٍ إنهاء حذف الحساب السابق...',
    'Go back': 'رجوع',
    Important: 'مهم',
    'Importing Account': 'جارٍ استيراد الحساب',
    'Optional public name for chats': 'اسم عام اختياري للدردشات',
    'Public Name': 'الاسم العام',
    'Public name contains invalid text.': 'يحتوي الاسم العام على نص غير صالح.',
    'Public name contains unsupported characters': 'يحتوي الاسم العام على أحرف غير مدعومة',
    'Public name contains unsupported control characters.':
      'يحتوي الاسم العام على أحرف تحكم غير مدعومة.',
    'Public name contains unsupported direction controls.':
      'يحتوي الاسم العام على عناصر تحكم في الاتجاه غير مدعومة.',
    'Public name is too large': 'الاسم العام كبير جدًا',
    'Public name is too large when encoded.': 'الاسم العام كبير جدًا عند ترميزه.',
    'Public name must be 80 characters or fewer.':
      'يجب ألا يزيد الاسم العام على 80 حرفًا.',
    'Public name must be {{max}} characters or fewer':
      'يجب ألا يزيد الاسم العام على {{max}} حرفًا',
    'This optional name helps people recognize you in chats and contacts. You can change or remove it later.':
      'يساعد هذا الاسم الاختياري الآخرين على التعرف إليك في الدردشات وجهات الاتصال. يمكنك تغييره أو إزالته لاحقًا.',
    'Unable to use this public name': 'تعذر استخدام هذا الاسم العام',
    'Unlock Spectra to connect your secure call': 'افتح Spectra لتوصيل مكالمتك الآمنة',
    'Your public name is shared as chat-directory metadata. It is not included in your recovery phrase and does not affect account security.':
      'يُشارك اسمك العام بوصفه بيانات وصفية لدليل الدردشة. لا يُضمَّن في عبارة الاسترداد ولا يؤثر في أمان الحساب.',
    '{{count}} characters maximum.': 'الحد الأقصى {{count}} حرفًا.',
    'PIN input': 'إدخال رمز PIN',
    'Mnemonic must be 12 or 24 words': 'يجب أن تتكون العبارة الاستذكارية من 12 أو 24 كلمة',
    'Invalid word: "{{word}}"': 'كلمة غير صالحة: "{{word}}"',
    'Invalid mnemonic checksum': 'المجموع الاختباري للعبارة الاستذكارية غير صالح',
  },
  chat: {
    'Add a contact and open a private chat': 'أضف جهة اتصال وافتح دردشة خاصة',
    'Add attachment': 'إضافة مرفق',
    'Add by address': 'إضافة عبر العنوان',
    'Add by invitation': 'إضافة عبر دعوة',
    'Add someone by address or scan their QR code to start.':
      'أضف شخصًا عبر عنوانه أو امسح رمز QR الخاص به للبدء.',
    'Cancel reply': 'إلغاء الرد',
    'Choose a contact or start with an address': 'اختر جهة اتصال أو ابدأ بعنوان',
    'Choose a contact or use a secure invitation': 'اختر جهة اتصال أو استخدم دعوة آمنة',
    'Edit image': 'تعديل الصورة',
    'Load more': 'تحميل المزيد',
    'No saved contacts yet': 'لا توجد جهات اتصال محفوظة بعد',
    'Paste a secure invitation or scan its QR code':
      'الصق دعوة آمنة أو امسح رمز QR الخاص بها',
    'Paste a secure invitation or scan its QR code to start.':
      'الصق دعوة آمنة أو امسح رمز QR الخاص بها للبدء.',
    'Record voice note': 'تسجيل رسالة صوتية',
    'Remove attachment': 'إزالة المرفق',
    'Scan, add, and start a private chat': 'امسح وأضف وابدأ دردشة خاصة',
    'Select from contacts': 'اختر من جهات الاتصال',
    'Send message': 'إرسال رسالة',
    'Start Chat': 'بدء الدردشة',
    'Start Secret Chat': 'بدء دردشة سرية',
    'Starting chat...': 'جارٍ بدء الدردشة...',
    'Starting from {{account}}': 'البدء من {{account}}',
    'Toggle one-time message': 'تبديل الرسالة لمرة واحدة',
    'Unable to start chat': 'تعذر بدء الدردشة',
    'Updated {{time}}': 'حُدِّثت {{time}}',
    'You took a screenshot': 'التقطت لقطة شاشة',
    '{{count}} messages': '{{count}} رسائل',
    '{{name}} took a screenshot': 'التقط {{name}} لقطة شاشة',
    Nearby: 'قريب',
    'Cancel voice note': 'إلغاء الرسالة الصوتية',
    'Send voice note': 'إرسال الرسالة الصوتية',
    'Play voice note': 'تشغيل الرسالة الصوتية',
    'Pause voice note': 'إيقاف الرسالة الصوتية مؤقتًا',
    'Text overlay': 'تراكب نصي',
    'Crop frame': 'إطار الاقتصاص',
    'Crop top-left handle': 'مقبض الاقتصاص العلوي الأيسر',
    'Crop top-right handle': 'مقبض الاقتصاص العلوي الأيمن',
    'Crop bottom-left handle': 'مقبض الاقتصاص السفلي الأيسر',
    'Crop bottom-right handle': 'مقبض الاقتصاص السفلي الأيمن',
    '#Tag': '#وسم',
    'Sending attachment': 'جارٍ إرسال المرفق',
    'Preparing message': 'جارٍ تجهيز الرسالة',
    'Sending message': 'جارٍ إرسال الرسالة',
    'Caching locally': 'جارٍ التخزين المؤقت محليًا',
    Complete: 'مكتمل',
    'Encrypting and uploading {{completed}}/{{total}}':
      'جارٍ التشفير والرفع {{completed}}/{{total}}',
    'Sending nearby': 'جارٍ الإرسال إلى جهاز قريب',
    'Queued nearby': 'في قائمة الانتظار للإرسال القريب',
    'Nearby delivery expired': 'انتهت صلاحية التسليم القريب',
    'Nearby retry limit reached': 'تم بلوغ حد إعادة المحاولة للإرسال القريب',
    'Nearby queue full': 'قائمة انتظار الإرسال القريب ممتلئة',
    'Nearby delivery interrupted': 'انقطع التسليم القريب',
    'Nearby receipt timed out': 'انتهت مهلة تأكيد التسليم القريب',
    'Nearby transmission failed': 'فشل الإرسال القريب',
    'Nearby delivery failed': 'فشل التسليم القريب',
  },
  contacts: {
    'Add by secure contact invitation': 'إضافة عبر دعوة جهة اتصال آمنة',
    'Adding to': 'الإضافة إلى',
    'EXO Account': 'حساب EXO',
    'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.':
      'أدخل عنوان ما بعد الكم للشخص الذي تريد إضافته. يجب أن يكون قد شارك عنوانه معك.',
    'Invalid contact invitation': 'دعوة جهة الاتصال غير صالحة',
    'Invalid secure contact invitation': 'دعوة جهة الاتصال الآمنة غير صالحة',
    'Paste a secure contact invitation or scan a contact QR code':
      'الصق دعوة جهة اتصال آمنة أو امسح رمز QR لجهة اتصال',
    'Paste a secure contact invitation or scan its QR code.':
      'الصق دعوة جهة اتصال آمنة أو امسح رمز QR الخاص بها.',
    'Paste a valid secure contact invitation.': 'الصق دعوة جهة اتصال آمنة صالحة.',
    'Please wait until the EXO account switch finishes.':
      'يرجى الانتظار حتى يكتمل تبديل حساب EXO.',
    'Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.':
      'امسح رمز QR لجهة اتصال أو الصق دعوة جهة الاتصال الآمنة التي شاركها الشخص الذي تريد إضافته.',
    'Scan a secure Spectra contact QR code shared by the person you want to add.':
      'امسح رمز QR لجهة اتصال Spectra آمنة شاركه الشخص الذي تريد إضافته.',
    'Secure Contact Invitation': 'دعوة جهة اتصال آمنة',
    'Secure invitation ready': 'الدعوة الآمنة جاهزة',
    Selected: 'محدد',
    'Switching...': 'جارٍ التبديل...',
    'This contact will be saved under this EXO account on this device.':
      'ستُحفظ جهة الاتصال هذه ضمن حساب EXO هذا على الجهاز.',
    'via {{account}}': 'عبر {{account}}',
  },
  markets: {
    'Amount exceeds remaining allowance': 'يتجاوز المبلغ الحد المتبقي',
    'Cannot contribute': 'تعذر المساهمة',
    'Connect wallet to create a campaign': 'اربط محفظة لإنشاء حملة',
    'Connect wallet to create an escrow order': 'اربط محفظة لإنشاء أمر ضمان',
    'Connect wallet to view your campaigns': 'اربط محفظة لعرض حملاتك',
    'Connect wallet to view your escrow orders': 'اربط محفظة لعرض أوامر الضمان الخاصة بك',
    'Describe the condition for release...': 'صف شرط الإفراج...',
    'Enter a valid market ID': 'أدخل معرّف سوق صالحًا',
    'Enter a valid sale ID': 'أدخل معرّف بيع صالحًا',
    'Fiat price must be greater than zero': 'يجب أن يكون سعر العملة الورقية أكبر من صفر',
    Filled: 'معبأ',
    'Hot Predictions': 'التوقعات الرائجة',
    'Invalid campaign ID': 'معرّف الحملة غير صالح',
    'Invalid order ID': 'معرّف الأمر غير صالح',
    'Invalid sale ID': 'معرّف البيع غير صالح',
    'Live Campaigns': 'الحملات المباشرة',
    'No description': 'لا يوجد وصف',
    'No escrow orders found': 'لم يُعثر على أوامر ضمان',
    'No order activity yet': 'لا يوجد نشاط للأوامر بعد',
    'Partially Filled': 'معبأ جزئيًا',
    'See all': 'عرض الكل',
    'Trending Markets': 'الأسواق الرائجة',
    'Untitled campaign': 'حملة بلا عنوان',
    Vol: 'الحجم',
    Yes: 'نعم',
    'You are not eligible to contribute': 'أنت غير مؤهل للمساهمة',
    of: 'من',
    '{{count}} backers': '{{count}} داعمين',
    '{{count}}d left': 'متبقي {{count}} يوم',
    '{{count}}h left': 'متبقي {{count}} ساعة',
    '{{count}}m left': 'متبقي {{count}} دقيقة',
  },
  settings: {
    'Activating secure online access': 'جارٍ تفعيل الوصول الآمن عبر الإنترنت',
    'Publishing secure discovery': 'جارٍ نشر قابلية الاكتشاف الآمنة',
    'Keeping you findable': 'الإبقاء على إمكانية العثور عليك',
    'Starting a secure chat': 'بدء محادثة آمنة',
    'Creating one-time contact card': 'جارٍ إنشاء بطاقة اتصال للاستخدام مرة واحدة',
    'Computing VDF proof': 'جارٍ حساب إثبات VDF',
    'Solving a sequential proof that helps prevent automated account creation.':
      'جارٍ حل إثبات تسلسلي يساعد على منع إنشاء الحسابات آليًا.',
    'Generating VDF proof': 'جارٍ إنشاء إثبات VDF',
    'Preparing the compact proof the server can verify efficiently.':
      'جارٍ إعداد الإثبات المضغوط الذي يمكن للخادم التحقق منه بكفاءة.',
    'Waiting for server verification': 'بانتظار تحقق الخادم',
    'Retrying server verification': 'جارٍ إعادة محاولة تحقق الخادم',
    'Proof ready. The server enforces a minimum delay before it accepts it.':
      'الإثبات جاهز. يفرض الخادم مهلة دنيا قبل قبوله.',
    'Verifying VDF proof': 'جارٍ التحقق من إثبات VDF',
    'Sending the proof for secure verification.':
      'جارٍ إرسال الإثبات للتحقق الآمن.',
    'Secure online access is ready': 'الوصول الآمن عبر الإنترنت جاهز',
    'Your secure online access is active.': 'وصولك الآمن عبر الإنترنت نشط.',
    'VDF work was cancelled': 'تم إلغاء عمل VDF',
    'No proof was submitted.': 'لم يتم إرسال أي إثبات.',
    'Secure access needs attention': 'يتطلب الوصول الآمن اهتمامًا',
    'This proof could not be completed. Check your connection and try again.':
      'تعذر إكمال هذا الإثبات. تحقق من اتصالك وحاول مرة أخرى.',
    '{{percent}}% complete': '{{percent}}% مكتمل',
    'VDFs completed {{completed}}/{{total}}': 'اكتملت إثباتات VDF {{completed}}/{{total}}',
    '{{rate}} VDF iterations/s': '{{rate}} تكرارات VDF/ث',
    'Measuring VDF rate…': 'جارٍ قياس سرعة VDF…',
    '~{{count}}s remaining': '~{{count}} ث متبقية',
    'Cancel secure work': 'إلغاء العمل الآمن',
    'Could not start this chat': 'تعذر بدء هذه المحادثة',
    'Could not update discovery': 'تعذر تحديث الاكتشاف',
    'Could not create contact card': 'تعذر إنشاء بطاقة جهة الاتصال',
    'Dismiss': 'إغلاق',
    'Keep Spectra open while the security proof is verified.':
      'أبقِ Spectra مفتوحًا أثناء التحقق من إثبات الأمان.',
    'A verified Backend session is required for Spectre activation':
      'يلزم وجود جلسة Backend موثقة لتفعيل Spectre',
    'A verified backend session is required before deleting this account.':
      'يلزم وجود جلسة خلفية موثقة قبل حذف هذا الحساب.',
    'Account Deletion': 'حذف الحساب',
    'Account Deletion Failed': 'فشل حذف الحساب',
    'Account deleted': 'تم حذف الحساب',
    'Account deletion completed': 'اكتمل حذف الحساب',
    'Account deletion failed. Try again after checking your connection.':
      'فشل حذف الحساب. حاول مرة أخرى بعد التحقق من اتصالك.',
    'Account deletion needs attention': 'يتطلب حذف الحساب انتباهك',
    'Applying Spectre protections': 'جارٍ تطبيق حمايات Spectre',
    'Backend cleanup could not be checked. Retry when the private connection is available.':
      'تعذر التحقق من التنظيف الخلفي. أعد المحاولة عند توفر الاتصال الخاص.',
    'Backend cleanup is paused and will be retried safely. Try checking again.':
      'تم إيقاف التنظيف الخلفي مؤقتًا وستتم إعادة محاولته بأمان. حاول التحقق مجددًا.',
    'Backend cleanup is still running. You can retry this status check safely.':
      'لا يزال التنظيف الخلفي قيد التشغيل. يمكنك إعادة محاولة فحص الحالة هذا بأمان.',
    'Backend deletion completed, but final device cleanup needs to be retried.':
      'اكتمل الحذف الخلفي، لكن يلزم إعادة محاولة التنظيف النهائي للجهاز.',
    'Backend deletion completed, but local key erasure could not be confirmed.':
      'اكتمل الحذف الخلفي، لكن تعذر تأكيد محو المفاتيح المحلية.',
    'Backend is not configured for Spectre activation':
      'لم يُعَد Backend لتفعيل Spectre',
    'Changes were rolled back': 'تم التراجع عن التغييرات',
    'Checking private access': 'جارٍ التحقق من الوصول الخاص',
    'Choose a new 6-digit PIN': 'اختر رمز PIN جديدًا من 6 أرقام',
    'Cleanup could not be confirmed. You can retry safely.':
      'تعذر تأكيد التنظيف. يمكنك إعادة المحاولة بأمان.',
    'Cloud Session Required': 'جلسة سحابية مطلوبة',
    'Confirm Account Deletion': 'تأكيد حذف الحساب',
    'Confirm New PIN': 'تأكيد رمز PIN الجديد',
    'Connecting your private route': 'جارٍ توصيل مسارك الخاص',
    'Contact Archive': 'أرشيف جهات الاتصال',
    'Deleting Account': 'جارٍ حذف الحساب',
    'Deleting account records': 'جارٍ حذف سجلات الحساب',
    'Deleting chat relay data': 'جارٍ حذف بيانات ترحيل الدردشة',
    'Deleting encrypted objects': 'جارٍ حذف الكائنات المشفرة',
    'Deletion needs attention': 'يتطلب الحذف انتباهك',
    'Disabled by Spectre Mode': 'معطّل بواسطة وضع Spectre',
    'EXO can continue refreshing chats in the background once Spectre is ready.':
      'يمكن لـ EXO متابعة تحديث الدردشات في الخلفية بعد أن يصبح Spectre جاهزًا.',
    'EXO has finished switching back from Spectre Mode.':
      'أنهى EXO التبديل من وضع Spectre.',
    'EXO is validating your Spectre account and required protections before the private handoff starts.':
      'يتحقق EXO من حساب Spectre والحمايات المطلوبة قبل بدء التسليم الخاص.',
    'EXO is verifying the wallet session it uses for private network services.':
      'يتحقق EXO من جلسة المحفظة التي يستخدمها لخدمات الشبكة الخاصة.',
    'EXO stopped the Spectre flow and restored the previous safe state where it could.':
      'أوقف EXO مسار Spectre واستعاد الحالة الآمنة السابقة حيث أمكن.',
    'Encrypted contact archive': 'أرشيف جهات اتصال مشفر',
    'Enter Current PIN': 'أدخل رمز PIN الحالي',
    'Enter New PIN': 'أدخل رمز PIN الجديد',
    'Enter your PIN to continue to the final destructive confirmation.':
      'أدخل رمز PIN للمتابعة إلى تأكيد الحذف النهائي.',
    'Enter your current PIN': 'أدخل رمز PIN الحالي',
    'Enter your current PIN before creating a duress PIN':
      'أدخل رمز PIN الحالي قبل إنشاء رمز PIN للإكراه',
    'Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.':
      'سيؤدي إدخال رمز PIN للإكراه إلى محاولة حذف بيانات الحساب الخلفية ومسح هذا الجهاز وتسجيل خروجك فورًا.',
    'Erase Account Permanently?': 'محو الحساب نهائيًا؟',
    'Erase Everything': 'محو كل شيء',
    'Erasing local keys and data': 'جارٍ محو المفاتيح والبيانات المحلية',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'صدّر ملفًا مشفرًا تتحكم فيه، ثم استورده لاحقًا للحفاظ على جهات الاتصال المحفوظة.',
    'Export and import encrypted contacts': 'تصدير جهات الاتصال المشفرة واستيرادها',
    'Failed to change PIN': 'فشل تغيير رمز PIN',
    'Failed to disable Spectre Mode': 'فشل تعطيل وضع Spectre',
    'Failed to disable an expired Spectre session':
      'فشل تعطيل جلسة Spectre منتهية الصلاحية',
    'Failed to refresh Spectre access': 'فشل تحديث وصول Spectre',
    'Failed to verify PIN': 'فشل التحقق من رمز PIN',
    'Finalizing Spectre shutdown': 'جارٍ إنهاء إيقاف Spectre',
    'Finalizing secure cleanup': 'جارٍ إنهاء التنظيف الآمن',
    'Finishing the private handoff': 'جارٍ إنهاء التسليم الخاص',
    'Getting Spectre ready': 'جارٍ تجهيز Spectre',
    'Keep Spectra open while each verified cleanup stage completes.':
      'أبقِ Spectra مفتوحًا حتى تكتمل كل مرحلة تنظيف موثقة.',
    'Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.':
      'أبقِ هذه الشاشة مفتوحة بينما يطبق EXO تغييرات الخصوصية اللازمة لوضع Spectre.',
    'Keep this screen open while EXO prepares the secure activation handoff.':
      'أبقِ هذه الشاشة مفتوحة بينما يجهّز EXO تسليم التفعيل الآمن.',
    'Keep this screen open while EXO restores your regular wallet and security settings.':
      'أبقِ هذه الشاشة مفتوحة بينما يستعيد EXO محفظتك العادية وإعدادات الأمان.',
    'Loading your Spectre setup': 'جارٍ تحميل إعداد Spectre الخاص بك',
    'Local data and the accepted backend cleanup have finished.':
      'تم حذف البيانات المحلية، واكتملت عملية التنظيف التي وافق عليها الخادم.',
    'Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.':
      'مُحيت البيانات المحلية، لكن تعذر تأكيد التنظيف الخلفي. أعد المحاولة عند توفر الاتصال الخاص.',
    'Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.':
      'مُحيت البيانات المحلية، لكن الخلفية لم تقبل طلب الحذف. أعد استيراد الحساب للمحاولة مجددًا.',
    'New PIN must be different from current PIN':
      'يجب أن يختلف رمز PIN الجديد عن رمز PIN الحالي',
    'One anonymous activation token can be requested every 24 hours.':
      'يمكن طلب رمز تفعيل مجهول واحد كل 24 ساعة.',
    'PINs do not match': 'رمزا PIN غير متطابقين',
    'Preparing Spectre Mode': 'جارٍ تجهيز وضع Spectre',
    'Preparing secure deletion': 'جارٍ تجهيز الحذف الآمن',
    'Preparing your Spectre account': 'جارٍ تجهيز حساب Spectre الخاص بك',
    'Preparing your Spectre setup': 'جارٍ تجهيز إعداد Spectre الخاص بك',
    'Preparing your private workspace': 'جارٍ تجهيز مساحة عملك الخاصة',
    'Re-enter your new PIN to confirm': 'أعد إدخال رمز PIN الجديد للتأكيد',
    'Registering the private account': 'جارٍ تسجيل الحساب الخاص',
    'Reserving private activation': 'جارٍ حجز التفعيل الخاص',
    'Restoring network and cleanup': 'جارٍ استعادة الشبكة والتنظيف',
    'Restoring privacy protections': 'جارٍ استعادة حمايات الخصوصية',
    'Restoring your main profile': 'جارٍ استعادة ملفك الشخصي الرئيسي',
    'Retry account deletion cleanup': 'إعادة محاولة تنظيف حذف الحساب',
    'Retry cleanup': 'إعادة محاولة التنظيف',
    'Review the failed step below before trying again.':
      'راجع الخطوة الفاشلة أدناه قبل المحاولة مرة أخرى.',
    'Secure account deletion stopped unexpectedly. Try again when the private connection is available.':
      'توقف حذف الحساب الآمن بشكل غير متوقع. حاول مرة أخرى عند توفر الاتصال الخاص.',
    'Secure deletion in progress': 'الحذف الآمن قيد التنفيذ',
    'Spectre cannot finish until Tor is connected. Try bridges or a different network.':
      'لا يمكن لـ Spectre الإكمال حتى يتصل Tor. جرّب الجسور أو شبكة مختلفة.',
    'Spectre chats and contacts are still refreshing in the background.':
      'لا تزال دردشات Spectre وجهات اتصاله تُحدَّث في الخلفية.',
    'Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.':
      'يعطّل Spectre المكالمات وإجراءات العملات المشفرة، ويزيل رموز الإشعارات الفورية، ويفرض Tor ورمز PIN للإكراه والمسح عند الفشل وحماية لقطات الشاشة وخصوصية مبدّل التطبيقات، ويضبط الرسائل الجديدة افتراضيًا على مؤقتات اختفاء قصيرة.',
    'Spectre needs your attention': 'يتطلب Spectre انتباهك',
    'Spectre protections are active': 'حمايات Spectre مفعّلة',
    'Submitting the deletion request': 'جارٍ إرسال طلب الحذف',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'بدّل إلى حساب EXO الجذر لإنشاء حسابات EXO شفافة أو استيرادها.',
    'Switching back to your main wallet': 'جارٍ التبديل إلى محفظتك الرئيسية',
    'Switching to your Spectre identity': 'جارٍ التبديل إلى هوية Spectre الخاصة بك',
    'The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.':
      'لم تعد الخلفية تتعرف على رمز التنظيف هذا. أعد استيراد الحساب للتحقق من الحذف.',
    'The cleanup status token expired. Re-import the account to verify its status.':
      'انتهت صلاحية رمز حالة التنظيف. أعد استيراد الحساب للتحقق من حالته.',
    'There is no pending backend cleanup to retry.':
      'لا يوجد تنظيف خلفي معلق لإعادة المحاولة.',
    'This cannot be undone. Backend data and local sensitive data will be erased for this account.':
      'لا يمكن التراجع عن ذلك. ستُمحى البيانات الخلفية والبيانات المحلية الحساسة لهذا الحساب.',
    'This cannot be undone. Local sensitive data is erased before the backend deletion request starts.':
      'لا يمكن التراجع عن ذلك. تُمحى البيانات المحلية الحساسة قبل بدء طلب الحذف الخلفي.',
    'This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.':
      'يؤدي ذلك إلى حذف المفاتيح والبيانات المحلية أولًا، ثم يرسل طلب التنظيف الخلفي عبر وسيلة النقل الخاصة الحالية. تظل شاشة التقدم ظاهرة حتى تأكيد التنظيف.',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'يزيل ذلك حساب EXO هذا من الجهاز ويحرر خانة واحدة لحساب EXO شفاف لهذه العبارة الاستردادية. تُمحى الرسائل الموجودة لهذا الحساب محليًا. لا يمكن التراجع عن ذلك.',
    'This screen updates automatically as each Spectre stage finishes.':
      'يتم تحديث هذه الشاشة تلقائيًا عند اكتمال كل مرحلة من مراحل Spectre.',
    'This screen updates only when a cleanup stage is confirmed.':
      'تتحدث هذه الشاشة فقط عند تأكيد مرحلة تنظيف.',
    'Tor could not connect': 'تعذر اتصال Tor',
    'Tor must be online before Spectre can switch identities and continue.':
      'يجب أن يكون Tor متصلًا قبل أن يتمكن Spectre من تبديل الهويات والمتابعة.',
    'Tor routing applies only inside Spectra. Device-wide network routing is unchanged.':
      'ينطبق توجيه Tor داخل Spectra فقط. لا تتغير إعدادات توجيه الشبكة على مستوى الجهاز.',
    'Unable to complete Spectre activation': 'تعذر إكمال تفعيل Spectre',
    'Unlock or reconnect to the backend before deleting the account.':
      'افتح القفل أو أعد الاتصال بالخلفية قبل حذف الحساب.',
    'Verify Primary PIN': 'تحقق من رمز PIN الأساسي',
    'Verify your identity to change PIN': 'تحقق من هويتك لتغيير رمز PIN',
    'Verifying private access': 'جارٍ التحقق من الوصول الخاص',
    'Your PIN has been changed successfully.': 'تم تغيير رمز PIN بنجاح.',
    'Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.':
      'محفظة Spectre ونفق Tor جاهزان. يمكن أن تنتهي الدردشات وجهات الاتصال من التحديث في الخلفية.',
    'Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.':
      'محفظة Spectre الخاصة بك نشطة. يبدّل EXO نطاق التخزين ويحمّل البيانات المحلية لهذا الملف الشخصي الخاص.',
    'Your main wallet is restored': 'تمت استعادة محفظتك الرئيسية',
    '{{count}}s elapsed': 'مر {{count}} ثانية',
    '{{count}}s elapsed - this may take 30-240 seconds with bridges':
      'مر {{count}} ثانية — قد يستغرق ذلك من 30 إلى 240 ثانية مع الجسور',
  },
  profile: {
    'Show VDF progress': 'إظهار تقدم VDF',
    'Proofs still run in the background when this is off.':
      'تستمر البراهين في العمل في الخلفية عند إيقاف هذا.',
    'Account Label': 'تسمية الحساب',
    'Change Photo': 'تغيير الصورة',
    'Chat bundle not on server — others cannot find you':
      'حزمة الدردشة ليست على الخادم — لا يستطيع الآخرون العثور عليك',
    'Chat bundle registered on server': 'حزمة الدردشة مسجلة على الخادم',
    'Chat identity not available. Please restart the app.':
      'هوية الدردشة غير متاحة. يرجى إعادة تشغيل التطبيق.',
    'Checking chat bundle...': 'جارٍ التحقق من حزمة الدردشة...',
    'Checking identity link...': 'جارٍ التحقق من رابط الهوية...',
    'Could not link identity. Please try again.':
      'تعذر ربط الهوية. يرجى المحاولة مرة أخرى.',
    'Could not refresh session. Check your connection.':
      'تعذر تحديث الجلسة. تحقق من اتصالك.',
    'Edit Profile': 'تعديل الملف الشخصي',
    'Identity linked to server': 'الهوية مرتبطة بالخادم',
    'Identity not linked — messaging is disabled':
      'الهوية غير مرتبطة — المراسلة معطلة',
    'Member since {{date}}': 'عضو منذ {{date}}',
    'Name this account': 'سمِّ هذا الحساب',
    'Optional public name for chats': 'اسم عام اختياري للدردشات',
    'Photo disabled in Spectre Mode': 'تغيير الصورة معطّل في وضع Spectre',
    'Preparing secure contact invitation…': 'جارٍ تجهيز دعوة جهة اتصال آمنة…',
    'Preparing secure contact card…': 'جارٍ تجهيز بطاقة اتصال آمنة…',
    'Preparing secure share…': 'جارٍ تجهيز مشاركة آمنة…',
    'Create a one-time card to show your QR code.':
      'أنشئ بطاقة للاستخدام مرة واحدة لعرض رمز QR الخاص بك.',
    'Create one-time contact card': 'إنشاء بطاقة اتصال للاستخدام مرة واحدة',
    'Publish for 5 minutes': 'انشر لمدة 5 دقائق',
    'Your account is discoverable for 5 minutes.': 'يمكن العثور على حسابك لمدة 5 دقائق.',
    'Your account is already discoverable.': 'يمكن العثور على حسابك بالفعل.',
    'Your one-time contact card is still active.':
      'بطاقة الاتصال للاستخدام مرة واحدة لا تزال نشطة.',
    'Open one-time contact card': 'فتح بطاقة اتصال للاستخدام مرة واحدة',
    'One-time contact card ready': 'بطاقة الاتصال للاستخدام مرة واحدة جاهزة',
    'Expires in {{minutes}} min': 'تنتهي خلال {{minutes}} د',
    'One-time contact card': 'بطاقة اتصال للاستخدام مرة واحدة',
    'Share this QR code before it expires.':
      'شارك رمز QR هذا قبل انتهاء صلاحيته.',
    'A one-time contact card expires after one hour and can be used once.':
      'تنتهي صلاحية بطاقة الاتصال للاستخدام مرة واحدة بعد ساعة ولا يمكن استخدامها إلا مرة واحدة.',
    'Chat identity is not ready yet.': 'هوية الدردشة ليست جاهزة بعد.',
    'Profile photos cannot be changed while Spectre Mode is active.':
      'لا يمكن تغيير صور الملف الشخصي أثناء تفعيل وضع Spectre.',
    'Public Name': 'الاسم العام',
    'Public name contains invalid text.': 'يحتوي الاسم العام على نص غير صالح.',
    'Public name contains unsupported characters': 'يحتوي الاسم العام على أحرف غير مدعومة',
    'Public name contains unsupported control characters.':
      'يحتوي الاسم العام على أحرف تحكم غير مدعومة.',
    'Public name contains unsupported direction controls.':
      'يحتوي الاسم العام على عناصر تحكم في الاتجاه غير مدعومة.',
    'Public name is too large': 'الاسم العام كبير جدًا',
    'Public name is too large when encoded.': 'الاسم العام كبير جدًا عند ترميزه.',
    'Public name must be 80 characters or fewer.':
      'يجب ألا يزيد الاسم العام على 80 حرفًا.',
    'Public name must be {{max}} characters or fewer':
      'يجب ألا يزيد الاسم العام على {{max}} حرفًا',
    'Public profile metadata is read-only while Spectre Mode is active.':
      'البيانات الوصفية للملف الشخصي العام للقراءة فقط أثناء تفعيل وضع Spectre.',
    'Public profile names cannot be edited while Spectre Mode is active.':
      'لا يمكن تعديل أسماء الملفات الشخصية العامة أثناء تفعيل وضع Spectre.',
    'Publication needs attention. Retry when you are online.':
      'يتطلب النشر انتباهك. أعد المحاولة عندما تكون متصلًا بالإنترنت.',
    Published: 'منشور',
    'Publishing public name...': 'جارٍ نشر الاسم العام...',
    'Retry Publication': 'إعادة محاولة النشر',
    'Save Public Name': 'حفظ الاسم العام',
    'Security Status': 'حالة الأمان',
    'Server session active': 'جلسة الخادم نشطة',
    'Server session expired — features may not work':
      'انتهت صلاحية جلسة الخادم — قد لا تعمل الميزات',
    'This is a local label to help you identify this account. It is not your public chat name.':
      'هذه تسمية محلية تساعدك على تمييز هذا الحساب. ليست اسم الدردشة العام الخاص بك.',
    'This name is visible to your contacts': 'هذا الاسم مرئي لجهات اتصالك',
    'This public name is saved on this device and will publish when your chat identity is linked.':
      'يُحفظ هذا الاسم العام على الجهاز وسيُنشر عند ربط هوية الدردشة الخاصة بك.',
    'This repeatable name is public chat-directory metadata. People who have not saved you under another name can see it in chats and contacts. It appears in notifications only when both sides enable that privacy trade-off.':
      'هذا الاسم القابل للتكرار هو بيانات وصفية عامة لدليل الدردشة. يمكن للأشخاص الذين لم يحفظوك باسم آخر رؤيته في الدردشات وجهات الاتصال. يظهر في الإشعارات فقط عندما يفعّل الطرفان هذا التنازل المتعلق بالخصوصية.',
    'Unable to use this public name': 'تعذر استخدام هذا الاسم العام',
    'Unknown error': 'خطأ غير معروف',
    'Waiting for chat readiness. Automatic retries are scheduled.':
      'بانتظار جاهزية الدردشة. جرت جدولة عمليات إعادة المحاولة التلقائية.',
  },
  tor: {
    'Connected to Spectre': 'متصل بـ Spectre',
  },
  crypto: {
    '~{{fee}} {{symbol}}': '~{{fee}} {{symbol}}',
    '{{symbol}} logo': 'شعار {{symbol}}',
    'USDT logo': 'شعار USDT',
  },
} satisfies LocaleTranslationOverrides

export default translations

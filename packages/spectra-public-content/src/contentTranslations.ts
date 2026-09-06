/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LanguageTranslations } from './schema'
import { AGORA_TERMS_TEXT, DISCLAIMER_TEXT, PRIVACY_TEXT, TERMS_TEXT } from './legalDocs'
import { eurasiaHelpTranslations } from './manualHelpTranslations.eurasia'
import { miscHelpTranslations } from './manualHelpTranslations.misc'
import { romanceHelpTranslations } from './manualHelpTranslations.romance'
import { southAsiaHelpTranslations } from './manualHelpTranslations.southAsia'

type ContentLanguage =
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

type ContentNamespaceTranslations = Pick<LanguageTranslations, 'help' | 'legal'>
type NonEnglishContentLanguage = Exclude<ContentLanguage, 'en'>

const enHelp: ContentNamespaceTranslations['help'] = {
  'faq.account.title': 'Account',
  'faq.account.createAccount.q': 'How do I create an account?',
  'faq.account.createAccount.a': 'Create a new EXO account locally on your device with post-quantum keys. No email, phone number, or personal information is required to create the local wallet.',
  'faq.account.recoveryPhrase.q': 'What is my recovery phrase?',
  'faq.account.recoveryPhrase.a': 'New Spectra accounts use a 24-word recovery phrase. Spectra can import a valid 12- or 24-word phrase to restore a compatible EXO account on another device. Store it offline. Spectra support will never ask for it and cannot recover it for you.',
  'faq.account.multipleDevices.q': 'Can I use Spectra on multiple devices?',
  'faq.account.multipleDevices.a': 'A recovery phrase can restore the same EXO account on a new device, but message history, local contacts, local aliases, and device security settings do not automatically transfer.',
  'faq.account.multiExo.q': 'What is Multi-EXO?',
  'faq.account.multiExo.a': 'Multi-EXO lets you keep more than one EXO chat persona on this device. Only one EXO address is active at a time, so switching personas changes the sender identity, contacts, and local data for that address.',
  'faq.account.logout.q': 'What happens if I log out?',
  'faq.account.logout.a': 'Logging out removes local account data from this device, including messages, contacts, keys, and cached sessions. You need the recovery phrase to restore the account.',
  'faq.account.profile.q': 'How do I change my display name or avatar?',
  'faq.account.profile.a': 'Go to Settings, tap your profile card, then tap Edit. Profile changes are tied to the active EXO identity.',
  'faq.account.qrCode.q': 'What is my QR code used for?',
  'faq.account.qrCode.a': 'Your QR code is your public EXO address. In Findable mode, people with that address can look you up while you open Spectra at least once a week. Private mode hides that listing unless you publish for five minutes or share a one-time contact card.',
  'faq.account.pqAddress.q': 'What is my Post-Quantum address?',
  'faq.account.pqAddress.a': 'Your Post-Quantum address starts with EXO00 and is your public identifier on Spectra. It is derived from your ML-DSA public key and is intended to be shared publicly.',

  'faq.security.title': 'Security',
  'faq.security.encryption.q': 'What encryption does Spectra use?',
  'faq.security.encryption.a': 'Spectra uses hybrid X25519 + ML-KEM-768 X3DH-like initial key establishment and Double Ratchet-style key rotation for end-to-end encrypted messaging, plus ML-DSA-65 post-quantum signatures for EXO/Mozaga operations. Private keys are generated and stored on your device.',
  'faq.security.duressPin.q': 'What is the duress PIN?',
  'faq.security.duressPin.a': 'The duress PIN is a secondary PIN that wipes local messages, conversations, keys, and cached data, then signs you out. When an authenticated backend session is available, Spectra also attempts to delete the associated backend account data. It is for situations where you may be forced to unlock the app.',
  'faq.security.failedAttempts.q': 'What does Erase After Failed Attempts do?',
  'faq.security.failedAttempts.a': 'When enabled, Spectra permanently erases local data after the configured number of incorrect PIN entries. This protects the device vault against repeated guessing.',
  'faq.security.biometrics.q': 'Is Face ID or Touch ID secure?',
  'faq.security.biometrics.a': 'Biometric unlock is handled by your device. Spectra does not store or transmit biometric data; it only asks the operating system to unlock the encrypted vault.',
  'faq.security.autoLock.q': 'What does Auto-Lock do?',
  'faq.security.autoLock.a': 'Auto-Lock locks Spectra after inactivity. Your PIN or biometric unlock is required before the app can be used again.',
  'faq.security.screenshotProtection.q': 'What does Screenshot Protection do?',
  'faq.security.screenshotProtection.a': 'Screenshot Protection blocks screenshots and screen recordings where the operating system supports it. It reduces accidental capture but cannot control external cameras.',
  'faq.security.appSwitcher.q': 'What is App Switcher Privacy?',
  'faq.security.appSwitcher.a': 'App Switcher Privacy hides Spectra content when the app moves to the background, so conversation previews are not visible in the system app switcher.',
  'faq.security.spectreMode.q': 'How does Spectre Mode change security?',
  'faq.security.spectreMode.a': 'Spectre Mode uses a separate EXO identity, forces Tor, removes push tokens, and applies managed privacy protections. It disables crypto and market screens, calls, media, voice notes, transfers, crypto receipts, payment requests, and tags.',

  'faq.messaging.title': 'Messaging',
  'faq.messaging.privateMessages.q': 'Are my messages truly private?',
  'faq.messaging.privateMessages.a': 'Supported private chats and encrypted groups use end-to-end encryption for message content. Servers relay encrypted payloads; this does not protect a compromised device or hide all metadata.',
  'faq.messaging.disappearingMessages.q': 'What are disappearing messages?',
  'faq.messaging.disappearingMessages.a': 'Disappearing messages automatically delete after a selected timer. The setting applies to new messages after the timer is enabled.',
  'faq.messaging.filesMedia.q': 'Can I send files and media?',
  'faq.messaging.filesMedia.a': 'Yes. Images, documents, voice notes, and other attachments are encrypted before upload and sent like message content.',
  'faq.messaging.voiceNotes.q': 'How do voice notes work?',
  'faq.messaging.voiceNotes.a': 'Hold the microphone button in the message input to record a voice note, then release to send it. Voice notes use the same encrypted delivery model as messages.',
  'faq.messaging.reactions.q': 'Can I react to messages?',
  'faq.messaging.reactions.a': 'Yes. Long-press a message to add an emoji reaction or open actions such as reply, copy, forward, or delete.',
  'faq.messaging.reply.q': 'How do I reply to a specific message?',
  'faq.messaging.reply.a': 'Long-press a message and choose Reply, or swipe on the message where supported. Your reply includes a reference to the original message.',
  'faq.messaging.forward.q': 'Can I forward messages?',
  'faq.messaging.forward.a': 'Yes. You can forward supported message types to direct chats or encrypted groups from the message action menu.',
  'faq.messaging.encryptedGroups.q': 'What are encrypted groups?',
  'faq.messaging.encryptedGroups.a': 'Encrypted groups are private group chats where members share end-to-end encrypted messages. Create them from the chat creation flow in the Chats tab.',
  'faq.messaging.archivePinMute.q': 'How do I archive, pin, or mute a conversation?',
  'faq.messaging.archivePinMute.a': 'Use the conversation list gestures or long-press menu to archive, pin, mute, clear, or delete conversations. Archived chats remain available from the archived section.',
  'faq.messaging.clearVsDelete.q': 'What is the difference between Clear Chat and Delete Chat?',
  'faq.messaging.clearVsDelete.a': 'Clear Chat removes local messages but keeps the conversation. Delete Chat removes the conversation entry locally. Neither action deletes messages already delivered to someone else.',

  'faq.calls.title': 'Voice & Video Calls',
  'faq.calls.makeCall.q': 'How do I make a call?',
  'faq.calls.makeCall.a': 'Open a direct chat and tap the phone or video icon in the header. Calls use WebRTC. When a peer connection is established, WebRTC protects live media with DTLS-SRTP; this media transport is not post-quantum.',
  'faq.calls.torCalls.q': 'Can I make calls over Tor?',
  'faq.calls.torCalls.a': 'No. Voice and video calls are disabled while Tor mode is active because real-time media needs low latency and UDP-style networking that Tor does not provide.',
  'faq.calls.controls.q': 'What call controls are available?',
  'faq.calls.controls.a': 'During a call you can mute, toggle the camera, switch cameras, use speaker mode, decline, or end the call.',

  'faq.contacts.title': 'Contacts',
  'faq.contacts.addContact.q': 'How do I add a contact?',
  'faq.contacts.addContact.a': 'Open Contacts and tap Add. You can enter a Post-Quantum address manually or scan a Spectra QR code.',
  'faq.contacts.scanQr.q': 'Can I scan a QR code to add someone?',
  'faq.contacts.scanQr.a': 'Yes. Use the QR scanner in Add Contact and point it at the other person’s Spectra QR code.',
  'faq.contacts.verifiedBadge.q': 'What does the Verified badge mean?',
  'faq.contacts.verifiedBadge.a': 'Verified is a local trust marker that you set after checking a contact’s identity, for example by comparing fingerprints in person.',
  'faq.contacts.customName.q': 'Can I set a custom name for a contact?',
  'faq.contacts.customName.a': 'Yes. Contact aliases are stored locally on your device and do not change how that person appears to anyone else.',
  'faq.contacts.block.q': 'How do I block or unblock someone?',
  'faq.contacts.block.a': 'Open the contact detail screen and use Block or Unblock. Blocked contacts cannot send you messages in supported private chat flows.',
  'faq.contacts.tags.q': 'What are contact tags?',
  'faq.contacts.tags.a': 'Tags help you organize contacts locally, such as Work, Family, or Project groups.',

  'faq.crypto.title': 'Wallets & Crypto',
  'faq.crypto.supportedWallets.q': 'What wallets does Spectra support?',
  'faq.crypto.supportedWallets.a': 'The wallet surface can show Mozaga, Ethereum, Bitcoin, Solana, and Tron when addresses are available.',
  'faq.crypto.mozagaNetwork.q': 'What is the Mozaga network?',
  'faq.crypto.mozagaNetwork.a': 'Mozaga is the native EXO mainnet used by Spectra. EXO transfers are signed on-device with ML-DSA-65 (FIPS 204), and private keys are not sent to the RPC server.',
  'faq.crypto.sendCrypto.q': 'How do I send crypto?',
  'faq.crypto.sendCrypto.a': 'Open Wallets, choose a network or asset, tap Send, check the recipient address, amount, network fee, and included contribution, then confirm. When a valid treasury recipient and USD price quote are available, the contribution is 0.1% of the send amount, capped at $10 equivalent. The send flow cannot calculate that contribution without the required quote. Blockchain transactions cannot be reversed once confirmed.',
  'faq.crypto.receiveCrypto.q': 'How do I receive crypto?',
  'faq.crypto.receiveCrypto.a': 'Open Wallets and tap Receive. Select the network, then share the displayed address or QR code.',
  'faq.crypto.chatPayments.q': 'Can I send crypto inside a chat?',
  'faq.crypto.chatPayments.a': 'Yes. In direct chats, use the crypto action to send supported assets and create an encrypted receipt message for the transaction.',
  'faq.crypto.supportedTokens.q': 'Which tokens are supported?',
  'faq.crypto.supportedTokens.a': 'Token support depends on the network. Current first-class token surfaces include USDT on Mozaga assets, Solana SPL, and Tron TRC20 where configured, plus EVM token support on supported EVM networks.',
  'faq.crypto.transactionHistory.q': 'Where can I see transaction history?',
  'faq.crypto.transactionHistory.a': 'Wallets shows recent history where the network and explorer configuration are available. Tap a transaction to open the relevant blockchain explorer.',
  'faq.crypto.torRpc.q': 'Does Tor affect blockchain requests?',
  'faq.crypto.torRpc.a': 'Yes. Spectra routes supported network requests through the Tor-aware transport when Tor is active, which can make balance checks, sends, and history slower or less reliable.',

  'faq.tor.title': 'Tor & Privacy',
  'faq.tor.torMode.q': 'What does Tor mode do?',
  'faq.tor.torMode.a': 'Tor mode routes supported Spectra network requests through Tor to help hide your IP address from Spectra servers and improve censorship resistance.',
  'faq.tor.freeQuota.q': 'Is Tor access free?',
  'faq.tor.freeQuota.a': 'Yes. Tor access is free and unlimited in this build. Tor traffic connects directly through the Tor network and is not metered by Spectra server quotas.',
  'faq.tor.bridges.q': 'What are Tor bridges?',
  'faq.tor.bridges.a': 'Bridges are unlisted Tor relays that can help connect in regions where direct Tor access is blocked.',
  'faq.tor.performance.q': 'Does Tor mode affect performance?',
  'faq.tor.performance.a': 'Yes. Messages use polling, network requests are slower, streaming responses may be unavailable, media uploads can take longer, and voice/video calls are disabled.',
  'faq.tor.verifyConnection.q': 'How do I verify my Tor connection?',
  'faq.tor.verifyConnection.a': 'When Tor is active, the Tor status banner shows the verified exit country.',
  'faq.tor.otherApps.q': 'How does Tor routing work on my device?',
  'faq.tor.otherApps.a': 'Tor mode routes supported Spectra network requests through Tor for Spectra features. It does not change device-level network settings.',

  'faq.spectre.title': 'Spectre Mode',
  'faq.spectre.whatIsSpectre.q': 'What is Spectre Mode?',
  'faq.spectre.whatIsSpectre.a': 'Spectre Mode is a higher-privacy operating mode that uses a separate EXO identity, forces Tor, removes push tokens, and locks down sensitive app features.',
  'faq.spectre.subscriptionAccess.q': 'How do I get Spectre access?',
  'faq.spectre.subscriptionAccess.a': 'Tor and Spectre privacy features are free. A recovery phrase restores your deterministic account set; expendable Spectre accounts use the anonymous activation-token flow.',
  'faq.spectre.addresses.q': 'How many Spectre addresses can I use?',
  'faq.spectre.addresses.a': 'Each recovery phrase restores one root EXO account, five deterministic transparent EXO accounts, and one Spectre account. Transparent account slots are lifetime slots for that phrase.',
  'faq.spectre.activationTokens.q': 'What are Spectre activation tokens?',
  'faq.spectre.activationTokens.a': 'An authenticated root wallet can request one anonymous activation token every 24 hours for an expendable Spectre account. The blind-token protocol lets the server enforce that cooldown without learning the target Spectre address during issuance.',
  'faq.spectre.disabledFeatures.q': 'What features are disabled in Spectre Mode?',
  'faq.spectre.disabledFeatures.a': 'Spectre Mode disables crypto and market screens; calls; media; voice notes; transfers; crypto receipts; payment requests; and tags. It removes push tokens; forces Tor; disables delivery and read receipts; applies duress protection, fail-wipe, screenshot protection, app switcher privacy, strict message caching, image-cache clearing on lock, and immediate auto-lock; and defaults new direct messages to a 15-minute disappearing timer and new group messages to a 1-hour timer. Agora, the public plaza, is also unavailable.',
  'faq.spectre.endingAccess.q': 'What happens if Spectre access ends?',
  'faq.spectre.endingAccess.a': 'If an expendable Spectre address expires or is closed, Spectra stops using that identity and removes its local session. You can prepare another expendable account after the 24-hour token cooldown.',

  'faq.payments.title': 'Digital Assets',
  'faq.payments.networkFees.q': 'Are there blockchain network fees?',
  'faq.payments.networkFees.a': 'Blockchain sends can include gas, network fees, and optional send contributions. They are separate from Spectra privacy features.',
  'faq.payments.refunds.q': 'Can Spectra reverse blockchain transactions?',
  'faq.payments.refunds.a': 'Confirmed blockchain transactions are irreversible. Spectra cannot reverse network fees, sent funds, or included contributions after a transaction is submitted. Any off-chain refund or credit depends on the provider, transaction status, and applicable law.',

  'faq.bluetooth.title': 'Bluetooth Mesh',
  'faq.bluetooth.meshMessaging.q': 'How does Bluetooth Mesh messaging work?',
  'faq.bluetooth.meshMessaging.a': 'When internet is unavailable, Spectra can exchange supported encrypted messages over Bluetooth Low Energy with nearby devices and relay through nearby peers.',
  'faq.bluetooth.security.q': 'Is Bluetooth Mesh messaging secure?',
  'faq.bluetooth.security.a': 'Bluetooth changes the transport, not the message encryption model. Message content remains protected by the same private-chat encryption design.',
  'faq.bluetooth.storeForward.q': 'What is Store & Forward?',
  'faq.bluetooth.storeForward.a': 'Store & Forward lets your device cache encrypted messages for offline contacts and deliver them when they come within Bluetooth range.',
  'faq.bluetooth.relaying.q': 'What is message relaying?',
  'faq.bluetooth.relaying.a': 'Relaying lets nearby devices pass encrypted messages along. Relay devices cannot read message content.',
  'faq.bluetooth.permissions.q': 'Does Bluetooth need to be on?',
  'faq.bluetooth.permissions.a': 'Yes. Bluetooth must be enabled and Spectra must have the required Bluetooth permissions.',

  'faq.agora.title': 'Agora',
  'faq.agora.whatIs.q': 'What is Agora?',
  'faq.agora.whatIs.a': 'Agora is Spectra’s public plaza. It is a set of topic rooms where people can talk in the open using a plaza nick, not their discovery alias or EXO address.',
  'faq.agora.encrypted.q': 'Is Agora encrypted?',
  'faq.agora.encrypted.a': 'No. Agora messages, whispers, occupancy, and plaza nicks are stored in plaintext on Spectra’s servers so the rooms can be public. Private chats and encrypted groups are separate and remain end-to-end encrypted. Tor can hide your IP address from Spectra’s servers, but it does not encrypt Agora content.',
  'faq.agora.whispers.q': 'Are Agora whispers private?',
  'faq.agora.whispers.a': 'Whispers are visible only to you, the person you whispered, and Spectra’s servers. They are not end-to-end encrypted. Start a line with @Nick to whisper. An @Nick in the middle of a public line is only a highlight.',
  'faq.agora.nicks.q': 'How do plaza nicks work?',
  'faq.agora.nicks.a': 'Your Agora nick is 3–24 letters, numbers, or underscores. It is not your discovery alias and cannot look like an EXO00 address. You can change it once every 24 hours. Old nicks stay reserved for three days.',
  'faq.agora.spectre.q': 'Why is Agora hidden in Spectre Mode?',
  'faq.agora.spectre.a': 'Spectre Mode is for higher-privacy encrypted use. Agora is a public plaintext plaza, so Spectre wallets cannot open it.',

  'faq.appearance.title': 'Appearance',
  'faq.appearance.theme.q': 'Can I change the app theme?',
  'faq.appearance.theme.a': 'Yes. Go to Settings > Appearance to switch between light and dark themes.',
  'faq.appearance.textSize.q': 'Can I change the message text size?',
  'faq.appearance.textSize.a': 'Yes. Settings > Appearance lets you choose the message font size and preview it before saving.',
  'faq.appearance.chatBackground.q': 'Can I set a custom chat background?',
  'faq.appearance.chatBackground.a': 'Yes. Choose a built-in background or select an image from your photo library, then remove it later if you want to return to the default.',
}

const manualHelpTranslations: Record<NonEnglishContentLanguage, Record<string, string>> = {
  ...romanceHelpTranslations,
  ...eurasiaHelpTranslations,
  ...southAsiaHelpTranslations,
  ...miscHelpTranslations,
}

const legalTitles: Record<ContentLanguage, Pick<ContentNamespaceTranslations['legal'], 'legal.terms.title' | 'legal.privacy.title' | 'legal.disclaimer.title' | 'legal.agora.title'>> = {
  en: {
    'legal.terms.title': 'Terms and Conditions',
    'legal.privacy.title': 'Privacy Policy',
    'legal.disclaimer.title': 'Payment and Digital Assets Disclaimer',
    'legal.agora.title': 'Agora Terms',
  },
  ar: {
    'legal.terms.title': 'الشروط والأحكام',
    'legal.privacy.title': 'سياسة الخصوصية',
    'legal.disclaimer.title': 'إخلاء مسؤولية المدفوعات والأصول الرقمية',
    'legal.agora.title': 'شروط أغورا',
  },
  bn: {
    'legal.terms.title': 'শর্তাবলী',
    'legal.privacy.title': 'গোপনীয়তা নীতি',
    'legal.disclaimer.title': 'পেমেন্ট ও ডিজিটাল সম্পদ ঘোষণা',
    'legal.agora.title': 'Agora শর্তাবলী',
  },
  de: {
    'legal.terms.title': 'Allgemeine Geschaftsbedingungen',
    'legal.privacy.title': 'Datenschutzerklarung',
    'legal.disclaimer.title': 'Hinweis zu Zahlungen und digitalen Vermogenswerten',
    'legal.agora.title': 'Agora-Bedingungen',
  },
  es: {
    'legal.terms.title': 'Terminos y condiciones',
    'legal.privacy.title': 'Politica de privacidad',
    'legal.disclaimer.title': 'Aviso sobre pagos y activos digitales',
    'legal.agora.title': 'Terminos de Agora',
  },
  fr: {
    'legal.terms.title': 'Conditions generales',
    'legal.privacy.title': 'Politique de confidentialite',
    'legal.disclaimer.title': 'Avertissement sur les paiements et actifs numeriques',
    'legal.agora.title': 'Conditions d Agora',
  },
  hi: {
    'legal.terms.title': 'नियम और शर्तें',
    'legal.privacy.title': 'गोपनीयता नीति',
    'legal.disclaimer.title': 'भुगतान और डिजिटल संपत्ति अस्वीकरण',
    'legal.agora.title': 'Agora शर्तें',
  },
  id: {
    'legal.terms.title': 'Syarat dan ketentuan',
    'legal.privacy.title': 'Kebijakan privasi',
    'legal.disclaimer.title': 'Penafian pembayaran dan aset digital',
    'legal.agora.title': 'Ketentuan Agora',
  },
  it: {
    'legal.terms.title': 'Termini e condizioni',
    'legal.privacy.title': 'Informativa sulla privacy',
    'legal.disclaimer.title': 'Avviso su pagamenti e asset digitali',
    'legal.agora.title': 'Termini di Agora',
  },
  pt: {
    'legal.terms.title': 'Termos e condicoes',
    'legal.privacy.title': 'Politica de privacidade',
    'legal.disclaimer.title': 'Aviso sobre pagamentos e ativos digitais',
    'legal.agora.title': 'Termos da Agora',
  },
  ru: {
    'legal.terms.title': 'Условия использования',
    'legal.privacy.title': 'Политика конфиденциальности',
    'legal.disclaimer.title': 'Отказ от ответственности по платежам и цифровым активам',
    'legal.agora.title': 'Условия Agora',
  },
  ur: {
    'legal.terms.title': 'شرائط و ضوابط',
    'legal.privacy.title': 'رازداری کی پالیسی',
    'legal.disclaimer.title': 'ادائیگیوں اور ڈیجیٹل اثاثوں کا اعلان دستبرداری',
    'legal.agora.title': 'Agora شرائط',
  },
  'zh-Hans': {
    'legal.terms.title': '条款和条件',
    'legal.privacy.title': '隐私政策',
    'legal.disclaimer.title': '支付和数字资产免责声明',
    'legal.agora.title': 'Agora 条款',
  },
}

const legalNotice: Record<ContentLanguage, string> = {
  en: '',
  ar: 'ملاحظة: النص الإنجليزي أدناه هو النسخة القانونية الملزمة إلى أن تتم مراجعة الترجمة القانونية.',
  bn: 'দ্রষ্টব্য: আইনি অনুবাদ পর্যালোচনা শেষ না হওয়া পর্যন্ত নিচের ইংরেজি পাঠই বাধ্যতামূলক সংস্করণ।',
  de: 'Hinweis: Bis zur juristischen Prufung einer Ubersetzung ist die folgende englische Fassung verbindlich.',
  es: 'Nota: hasta que se revise la traduccion legal, la version inglesa siguiente es la version vinculante.',
  fr: 'Remarque : tant que la traduction juridique n est pas revue, la version anglaise ci-dessous fait foi.',
  hi: 'ध्यान दें: कानूनी अनुवाद की समीक्षा पूरी होने तक नीचे दिया गया अंग्रेज़ी पाठ ही बाध्यकारी संस्करण है।',
  id: 'Catatan: sampai terjemahan hukum ditinjau, teks bahasa Inggris di bawah ini adalah versi yang mengikat.',
  it: 'Nota: fino alla revisione legale della traduzione, il testo inglese seguente e la versione vincolante.',
  pt: 'Observacao: ate a revisao juridica da traducao, o texto em ingles abaixo e a versao vinculativa.',
  ru: 'Примечание: до юридической проверки перевода приведенная ниже английская версия является обязательной.',
  ur: 'نوٹ: قانونی ترجمے کے جائزے تک نیچے دیا گیا انگریزی متن ہی پابند قانونی نسخہ ہے۔',
  'zh-Hans': '注意：在法律译文完成审核之前，以下英文文本为具有约束力的版本。',
}

function withHelpTitles(language: NonEnglishContentLanguage): ContentNamespaceTranslations['help'] {
  return {
    ...enHelp,
    ...manualHelpTranslations[language],
  }
}

function legalContent(language: ContentLanguage, text: string): string {
  const notice = legalNotice[language]
  return notice ? `${notice}\n\n---\n\n${text}` : text
}

function buildLegal(language: ContentLanguage): ContentNamespaceTranslations['legal'] {
  return {
    ...legalTitles[language],
    'legal.terms.content': legalContent(language, TERMS_TEXT),
    'legal.privacy.content': legalContent(language, PRIVACY_TEXT),
    'legal.disclaimer.content': legalContent(language, DISCLAIMER_TEXT),
    'legal.agora.content': legalContent(language, AGORA_TERMS_TEXT),
  }
}

export const contentTranslations: Record<ContentLanguage, ContentNamespaceTranslations> = {
  en: {
    help: enHelp,
    legal: buildLegal('en'),
  },
  ar: {
    help: withHelpTitles('ar'),
    legal: buildLegal('ar'),
  },
  bn: {
    help: withHelpTitles('bn'),
    legal: buildLegal('bn'),
  },
  de: {
    help: withHelpTitles('de'),
    legal: buildLegal('de'),
  },
  es: {
    help: withHelpTitles('es'),
    legal: buildLegal('es'),
  },
  fr: {
    help: withHelpTitles('fr'),
    legal: buildLegal('fr'),
  },
  hi: {
    help: withHelpTitles('hi'),
    legal: buildLegal('hi'),
  },
  id: {
    help: withHelpTitles('id'),
    legal: buildLegal('id'),
  },
  it: {
    help: withHelpTitles('it'),
    legal: buildLegal('it'),
  },
  pt: {
    help: withHelpTitles('pt'),
    legal: buildLegal('pt'),
  },
  ru: {
    help: withHelpTitles('ru'),
    legal: buildLegal('ru'),
  },
  ur: {
    help: withHelpTitles('ur'),
    legal: buildLegal('ur'),
  },
  'zh-Hans': {
    help: withHelpTitles('zh-Hans'),
    legal: buildLegal('zh-Hans'),
  },
}

export {
  eurasiaHelpTranslations,
  miscHelpTranslations,
  romanceHelpTranslations,
  southAsiaHelpTranslations,
}

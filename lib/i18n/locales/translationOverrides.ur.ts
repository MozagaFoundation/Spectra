/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LocaleTranslationOverrides } from './translationOverrideTypes'

const translations = {
  common: {
    "Creating your post-quantum identity...": "آپ کی پوسٹ کوانٹم شناخت بنائی جا رہی ہے...",
    "Encrypted group sender keys": "گروپ بھیجنے والے کی انکرپٹ شدہ کلیدیں",
    "End-to-end encrypted": "اینڈ ٹو اینڈ انکرپٹڈ",
    "End-to-end encryption available for supported chats":
      "معاونت یافتہ چیٹس کے لیے اینڈ ٹو اینڈ انکرپشن دستیاب ہے",
    "Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.":
      "گروپ کیز آپ کے موجودہ انکرپٹڈ ڈائریکٹ سیشنز کے ذریعے تقسیم کی جاتی ہیں۔ کسی رکن کو ہٹانے سے فعال گروپ کلید خود بخود تبدیل ہو جاتی ہے۔",
    "Hybrid post-quantum messaging": "ہائبرڈ پوسٹ کوانٹم پیغام رسانی",
    "ML-DSA-65 post-quantum signatures": "ML-DSA-65 پوسٹ کوانٹم دستخط",
    "Post-quantum": "پوسٹ کوانٹم",
    "Post-quantum identity keys ready": "پوسٹ کوانٹم شناختی کلیدیں تیار ہیں",
    "Securing your encrypted vault...": "آپ کے انکرپٹڈ والٹ کو محفوظ کیا جا رہا ہے...",
    "Supported direct messages are end-to-end encrypted.":
      "معاونت یافتہ براہ راست پیغامات اینڈ ٹو اینڈ انکرپٹڈ ہیں۔",
    "BIP39 word suggestions": "BIP39 لفظ کی تجاویز",
    "Next": "اگلا",
    "Paste recovery phrase": "بازیابی کا جملہ چسپاں کریں",
    "Previous": "پچھلا",
    "Recovery word {{number}}": "بازیابی کا لفظ {{number}}",
    "Use {{word}} for recovery word {{number}}": "{{word}} کو بازیابی کے لفظ {{number}} کے لیے استعمال کریں",
    "{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}":
      "{{bridgeCount}} {{transport}} برجز لوڈ ہو گئے۔ {{routeMessage}}",
    "{{error}} This request used the normal network while Tor was disabled.":
      "{{error}} Tor غیر فعال ہونے کے دوران اس درخواست نے عام نیٹ ورک استعمال کیا۔",
    "Applying bridge configuration…": "برج کی ترتیب لاگو کی جا رہی ہے…",
    "Applying direct Tor…": "براہِ راست Tor لاگو کیا جا رہا ہے…",
    "Bridge Update Failed": "برج کی تازہ کاری ناکام ہو گئی",
    "Fetched over the normal network while Tor was disabled.":
      "Tor غیر فعال ہونے کے دوران عام نیٹ ورک سے حاصل کیا گیا۔",
    "Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}":
      "نہ مطلوبہ ترتیب اور نہ ہی سابقہ برجز سے رابطہ ہو سکا۔ Tor فعال رہے گا اور بیک اینڈ ٹریفک مسدود رہے گی۔ {{error}}",
    "Previous Bridges Restored": "سابقہ برجز بحال کر دیے گئے",
    "This fetch used the normal network while Tor was disabled.":
      "Tor غیر فعال ہونے پر اس درخواست میں عام نیٹ ورک استعمال ہوا۔",
    "Tor Connection Failed": "Tor سے رابطہ ناکام ہو گیا",
    "Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}":
      "Tor مطلوبہ ترتیب کے ساتھ رابطہ نہ کر سکا، اس لیے پہلے کام کرنے والے برجز بحال کر دیے گئے۔ {{error}}",
    "Tor is disabled, so bridge requests will use the normal network.":
      "Tor غیر فعال ہے، اس لیے برج کی درخواستیں عام نیٹ ورک استعمال کریں گی۔",
    "Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.":
      "Tor فعال ہے مگر مربوط نہیں۔ عام نیٹ ورک سے بوٹ اسٹریپ برجز حاصل کرنے سے پہلے Tor کو غیر فعال کریں۔",
    "Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.":
      "Tor ابھی رابطہ قائم کر رہا ہے۔ Tor سرکٹ دستیاب ہونے تک برج کی درخواستیں مسدود رہیں گی۔",
    "{{count}} groups in common": "{{count}} مشترک گروپس",
    "{{network}} address": "{{network}} پتہ",
    "Add ETH before sending this token.": "اس ٹوکن کو بھیجنے سے پہلے ETH شامل کریں۔",
    "Available": "دستیاب",
    "Back": "واپس",
    "Block": "بلاک کریں",
    "Block {{displayName}}? You will no longer receive messages from them.":
      "{{displayName}} کو بلاک کریں؟ آپ کو ان سے مزید پیغامات موصول نہیں ہوں گے۔",
    "Buy": "خریدیں",
    "Calculated by network": "نیٹ ورک کے ذریعے حساب شدہ",
    "Cancel Spectre Mode": "Spectre موڈ منسوخ کریں",
    "Canceling Spectre Mode...": "Spectre موڈ منسوخ کیا جا رہا ہے…",
    "Calls are only supported in direct chats.": "کالز صرف براہِ راست چیٹس میں معاون ہیں۔",
    "Calls unavailable": "کالز دستیاب نہیں",
    "Chat unavailable": "چیٹ دستیاب نہیں",
    "Chats": "چیٹس",
    "Choose how long messages remain visible after they are read.":
      "منتخب کریں کہ پیغامات پڑھے جانے کے بعد کتنی دیر تک نظر آئیں۔",
    "Claim Refund": "رقم واپسی حاصل کریں",
    "Clear chat": "چیٹ صاف کریں",
    "Close media preview": "میڈیا پیش منظر بند کریں",
    "Close poll failed": "پول بند کرنا ناکام ہو گیا",
    "Confirm & Send": "تصدیق کریں اور بھیجیں",
    "Confirm Payment": "ادائیگی کی تصدیق کریں",
    "Confirm Transaction": "لین دین کی تصدیق کریں",
    "Connecting...": "رابطہ قائم کیا جا رہا ہے…",
    "Connection failed": "رابطہ ناکام ہو گیا",
    "Copy TX": "TX کاپی کریں",
    "Could not open this chat": "یہ چیٹ نہیں کھولی جا سکی",
    "Could not open this chat.": "یہ چیٹ نہیں کھولی جا سکی۔",
    "Creator": "تخلیق کار",
    "Disappearing messages": "غائب ہونے والے پیغامات",
    "Edit": "ترمیم کریں",
    "Enter a valid amount": "درست رقم درج کریں",
    "Enter a valid EXO price greater than zero.": "صفر سے زیادہ درست EXO قیمت درج کریں۔",
    "ERC-20 on Ethereum Mainnet": "Ethereum Mainnet پر ERC-20",
    "ERC-20 Tokens": "ERC-20 ٹوکنز",
    "Est. gas: {{amount}} {{symbol}}": "تخمینی گیس: {{amount}} {{symbol}}",
    "Estimated fee": "تخمینی فیس",
    "EXO account creation is disabled while Spectre Mode is active.":
      "Spectre موڈ فعال ہونے پر EXO اکاؤنٹ بنانا غیر فعال ہے۔",
    "Failed to claim refund": "رقم واپسی حاصل کرنا ناکام ہو گیا",
    "Failed to complete the paid join flow": "بامعاوضہ شمولیت کا عمل مکمل نہیں ہو سکا",
    "Failed to create poll": "پول بنانا ناکام ہو گیا",
    "Failed to create poll message": "پول کا پیغام بنانا ناکام ہو گیا",
    "Failed to create request": "درخواست بنانا ناکام ہو گیا",
    "Failed to Load": "لوڈ کرنا ناکام ہو گیا",
    "Failed to load market": "مارکیٹ لوڈ نہیں ہو سکی",
    "Failed to save membership access settings": "رکنیت کی رسائی کی ترتیبات محفوظ نہیں ہو سکیں",
    "Failed to switch EXO account": "EXO اکاؤنٹ تبدیل کرنا ناکام ہو گیا",
    "Failed to verify the payment confirmation.": "ادائیگی کی تصدیق کی پڑتال ناکام ہو گئی۔",
    "Hide {{displayName}} from your Contacts tab on this device? Chats and encryption keys will stay intact.":
      "اس ڈیوائس پر اپنے روابط کے ٹیب سے {{displayName}} کو چھپائیں؟ چیٹس اور رمزنگاری کی کلیدیں برقرار رہیں گی۔",
    "Incorrect PIN": "غلط PIN",
    "Invalid {{network}} address": "{{network}} کا غلط پتہ",
    "Invalid amount": "غلط رقم",
    "Invalid market ID": "غلط مارکیٹ ID",
    "Invalid recipient address": "وصول کنندہ کا غلط پتہ",
    "Loading pool data...": "پول کا ڈیٹا لوڈ ہو رہا ہے…",
    "Loading voice note...": "صوتی نوٹ لوڈ ہو رہا ہے…",
    "Max": "زیادہ سے زیادہ",
    "Media, links and docs": "میڈیا، روابط اور دستاویزات",
    "Muted": "خاموش",
    "My {{network}} Address": "میرا {{network}} پتہ",
    "Network": "نیٹ ورک",
    "Network Fee": "نیٹ ورک فیس",
    "Network State": "نیٹ ورک کی حالت",
    "Network: Mozaga native EXO": "نیٹ ورک: Mozaga کا مقامی EXO",
    "No documents shared yet": "ابھی کوئی دستاویز شیئر نہیں کی گئی",
    "No address for this network": "اس نیٹ ورک کے لیے کوئی پتہ نہیں",
    "No links shared yet": "ابھی کوئی رابطہ شیئر نہیں کیا گیا",
    "No tokens found": "کوئی ٹوکن نہیں ملا",
    "Notifications": "اطلاعات",
    "On": "فعال",
    "Opening...": "کھولا جا رہا ہے…",
    "Paid access setup incomplete": "بامعاوضہ رسائی کی ترتیب نامکمل ہے",
    "Paid in {{symbol}}": "{{symbol}} میں ادا کیا گیا",
    "Paid by {{payerName}}": "{{payerName}} نے ادا کیا",
    "Pay request": "درخواست کی ادائیگی کریں",
    "Pay {{amount}}": "{{amount}} ادا کریں",
    "Payment already submitted": "ادائیگی پہلے ہی جمع کرا دی گئی ہے",
    "Payment failed": "ادائیگی ناکام ہو گئی",
    "Payment message received": "ادائیگی کا پیغام موصول ہوا",
    "Payment Pending": "ادائیگی زیر التوا ہے",
    "Payment paid": "ادائیگی ہو گئی",
    "Payment recorded": "ادائیگی درج کر لی گئی",
    "Payment request: {{amount}} {{symbol}}": "ادائیگی کی درخواست: {{amount}} {{symbol}}",
    "Payment Required": "ادائیگی درکار ہے",
    "Payment submitted": "ادائیگی جمع کرا دی گئی",
    "Payment submitted: {{amount}} {{symbol}}": "ادائیگی جمع کرا دی گئی: {{amount}} {{symbol}}",
    "Platform fee: {{fee}}": "پلیٹ فارم فیس: {{fee}}",
    "Please allow access to your photo library to change the group photo.":
      "گروپ کی تصویر تبدیل کرنے کے لیے اپنی تصویری لائبریری تک رسائی کی اجازت دیں۔",
    "Preparing voice note...": "صوتی نوٹ تیار کیا جا رہا ہے…",
    "Post request": "درخواست پوسٹ کریں",
    "Recipient {{network}} Address": "وصول کنندہ کا {{network}} پتہ",
    "Recipient": "وصول کنندہ",
    "Receive Crypto": "کرپٹو وصول کریں",
    "Receive address": "وصولی کا پتہ",
    "Reconnecting...": "دوبارہ رابطہ قائم کیا جا رہا ہے…",
    "Request a payment in this chat": "اس چیٹ میں ادائیگی کی درخواست کریں",
    "Requested asset is not available in this wallet": "درخواست کردہ اثاثہ اس والٹ میں دستیاب نہیں",
    "Review Send": "بھیجنے کا جائزہ لیں",
    "Search contacts...": "روابط تلاش کریں…",
    "Securing chat...": "چیٹ محفوظ کی جا رہی ہے…",
    "Preparing secure channel...": "چیٹ محفوظ کی جا رہی ہے…",
    "Select Blockchain": "بلاک چین منتخب کریں",
    "Sell": "فروخت کریں",
    "Send {{symbol}}": "{{symbol}} بھیجیں",
    "Send {{symbol}} to my {{network}} address:\n{{address}}":
      "{{symbol}} میرے {{network}} پتے پر بھیجیں:\n{{address}}",
    "Sending as {{account}}": "{{account}} کے طور پر بھیجا جا رہا ہے",
    "Sending transaction...": "لین دین بھیجا جا رہا ہے…",
    "Share {{network}} Address": "{{network}} پتہ شیئر کریں",
    "Share contact": "رابطہ شیئر کریں",
    "Show {{displayName}} in your Contacts tab again?":
      "اپنے روابط کے ٹیب میں {{displayName}} کو دوبارہ دکھائیں؟",
    "Solana private key is not available": "Solana کی نجی کلید دستیاب نہیں",
    "Solana wallet not available": "Solana والٹ دستیاب نہیں",
    "Something went wrong. Please try again.": "کچھ غلط ہو گیا۔ براہِ کرم دوبارہ کوشش کریں۔",
    "SPL Tokens": "SPL ٹوکنز",
    "SPL tokens on Solana": "Solana پر SPL ٹوکنز",
    "Tap to load voice note": "صوتی نوٹ لوڈ کرنے کے لیے ٹیپ کریں",
    "Tap to view shared links and documents": "مشترکہ روابط اور دستاویزات دیکھنے کے لیے ٹیپ کریں",
    "The payment transaction failed on-chain.": "ادائیگی کا لین دین آن چین ناکام ہو گیا۔",
    "This file is not available on this device yet.": "یہ فائل ابھی اس ڈیوائس پر دستیاب نہیں ہے۔",
    "This message was deleted": "یہ پیغام حذف کر دیا گیا تھا",
    "This request has already been marked as paid.": "اس درخواست کو پہلے ہی ادا شدہ نشان زد کیا جا چکا ہے۔",
    "This voice note could not be loaded right now.": "یہ صوتی نوٹ اس وقت لوڈ نہیں ہو سکا۔",
    "This wallet does not have an account for {{network}}.":
      "اس والٹ میں {{network}} کے لیے کوئی اکاؤنٹ نہیں ہے۔",
    "To": "کو",
    "Tor Bridges": "Tor برجز",
    "Transaction failed on-chain": "لین دین آن چین ناکام ہو گیا",
    "TRC-20 on Tron": "Tron پر TRC-20",
    "TRC-20 Tokens": "TRC-20 ٹوکنز",
    "Tron private key is not available": "Tron کی نجی کلید دستیاب نہیں",
    "Tron wallet not available": "Tron والٹ دستیاب نہیں",
    "Try Again": "دوبارہ کوشش کریں",
    "Unable to load voice note": "صوتی نوٹ لوڈ نہیں ہو سکا",
    "Unable to open link": "رابطہ نہیں کھولا جا سکا",
    "Unable to remove recipient": "وصول کنندہ کو ہٹایا نہیں جا سکا",
    "Unblock": "بلاک ختم کریں",
    "Unblock {{displayName}}? They will be able to send you messages again.":
      "{{displayName}} کا بلاک ختم کریں؟ وہ آپ کو دوبارہ پیغامات بھیج سکیں گے۔",
    "Unlock the wallet that will pay for this membership and try again.":
      "اس والٹ کو ان لاک کریں جو اس رکنیت کی ادائیگی کرے گا، پھر دوبارہ کوشش کریں۔",
    "Unsupported {{type}} attachment": "{{type}} منسلکہ معاون نہیں ہے",
    "Unsupported attachment": "منسلکہ معاون نہیں ہے",
    "Use Biometric": "بایومیٹرک استعمال کریں",
    "Use the original offline backup you created during onboarding if you need the phrase again. If it is lost, create a newly backed up wallet and migrate to it. The device cannot reveal the old phrase.":
      "اگر آپ کو جملہ دوبارہ درکار ہو تو آن بورڈنگ کے دوران بنایا گیا اصل آف لائن بیک اپ استعمال کریں۔ اگر وہ گم ہو جائے تو نئے بیک اپ کے ساتھ والٹ بنائیں اور اس میں منتقل ہو جائیں۔ ڈیوائس پرانا جملہ ظاہر نہیں کر سکتی۔",
    "V1 supports Mozaga native EXO only. The company fee is {{fee}}.":
      "V1 صرف Mozaga کے مقامی EXO کی معاونت کرتا ہے۔ کمپنی کی فیس {{fee}} ہے۔",
    "via {{account}}": "{{account}} کے ذریعے",
    "Voice note unavailable": "صوتی نوٹ دستیاب نہیں",
    "Volume": "آواز",
    "Wallets": "والٹس",
    "You requested": "آپ نے درخواست کی",
    "You'll enter the {{network}} address in the next step":
      "آپ اگلے مرحلے میں {{network}} کا پتہ درج کریں گے",
    "Your payment was submitted but is still waiting for confirmation. Reopen this invite in a moment to finish joining.":
      "آپ کی ادائیگی جمع کرا دی گئی ہے مگر ابھی تصدیق کا انتظار ہے۔ شمولیت مکمل کرنے کے لیے تھوڑی دیر بعد یہ دعوت دوبارہ کھولیں۔",
    "{{senderName}} requested": "{{senderName}} نے درخواست کی",
    "Diffusion channels require Spectre access.": "ڈفیوژن چینلز کے لیے Spectre رسائی درکار ہے۔",
    "Upgrade to Spectre to create one diffusion channel.":
      "ایک ڈفیوژن چینل بنانے کے لیے Spectre پر اپ گریڈ کریں۔",
    "Please wait until this chat is ready.": "براہِ کرم اس چیٹ کے تیار ہونے تک انتظار کریں۔",
    "Please retry the chat setup first.": "پہلے چیٹ کی ترتیب کو دوبارہ آزمائیں۔",
    "Edit and resend": "ترمیم کر کے دوبارہ بھیجیں",
    "Could not update notifications": "اطلاعات تازہ نہیں ہو سکیں",
    "Public name in notifications": "اطلاعات میں عوامی نام",
    "Hide this contact's public name in your push notifications.":
      "اس رابطے کا عوامی نام اپنی پش اطلاعات میں چھپائیں۔",
    "Hidden": "پوشیدہ",
    "Allowed": "اجازت یافتہ",
    "Send ETH": "ETH بھیجیں",
    "Could not add members": "اراکین شامل نہیں ہو سکے",
    "Add {{count}}": "{{count}} شامل کریں",
    "Media": "میڈیا",
    "Add user": "صارف شامل کریں",
    "{{count}} slots available": "{{count}} جگہیں دستیاب ہیں",
    "Group members": "گروپ کے اراکین",
    "Created": "بنایا گیا",
    "Could not save your public name. Please try again.":
      "آپ کا عوامی نام محفوظ نہیں ہو سکا۔ براہِ کرم دوبارہ کوشش کریں۔",
    "Text or link": "متن یا رابطہ",
    " +{{count}} more": " +{{count}} مزید",
    "Shared content is missing. Please share it again.":
      "مشترکہ مواد موجود نہیں ہے۔ براہِ کرم اسے دوبارہ شیئر کریں۔",
    "Unable to send": "بھیجا نہیں جا سکا",
    "Share to Spectra": "Spectra پر شیئر کریں",
    "Private handoff": "نجی منتقلی",
    "Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.":
      "وصول کنندگان صرف Spectra کے اندر دکھائے جاتے ہیں۔ iOS کو صرف Spectra ایپ کی منزل نظر آتی ہے۔",
    "Loading shared content...": "مشترکہ مواد لوڈ ہو رہا ہے…",
    "Could not import shared content": "مشترکہ مواد درآمد نہیں ہو سکا",
    "{{count}} attachment_one": "{{count}} منسلکہ",
    "{{count}} attachment_other": "{{count}} منسلکات",
    "No Spectra chats are available for sharing yet.":
      "ابھی شیئر کرنے کے لیے کوئی Spectra چیٹ دستیاب نہیں ہے۔",
    "Connecting encrypted chat...": "رمز کردہ چیٹ سے رابطہ قائم کیا جا رہا ہے…",
    "Recovering secure call...": "محفوظ کال بحال کی جا رہی ہے…",
    "Establishing secure call...": "محفوظ کال قائم کی جا رہی ہے…",
    "Secure call waiting": "محفوظ کال کا انتظار ہے",
    "Minimize call": "کال چھوٹی کریں",
    "Edit image": "تصویر میں ترمیم کریں",
    "Toggle media controls": "میڈیا کنٹرولز تبدیل کریں",
    "+ gas in": "+ گیس میں",
    "Payment": "ادائیگی",
    "Tap to review and pay": "جائزہ لینے اور ادائیگی کے لیے ٹیپ کریں",
    "Unable to edit image": "تصویر میں ترمیم نہیں ہو سکی",
    "This image could not be edited right now.": "اس تصویر میں اس وقت ترمیم نہیں ہو سکتی۔",
    "Message unavailable": "پیغام دستیاب نہیں",
    "Could not update this image. Please try again.":
      "اس تصویر کو تازہ نہیں کیا جا سکا۔ براہِ کرم دوبارہ کوشش کریں۔",
    "Could not save the edited image. Please try again.":
      "ترمیم شدہ تصویر محفوظ نہیں ہو سکی۔ براہِ کرم دوبارہ کوشش کریں۔",
    "Add text": "متن شامل کریں",
    "Drag text on the image to reposition it.":
      "تصویر پر متن کو نئی جگہ پر رکھنے کے لیے گھسیٹیں۔",
    "Drag the crop frame or its corners, then apply.":
      "کراپ فریم یا اس کے کونوں کو گھسیٹیں، پھر لاگو کریں۔",
    "Apply crop": "کراپ لاگو کریں",
    "Color": "رنگ",
    "Select drawing color": "ڈرائنگ کا رنگ منتخب کریں",
    "Stroke": "لکیر",
    "Crop": "کراپ",
    "Rotate": "گھمائیں",
    "Draw": "بنائیں",
    "Text": "متن",
    "Undo": "واپس کریں",
    "Reset": "ری سیٹ کریں",
    "Use original": "اصل استعمال کریں",
    "Retry failed": "دوبارہ کوشش ناکام ہو گئی",
    "Unable to retry": "دوبارہ کوشش نہیں ہو سکی",
    "This secure chat is not ready yet. Please try again in a moment.":
      "یہ محفوظ چیٹ ابھی تیار نہیں ہے۔ براہِ کرم تھوڑی دیر بعد دوبارہ کوشش کریں۔",
    "Load this image before editing it.": "ترمیم سے پہلے اس تصویر کو لوڈ کریں۔",
    "Spectre access includes one diffusion channel.":
      "Spectre رسائی میں ایک ڈفیوژن چینل شامل ہے۔",
    "Spectra logo": "Spectra لوگو",
    "{{width}} px": "{{width}} پکسل",
    "External links unavailable": "بیرونی روابط دستیاب نہیں",
    "External links are unavailable while Spectre Mode is active.":
      "Spectre موڈ فعال ہونے پر بیرونی روابط دستیاب نہیں ہوتے۔",
    "New encrypted message": "نیا رمز کردہ پیغام",
    "New message": "نیا پیغام",
    "New group message": "نیا گروپ پیغام",
    "Default": "طے شدہ",
    "Messages": "پیغامات",
    "Calls": "کالز",
    "Transfers": "منتقلیاں",
    "New message notifications": "نئے پیغام کی اطلاعات",
    "Secure call notifications": "محفوظ کال کی اطلاعات",
    "Wallet transfer notifications": "والٹ منتقلی کی اطلاعات",
    "Secure call": "محفوظ کال",
    "Snowflake bootstrap privacy notice": "Snowflake بوٹ اسٹریپ رازداری کا نوٹس",
    "Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.":
      "Snowflake، بروکر، STUN اور رضاکار پراکسی سروسز سمیت WebRTC بوٹ اسٹریپ انفراسٹرکچر استعمال کرتا ہے۔ یہ سروسز آپ کے ڈیوائس کا IP پتہ اور رابطے کا وقت دیکھ سکتی ہیں۔ سرکٹ قائم ہونے کے بعد Tor ٹریفک کو محفوظ کرتا ہے، مگر یہ بوٹ اسٹریپ رابطہ چھپا نہیں سکتا۔",
    "I understand": "میں سمجھ گیا/گئی",
    "Switching...": "تبدیل کیا جا رہا ہے…",
    "Import": "درآمد کریں",
    "Use": "استعمال کریں",
    "Erasing...": "مٹایا جا رہا ہے…",
    "Could not switch EXO account": "EXO اکاؤنٹ تبدیل نہیں ہو سکا",
    "Unable to switch EXO account": "EXO اکاؤنٹ تبدیل نہیں ہو سکا",
    "Switching EXO account...": "EXO اکاؤنٹ تبدیل کیا جا رہا ہے…",
    "Transparent EXO accounts are restored from your recovery phrase.":
      "شفاف EXO اکاؤنٹس آپ کے بازیابی کے جملے سے بحال ہوتے ہیں۔",
    "Failed to generate account": "اکاؤنٹ بنانا ناکام ہو گیا",
    "Confirm that you backed up the recovery phrase before using this EXO account.":
      "اس EXO اکاؤنٹ کو استعمال کرنے سے پہلے تصدیق کریں کہ آپ نے بازیابی کے جملے کا بیک اپ لے لیا ہے۔",
    "Failed to save EXO account": "EXO اکاؤنٹ محفوظ کرنا ناکام ہو گیا",
    "Regenerate": "دوبارہ بنائیں",
    "Create EXO Account": "EXO اکاؤنٹ بنائیں",
    "Create a new transparent EXO account for work, friends, or another chat identity.":
      "کام، دوستوں یا دوسری چیٹ شناخت کے لیے نیا شفاف EXO اکاؤنٹ بنائیں۔",
    "Root account required": "روٹ اکاؤنٹ درکار ہے",
    "Each recovery phrase restores up to 5 transparent EXO accounts.":
      "ہر بازیابی کا جملہ زیادہ سے زیادہ 5 شفاف EXO اکاؤنٹس بحال کرتا ہے۔",
    "Switch to your root EXO account to create transparent EXO accounts.":
      "شفاف EXO اکاؤنٹس بنانے کے لیے اپنے روٹ EXO اکاؤنٹ پر جائیں۔",
    "Generating secure keys...": "محفوظ کلیدیں بنائی جا رہی ہیں…",
    "New EXO Account": "نیا EXO اکاؤنٹ",
    "Never share your recovery phrase": "اپنا بازیابی کا جملہ کبھی شیئر نہ کریں",
    "This recovery phrase is shown only now. Store it offline before saving the new EXO account.":
      "یہ بازیابی کا جملہ صرف اب دکھایا جا رہا ہے۔ نیا EXO اکاؤنٹ محفوظ کرنے سے پہلے اسے آف لائن محفوظ کریں۔",
    "Tap to reveal your recovery phrase": "اپنا بازیابی کا جملہ ظاہر کرنے کے لیے ٹیپ کریں",
    "Make sure no one is watching your screen": "یقینی بنائیں کہ کوئی آپ کی اسکرین نہیں دیکھ رہا",
    "I backed up this recovery phrase offline.": "میں نے اس بازیابی کے جملے کا آف لائن بیک اپ لے لیا ہے۔",
    "Save and Use Account": "اکاؤنٹ محفوظ کریں اور استعمال کریں",
    "Invalid recovery phrase": "غلط بازیابی کا جملہ",
    "This EXO account already exists on this device.": "یہ EXO اکاؤنٹ پہلے ہی اس ڈیوائس پر موجود ہے۔",
    "Failed to import account": "اکاؤنٹ درآمد کرنا ناکام ہو گیا",
    "Import EXO Account": "EXO اکاؤنٹ درآمد کریں",
    "Import a transparent EXO recovery phrase into this unlocked root vault.":
      "شفاف EXO بازیابی کا جملہ اس ان لاک شدہ روٹ والٹ میں درآمد کریں۔",
    "You can import up to 5 transparent EXO accounts from one recovery phrase.":
      "آپ ایک بازیابی کے جملے سے زیادہ سے زیادہ 5 شفاف EXO اکاؤنٹس درآمد کر سکتے ہیں۔",
    "Switch to your root EXO account to import transparent EXO accounts.":
      "شفاف EXO اکاؤنٹس درآمد کرنے کے لیے اپنے روٹ EXO اکاؤنٹ پر جائیں۔",
    "Only import a recovery phrase you control. Imported accounts can send and receive chats independently.":
      "صرف وہی بازیابی کا جملہ درآمد کریں جو آپ کے اختیار میں ہو۔ درآمد شدہ اکاؤنٹس آزادانہ طور پر پیغامات بھیج اور وصول کر سکتے ہیں۔",
    "Account Name (Optional)": "اکاؤنٹ کا نام (اختیاری)",
    "Work, Friends, Personal...": "کام، دوست، ذاتی…",
    "Importing...": "درآمد کیا جا رہا ہے…",
    "Import and Use Account": "اکاؤنٹ درآمد کریں اور استعمال کریں",
    "Account ready": "اکاؤنٹ تیار ہے",
    "Connection problem": "رابطے کا مسئلہ",
    "Connecting securely...": "محفوظ طور پر رابطہ قائم کیا جا رہا ہے…",
    "Root account": "روٹ اکاؤنٹ",
    "EXO Account {{number}}": "EXO اکاؤنٹ {{number}}",
    "Chat identity did not finish switching. Try reconnecting.":
      "چیٹ شناخت کی تبدیلی مکمل نہیں ہوئی۔ دوبارہ رابطہ قائم کرنے کی کوشش کریں۔",
    "Chat identity is not ready for this EXO account.":
      "چیٹ شناخت اس EXO اکاؤنٹ کے لیے تیار نہیں ہے۔",
    "Could not verify the server session for this EXO account.":
      "اس EXO اکاؤنٹ کے لیے سرور سیشن کی تصدیق نہیں ہو سکی۔",
    "Publishing chat bundle...": "چیٹ بنڈل شائع کیا جا رہا ہے…",
    "Could not publish chat bundle.": "چیٹ بنڈل شائع نہیں ہو سکا۔",
    "Chat bundle is still missing from the server.": "چیٹ بنڈل اب بھی سرور پر موجود نہیں ہے۔",
    "Could not link this chat identity to the server.":
      "اس چیٹ شناخت کو سرور سے منسلک نہیں کیا جا سکا۔",
    "Could not prepare this EXO account.": "یہ EXO اکاؤنٹ تیار نہیں ہو سکا۔",
    "Could not switch back to the root EXO account.":
      "روٹ EXO اکاؤنٹ پر واپس نہیں جایا جا سکا۔",
    "Close": "بند کریں",
    "Refresh": "تازہ کریں",
    "At least 16 characters": "کم از کم 16 حروف",
    "Contacts: {{contacts}}": "روابط: {{contacts}}",
    "Contact Archive": "روابط کا محفوظہ",
    "Encrypted contact archive": "رمز کردہ رابطہ محفوظہ",
    "Export an encrypted file you control, then import it later to preserve saved contacts.":
      "اپنے اختیار میں موجود رمز کردہ فائل برآمد کریں، پھر محفوظ روابط برقرار رکھنے کے لیے اسے بعد میں درآمد کریں۔",
    "Archive Passphrase Required": "محفوظے کا پاس فقرہ درکار ہے",
    "Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.":
      "حروف، نمبروں اور علامتوں پر مشتمل کم از کم 16 حروف کا منفرد پاس فقرہ استعمال کریں۔ Spectra اسے بازیافت نہیں کر سکتا۔",
    "Save encrypted contact archive": "رمز کردہ رابطہ محفوظہ محفوظ کریں",
    "Archive Exported": "محفوظہ برآمد ہو گیا",
    "Export Failed": "برآمد ناکام ہو گئی",
    "Import Complete": "درآمد مکمل ہو گئی",
    "Import Failed": "درآمد ناکام ہو گئی",
    "Import contact archive?": "رابطہ محفوظہ درآمد کریں؟",
    "Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.":
      "درآمد شدہ روابط اس ڈیوائس پر پہلے سے موجود روابط کے ساتھ ملا دیے جاتے ہیں۔ چیٹس، پیغامات، سیشنز، گروپ کلیدیں اور میڈیا کبھی درآمد نہیں ہوتے۔",
    "Contact archives are unavailable while Spectre Mode is active.":
      "Spectre موڈ فعال ہونے پر رابطہ محفوظے دستیاب نہیں ہوتے۔",
    "No active wallet is available.": "کوئی فعال والٹ دستیاب نہیں ہے۔",
    "Unlock your vault before managing a contact archive.":
      "رابطہ محفوظہ سنبھالنے سے پہلے اپنا والٹ ان لاک کریں۔",
    "Contact archives are unavailable for Spectre accounts.":
      "Spectre اکاؤنٹس کے لیے رابطہ محفوظے دستیاب نہیں ہیں۔",
    "Archives unavailable": "محفوظے دستیاب نہیں",
    "The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.":
      "یہ محفوظہ شیئر کرنے سے پہلے اس ڈیوائس پر رمز کیا جاتا ہے۔ اسے کبھی Spectra پر اپ لوڈ نہیں کیا جاتا۔ فائل اور پاس فقرہ الگ الگ رکھیں؛ Spectra ان میں سے کسی کو بازیافت نہیں کر سکتا۔",
    "Archive Passphrase": "محفوظے کا پاس فقرہ",
    "Export file": "فائل برآمد کریں",
    "Import file": "فائل درآمد کریں",
    "Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.":
      "صرف محفوظ روابط اور رابطہ لیبل شامل ہوتے ہیں۔ موجودہ روابط برقرار رہتے ہیں، اور بحال شدہ روابط درآمد کے فوراً بعد دستیاب ہو جاتے ہیں۔",
    "A newer version of Spectra is available. Update to get the latest features and fixes.":
      "Spectra کا نیا ورژن دستیاب ہے۔ تازہ ترین خصوصیات اور اصلاحات حاصل کرنے کے لیے اپ ڈیٹ کریں۔",
    "This version of Spectra is no longer supported. Update to continue using secure services.":
      "Spectra کا یہ ورژن اب معاون نہیں ہے۔ محفوظ سروسز استعمال کرتے رہنے کے لیے ایپ اپ ڈیٹ کریں۔",
    "Update available": "اپ ڈیٹ دستیاب ہے",
    "Update required": "اپ ڈیٹ درکار ہے",
    "Update Spectra": "Spectra اپ ڈیٹ کریں",
  },
  auth: {
    "Account import progress": "اکاؤنٹ درآمد کی پیش رفت",
    "Deriving wallets...": "والٹس اخذ کیے جا رہے ہیں…",
    "Finishing previous account deletion...": "سابقہ اکاؤنٹ کی حذف کاری مکمل کی جا رہی ہے…",
    "Importing Account": "اکاؤنٹ درآمد کیا جا رہا ہے",
    "Public name contains unsupported characters": "عوامی نام میں غیر معاون حروف ہیں",
    "Public name is too large": "عوامی نام بہت بڑا ہے",
    "Public name must be {{max}} characters or fewer":
      "عوامی نام {{max}} یا اس سے کم حروف کا ہونا چاہیے",
    "Unable to use this public name": "یہ عوامی نام استعمال نہیں کیا جا سکتا",
    "Authenticate to upgrade biometric unlock":
      "بایومیٹرک ان لاک کو اپ گریڈ کرنے کے لیے تصدیق کریں",
    "Choose a Public Name": "عوامی نام منتخب کریں",
    "Go back": "واپس جائیں",
    "Important": "اہم",
    "Optional public name for chats": "چیٹس کے لیے اختیاری عوامی نام",
    "Public Name": "عوامی نام",
    "Public name contains invalid text.": "عوامی نام میں غلط متن ہے۔",
    "Public name contains unsupported control characters.":
      "عوامی نام میں غیر معاون کنٹرول حروف ہیں۔",
    "Public name contains unsupported direction controls.":
      "عوامی نام میں غیر معاون سمت کے کنٹرول موجود ہیں۔",
    "Public name is too large when encoded.": "رمز بندی کے بعد عوامی نام بہت بڑا ہے۔",
    "Public name must be 80 characters or fewer.":
      "عوامی نام 80 یا اس سے کم حروف کا ہونا چاہیے۔",
    "This optional name helps people recognize you in chats and contacts. You can change or remove it later.":
      "یہ اختیاری نام لوگوں کو چیٹس اور روابط میں آپ کو پہچاننے میں مدد دیتا ہے۔ آپ اسے بعد میں تبدیل یا ہٹا سکتے ہیں۔",
    "Your public name is shared as chat-directory metadata. It is not included in your recovery phrase and does not affect account security.":
      "آپ کا عوامی نام چیٹ ڈائریکٹری کے میٹا ڈیٹا کے طور پر شیئر کیا جاتا ہے۔ یہ آپ کے بازیابی کے جملے میں شامل نہیں اور اکاؤنٹ کی سکیورٹی کو متاثر نہیں کرتا۔",
    "{{count}} characters maximum.": "زیادہ سے زیادہ {{count}} حروف۔",
    "Unlock Spectra to connect your secure call":
      "اپنی محفوظ کال ملانے کے لیے Spectra کو ان لاک کریں",
    "PIN input": "PIN اندراج",
    "Mnemonic must be 12 or 24 words": "یادداشت کا جملہ 12 یا 24 الفاظ پر مشتمل ہونا چاہیے",
    "Invalid word: \"{{word}}\"": "غلط لفظ: \"{{word}}\"",
    "Invalid mnemonic checksum": "یادداشت کے جملے کا چیک سم غلط ہے",
  },
  chat: {
    "{{action}} {{name}}": "{{action}} {{name}}",
    "{{count}} messages": "{{count}} پیغامات",
    "{{name}} took a screenshot": "{{name}} نے اسکرین شاٹ لیا",
    "Add attachment": "منسلکہ شامل کریں",
    "Cancel reply": "جواب منسوخ کریں",
    "Load more": "مزید لوڈ کریں",
    "Record voice note": "صوتی نوٹ ریکارڈ کریں",
    "Remove attachment": "منسلکہ ہٹائیں",
    "Send message": "پیغام بھیجیں",
    "Toggle one-time message": "ایک بار کے پیغام کو تبدیل کریں",
    "Updated {{time}}": "{{time}} پر تازہ کیا گیا",
    "You took a screenshot": "آپ نے اسکرین شاٹ لیا",
    "Edit image": "تصویر میں ترمیم کریں",
    "Choose a contact or use a secure invitation":
      "کوئی رابطہ منتخب کریں یا محفوظ دعوت استعمال کریں",
    "Add by invitation": "دعوت کے ذریعے شامل کریں",
    "Paste a secure invitation or scan its QR code":
      "محفوظ دعوت چسپاں کریں یا اس کا QR کوڈ اسکین کریں",
    "Paste a secure invitation or scan its QR code to start.":
      "شروع کرنے کے لیے محفوظ دعوت چسپاں کریں یا اس کا QR کوڈ اسکین کریں۔",
    "Start Secret Chat": "خفیہ چیٹ شروع کریں",
    "Choose a contact or start with an address":
      "کوئی رابطہ منتخب کریں یا پتے سے شروع کریں",
    "Starting from {{account}}": "{{account}} سے شروع کیا جا رہا ہے",
    "Add by address": "پتے سے شامل کریں",
    "Add a contact and open a private chat": "رابطہ شامل کریں اور نجی چیٹ کھولیں",
    "Start Chat": "چیٹ شروع کریں",
    "Scan, add, and start a private chat": "اسکین کریں، شامل کریں اور نجی چیٹ شروع کریں",
    "Select from contacts": "روابط سے منتخب کریں",
    "No saved contacts yet": "ابھی کوئی رابطہ محفوظ نہیں ہے",
    "Add someone by address or scan their QR code to start.":
      "شروع کرنے کے لیے کسی کو پتے سے شامل کریں یا ان کا QR کوڈ اسکین کریں۔",
    "Starting chat...": "چیٹ شروع کی جا رہی ہے…",
    "Unable to start chat": "چیٹ شروع نہیں ہو سکی",
    "Nearby": "قریب",
    "Cancel voice note": "صوتی نوٹ منسوخ کریں",
    "Send voice note": "صوتی نوٹ بھیجیں",
    "Play voice note": "صوتی نوٹ چلائیں",
    "Pause voice note": "صوتی نوٹ روکیں",
    "Text overlay": "متن کی تہہ",
    "Crop frame": "کراپ فریم",
    "Crop top-left handle": "کراپ کا اوپری بایاں ہینڈل",
    "Crop top-right handle": "کراپ کا اوپری دایاں ہینڈل",
    "Crop bottom-left handle": "کراپ کا نچلا بایاں ہینڈل",
    "Crop bottom-right handle": "کراپ کا نچلا دایاں ہینڈل",
    "#Tag": "#ٹیگ",
    "Sending attachment": "منسلکہ بھیجا جا رہا ہے",
    "Preparing message": "پیغام تیار کیا جا رہا ہے",
    "Sending message": "پیغام بھیجا جا رہا ہے",
    "Caching locally": "مقامی طور پر کیش کیا جا رہا ہے",
    "Complete": "مکمل",
    "Encrypting and uploading {{completed}}/{{total}}":
      "{{completed}}/{{total}} رمز اور اپ لوڈ کیا جا رہا ہے",
    "Sending nearby": "قریب بھیجا جا رہا ہے",
    "Queued nearby": "قریب کے لیے قطار میں ہے",
    "Nearby delivery expired": "قریب کی ترسیل کی میعاد ختم ہو گئی",
    "Nearby retry limit reached": "قریب کے لیے دوبارہ کوشش کی حد پوری ہو گئی",
    "Nearby queue full": "قریب کی قطار بھری ہوئی ہے",
    "Nearby delivery interrupted": "قریب کی ترسیل میں خلل آ گیا",
    "Nearby receipt timed out": "قریب کی رسید کا وقت ختم ہو گیا",
    "Nearby transmission failed": "قریب کی ترسیل ناکام ہو گئی",
    "Nearby delivery failed": "قریب کی حوالگی ناکام ہو گئی",
  },
  contacts: {
    "Please wait until the EXO account switch finishes.":
      "EXO اکاؤنٹ کی تبدیلی مکمل ہونے تک انتظار کریں۔",
    "Paste a valid secure contact invitation.": "درست محفوظ رابطہ دعوت چسپاں کریں۔",
    "Paste a secure contact invitation or scan a contact QR code":
      "محفوظ رابطہ دعوت چسپاں کریں یا رابطے کا QR کوڈ اسکین کریں",
    "Invalid secure contact invitation": "غلط محفوظ رابطہ دعوت",
    "Add by secure contact invitation": "محفوظ رابطہ دعوت کے ذریعے شامل کریں",
    "Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.":
      "رابطے کا QR کوڈ اسکین کریں یا اس شخص کی شیئر کردہ محفوظ رابطہ دعوت چسپاں کریں جسے آپ شامل کرنا چاہتے ہیں۔",
    "Secure Contact Invitation": "محفوظ رابطہ دعوت",
    "Secure invitation ready": "محفوظ دعوت تیار ہے",
    "Invalid contact invitation": "غلط رابطہ دعوت",
    "Scan a secure Spectra contact QR code shared by the person you want to add.":
      "اس شخص کا شیئر کردہ محفوظ Spectra رابطہ QR کوڈ اسکین کریں جسے آپ شامل کرنا چاہتے ہیں۔",
    "Paste a secure contact invitation or scan its QR code.":
      "محفوظ رابطہ دعوت چسپاں کریں یا اس کا QR کوڈ اسکین کریں۔",
    "EXO Account": "EXO اکاؤنٹ",
    "Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.":
      "جس شخص کو آپ شامل کرنا چاہتے ہیں اس کا پوسٹ کوانٹم پتہ درج کریں۔ اس نے اپنا پتہ آپ کے ساتھ شیئر کیا ہونا چاہیے۔",
    "Adding to": "اس میں شامل کیا جا رہا ہے",
    "This contact will be saved under this EXO account on this device.":
      "یہ رابطہ اس ڈیوائس پر اسی EXO اکاؤنٹ کے تحت محفوظ ہو گا۔",
    "Selected": "منتخب شدہ",
    "Switching...": "تبدیل کیا جا رہا ہے…",
    "via {{account}}": "{{account}} کے ذریعے",
  },
  markets: {
    "0 (unlimited)": "0 (لامحدود)",
    "Amount exceeds remaining allowance": "رقم باقی اجازت سے زیادہ ہے",
    "Cannot contribute": "حصہ نہیں ڈالا جا سکتا",
    "Connect wallet to create a campaign": "مہم بنانے کے لیے والٹ منسلک کریں",
    "Connect wallet to create an escrow order": "ایسکرو آرڈر بنانے کے لیے والٹ منسلک کریں",
    "Connect wallet to view your campaigns": "اپنی مہمات دیکھنے کے لیے والٹ منسلک کریں",
    "Connect wallet to view your escrow orders": "اپنے ایسکرو آرڈرز دیکھنے کے لیے والٹ منسلک کریں",
    "Describe the condition for release...": "اجرا کی شرط بیان کریں…",
    "Enter a valid market ID": "درست مارکیٹ ID درج کریں",
    "Enter a valid sale ID": "درست فروخت ID درج کریں",
    "Fiat price must be greater than zero": "فیاٹ قیمت صفر سے زیادہ ہونی چاہیے",
    "Filled": "مکمل شدہ",
    "Invalid campaign ID": "غلط مہم ID",
    "Invalid order ID": "غلط آرڈر ID",
    "Invalid sale ID": "غلط فروخت ID",
    "No escrow orders found": "کوئی ایسکرو آرڈر نہیں ملا",
    "Partially Filled": "جزوی طور پر مکمل",
    "Yes": "ہاں",
    "You are not eligible to contribute": "آپ حصہ ڈالنے کے اہل نہیں ہیں",
    "Trending Markets": "رجحان ساز مارکیٹس",
    "Live Campaigns": "جاری مہمات",
    "Hot Predictions": "مقبول پیش گوئیاں",
    "See all": "سب دیکھیں",
    "Vol": "حجم",
    "of": "میں سے",
    "{{count}}m left": "{{count}} منٹ باقی",
    "{{count}}h left": "{{count}} گھنٹے باقی",
    "{{count}}d left": "{{count}} دن باقی",
    "No description": "کوئی وضاحت نہیں",
    "No order activity yet": "ابھی آرڈر کی کوئی سرگرمی نہیں",
    "Untitled campaign": "بے عنوان مہم",
    "{{count}} backers": "{{count}} معاونین",
  },
  settings: {
    "Activating secure online access": "محفوظ آن لائن رسائی فعال کی جا رہی ہے",
    "Publishing secure discovery": "محفوظ دریافت پذیری شائع کی جا رہی ہے",
    "Keeping you findable": "آپ کو قابلِ تلاش رکھنا",
    "Starting a secure chat": "محفوظ چیٹ شروع کی جا رہی ہے",
    "Creating one-time contact card": "ایک بار استعمال ہونے والا رابطہ کارڈ بنایا جا رہا ہے",
    "Computing VDF proof": "VDF ثبوت کا حساب لگایا جا رہا ہے",
    "Solving a sequential proof that helps prevent automated account creation.":
      "ترتیبی ثبوت حل کیا جا رہا ہے جو خودکار اکاؤنٹ بنانے کو روکنے میں مدد دیتا ہے۔",
    "Generating VDF proof": "VDF ثبوت تیار کیا جا رہا ہے",
    "Preparing the compact proof the server can verify efficiently.":
      "مختصر ثبوت تیار کیا جا رہا ہے جسے سرور مؤثر انداز میں جانچ سکتا ہے۔",
    "Waiting for server verification": "سرور کی تصدیق کا انتظار ہے",
    "Retrying server verification": "سرور کی تصدیق دوبارہ آزمائی جا رہی ہے",
    "Proof ready. The server enforces a minimum delay before it accepts it.":
      "ثبوت تیار ہے۔ سرور قبول کرنے سے پہلے کم از کم تاخیر نافذ کرتا ہے۔",
    "Verifying VDF proof": "VDF ثبوت کی تصدیق کی جا رہی ہے",
    "Sending the proof for secure verification.": "محفوظ تصدیق کے لیے ثبوت بھیجا جا رہا ہے۔",
    "Secure online access is ready": "محفوظ آن لائن رسائی تیار ہے",
    "Your secure online access is active.": "آپ کی محفوظ آن لائن رسائی فعال ہے۔",
    "VDF work was cancelled": "VDF کام منسوخ کر دیا گیا",
    "No proof was submitted.": "کوئی ثبوت جمع نہیں کرایا گیا۔",
    "Secure access needs attention": "محفوظ رسائی پر توجہ درکار ہے",
    "This proof could not be completed. Check your connection and try again.":
      "یہ ثبوت مکمل نہیں ہو سکا۔ اپنا رابطہ جانچیں اور دوبارہ کوشش کریں۔",
    "{{percent}}% complete": "{{percent}}% مکمل",
    "VDFs completed {{completed}}/{{total}}": "VDF مکمل {{completed}}/{{total}}",
    "{{rate}} VDF iterations/s": "{{rate}} VDF تکرار/سیکنڈ",
    "Measuring VDF rate…": "VDF رفتار ناپی جا رہی ہے…",
    "~{{count}}s remaining": "~{{count}} سیکنڈ باقی",
    "Cancel secure work": "محفوظ کام منسوخ کریں",
    "Could not start this chat": "یہ چیٹ شروع نہیں ہو سکی",
    "Could not update discovery": "دریافت اپ ڈیٹ نہیں ہو سکی",
    "Could not create contact card": "رابطہ کارڈ نہیں بنایا جا سکا",
    "Dismiss": "برخاست کریں",
    "Keep Spectra open while the security proof is verified.":
      "سیکیورٹی ثبوت کی تصدیق کے دوران Spectra کھلا رکھیں۔",
    "Account deleted": "اکاؤنٹ حذف کر دیا گیا",
    "Account deletion completed": "اکاؤنٹ حذف کرنا مکمل ہو گیا",
    "Account deletion needs attention": "اکاؤنٹ حذف کرنے پر توجہ درکار ہے",
    "A verified backend session is required before deleting this account.":
      "اس اکاؤنٹ کو حذف کرنے سے پہلے بیک اینڈ کے تصدیق شدہ سیشن کی ضرورت ہے۔",
    "Backend cleanup is paused and will be retried safely. Try checking again.":
      "بیک اینڈ کی صفائی موقوف ہے اور اسے محفوظ طریقے سے دوبارہ آزمایا جائے گا۔ دوبارہ جانچنے کی کوشش کریں۔",
    "Backend cleanup is still running. You can retry this status check safely.":
      "بیک اینڈ کی صفائی ابھی جاری ہے۔ آپ اس حالت کی جانچ محفوظ طریقے سے دوبارہ آزما سکتے ہیں۔",
    "Backend cleanup could not be checked. Retry when the private connection is available.":
      "بیک اینڈ کی صفائی کی جانچ نہیں ہو سکی۔ نجی رابطہ دستیاب ہونے پر دوبارہ کوشش کریں۔",
    "Backend deletion completed, but final device cleanup needs to be retried.":
      "بیک اینڈ کی حذف کاری مکمل ہو گئی، مگر ڈیوائس کی آخری صفائی دوبارہ درکار ہے۔",
    "Backend deletion completed, but local key erasure could not be confirmed.":
      "بیک اینڈ کی حذف کاری مکمل ہو گئی، مگر مقامی کلیدوں کے مٹانے کی تصدیق نہیں ہو سکی۔",
    "Cleanup could not be confirmed. You can retry safely.":
      "صفائی کی تصدیق نہیں ہو سکی۔ آپ محفوظ طریقے سے دوبارہ کوشش کر سکتے ہیں۔",
    "Deleting Account": "اکاؤنٹ حذف کیا جا رہا ہے",
    "Deleting account records": "اکاؤنٹ کے ریکارڈز حذف کیے جا رہے ہیں",
    "Deleting chat relay data": "چیٹ ریلے ڈیٹا حذف کیا جا رہا ہے",
    "Deleting encrypted objects": "رمز کردہ اشیا حذف کی جا رہی ہیں",
    "Deletion needs attention": "حذف کاری پر توجہ درکار ہے",
    "Erasing local keys and data": "مقامی کلیدیں اور ڈیٹا مٹایا جا رہا ہے",
    "Finalizing secure cleanup": "محفوظ صفائی مکمل کی جا رہی ہے",
    "Keep Spectra open while each verified cleanup stage completes.":
      "ہر تصدیق شدہ صفائی مرحلہ مکمل ہونے تک Spectra کھلا رکھیں۔",
    "Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.":
      "مقامی ڈیٹا مٹا دیا گیا ہے، مگر بیک اینڈ کی صفائی کی تصدیق نہیں ہو سکی۔ نجی رابطہ دستیاب ہونے پر دوبارہ کوشش کریں۔",
    "Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.":
      "مقامی ڈیٹا مٹا دیا گیا، مگر بیک اینڈ نے حذف کاری کی درخواست قبول نہیں کی۔ دوبارہ کوشش کے لیے اکاؤنٹ دوبارہ درآمد کریں۔",
    "Local data and the accepted backend cleanup have finished.":
      "مقامی ڈیٹا اور منظور شدہ بیک اینڈ صفائی مکمل ہو چکی ہے۔",
    "Preparing secure deletion": "محفوظ حذف کاری تیار کی جا رہی ہے",
    "Retry account deletion cleanup": "اکاؤنٹ حذف کرنے کی صفائی دوبارہ آزمائیں",
    "Retry cleanup": "صفائی دوبارہ آزمائیں",
    "Secure account deletion stopped unexpectedly. Try again when the private connection is available.":
      "محفوظ اکاؤنٹ حذف کاری غیر متوقع طور پر رک گئی۔ نجی رابطہ دستیاب ہونے پر دوبارہ کوشش کریں۔",
    "Secure deletion in progress": "محفوظ حذف کاری جاری ہے",
    "Submitting the deletion request": "حذف کاری کی درخواست جمع کرائی جا رہی ہے",
    "This cannot be undone. Local sensitive data is erased before the backend deletion request starts.":
      "اسے واپس نہیں کیا جا سکتا۔ بیک اینڈ حذف کاری کی درخواست شروع ہونے سے پہلے مقامی حساس ڈیٹا مٹا دیا جاتا ہے۔",
    "This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.":
      "یہ پہلے مقامی کلیدیں اور ڈیٹا حذف کرتا ہے، پھر آپ کے موجودہ نجی ٹرانسپورٹ پر بیک اینڈ صفائی جمع کراتا ہے۔ صفائی کی تصدیق ہونے تک پیش رفت کی اسکرین نظر آتی رہے گی۔",
    "This screen updates only when a cleanup stage is confirmed.":
      "یہ اسکرین صرف صفائی کے کسی مرحلے کی تصدیق ہونے پر تازہ ہوتی ہے۔",
    "The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.":
      "بیک اینڈ اب اس صفائی ٹوکن کو نہیں پہچانتا۔ حذف کاری کی تصدیق کے لیے اکاؤنٹ دوبارہ درآمد کریں۔",
    "The cleanup status token expired. Re-import the account to verify its status.":
      "صفائی کی حالت والے ٹوکن کی میعاد ختم ہو گئی۔ اس کی حالت جانچنے کے لیے اکاؤنٹ دوبارہ درآمد کریں۔",
    "There is no pending backend cleanup to retry.":
      "دوبارہ کوشش کے لیے کوئی زیر التوا بیک اینڈ صفائی نہیں ہے۔",
    "{{count}}s elapsed": "{{count}} سیکنڈ گزر چکے ہیں",
    "Applying Spectre protections": "Spectre تحفظات لاگو کیے جا رہے ہیں",
    "Keep this screen open while EXO prepares the secure activation handoff.":
      "EXO محفوظ فعال کاری کی منتقلی تیار کرتے وقت یہ اسکرین کھلی رکھیں۔",
    "Preparing Spectre Mode": "Spectre موڈ تیار کیا جا رہا ہے",
    "Preparing your Spectre account": "آپ کا Spectre اکاؤنٹ تیار کیا جا رہا ہے",
    "Registering the private account": "نجی اکاؤنٹ رجسٹر کیا جا رہا ہے",
    "Reserving private activation": "نجی فعال کاری محفوظ کی جا رہی ہے",
    "Changes were rolled back": "تبدیلیاں واپس لے لی گئیں",
    "Checking private access": "نجی رسائی کی جانچ کی جا رہی ہے",
    "Choose a new 6-digit PIN": "نیا 6 ہندسوں کا PIN منتخب کریں",
    "Confirm New PIN": "نئے PIN کی تصدیق کریں",
    "Connecting your private route": "آپ کا نجی راستہ مربوط کیا جا رہا ہے",
    "Enter Current PIN": "موجودہ PIN درج کریں",
    "Enter New PIN": "نیا PIN درج کریں",
    "Enter your current PIN": "اپنا موجودہ PIN درج کریں",
    "Enter your current PIN before creating a duress PIN":
      "دباؤ والے PIN کو بنانے سے پہلے اپنا موجودہ PIN درج کریں",
    "Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.":
      "دباؤ والا PIN درج کرنے سے بیک اینڈ اکاؤنٹ ڈیٹا اور اس ڈیوائس کا ڈیٹا مٹانے اور آپ کو فوراً سائن آؤٹ کرنے کی کوشش ہو گی۔",
    "EXO can continue refreshing chats in the background once Spectre is ready.":
      "Spectre تیار ہونے کے بعد EXO پس منظر میں چیٹس تازہ کرنا جاری رکھ سکتا ہے۔",
    "EXO has finished switching back from Spectre Mode.":
      "EXO نے Spectre موڈ سے واپس تبدیلی مکمل کر لی ہے۔",
    "EXO is validating your Spectre account and required protections before the private handoff starts.":
      "نجی منتقلی شروع ہونے سے پہلے EXO آپ کے Spectre اکاؤنٹ اور مطلوبہ تحفظات کی توثیق کر رہا ہے۔",
    "EXO is verifying the wallet session it uses for private network services.":
      "EXO نجی نیٹ ورک سروسز کے لیے استعمال ہونے والے والٹ سیشن کی تصدیق کر رہا ہے۔",
    "EXO stopped the Spectre flow and restored the previous safe state where it could.":
      "EXO نے Spectre کا عمل روک کر جہاں ممکن تھا سابقہ محفوظ حالت بحال کر دی۔",
    "Failed to change PIN": "PIN تبدیل کرنا ناکام ہو گیا",
    "Failed to disable Spectre Mode": "Spectre موڈ غیر فعال کرنا ناکام ہو گیا",
    "Failed to verify PIN": "PIN کی تصدیق ناکام ہو گئی",
    "Finalizing Spectre shutdown": "Spectre کا بند ہونا مکمل کیا جا رہا ہے",
    "Finishing the private handoff": "نجی منتقلی مکمل کی جا رہی ہے",
    "Getting Spectre ready": "Spectre تیار کیا جا رہا ہے",
    "Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.":
      "EXO Spectre موڈ کے لیے درکار رازداری کی تبدیلیاں لاگو کرتے وقت یہ اسکرین کھلی رکھیں۔",
    "Keep this screen open while EXO restores your regular wallet and security settings.":
      "EXO آپ کا معمول کا والٹ اور سکیورٹی ترتیبات بحال کرتے وقت یہ اسکرین کھلی رکھیں۔",
    "Loading your Spectre setup": "آپ کی Spectre ترتیب لوڈ ہو رہی ہے",
    "New PIN must be different from current PIN": "نیا PIN موجودہ PIN سے مختلف ہونا چاہیے",
    "PINs do not match": "PINs یکساں نہیں ہیں",
    "Preparing your private workspace": "آپ کی نجی ورک اسپیس تیار کی جا رہی ہے",
    "Preparing your Spectre setup": "آپ کی Spectre ترتیب تیار کی جا رہی ہے",
    "Re-enter your new PIN to confirm": "تصدیق کے لیے اپنا نیا PIN دوبارہ درج کریں",
    "Restoring network and cleanup": "نیٹ ورک اور صفائی بحال کی جا رہی ہے",
    "Restoring privacy protections": "رازداری کے تحفظات بحال کیے جا رہے ہیں",
    "Restoring your main profile": "آپ کا مرکزی پروفائل بحال کیا جا رہا ہے",
    "Review the failed step below before trying again.":
      "دوبارہ کوشش سے پہلے نیچے ناکام مرحلے کا جائزہ لیں۔",
    "Spectre cannot finish until Tor is connected. Try bridges or a different network.":
      "Tor کے مربوط ہونے تک Spectre مکمل نہیں ہو سکتا۔ برجز یا مختلف نیٹ ورک آزمائیں۔",
    "Spectre chats and contacts are still refreshing in the background.":
      "Spectre چیٹس اور روابط ابھی بھی پس منظر میں تازہ ہو رہے ہیں۔",
    "Spectre needs your attention": "Spectre کو آپ کی توجہ درکار ہے",
    "Spectre protections are active": "Spectre تحفظات فعال ہیں",
    "Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.":
      "Spectre کالز اور کرپٹو اعمال غیر فعال کرتا ہے؛ پش ٹوکنز ہٹاتا ہے؛ Tor، دباؤ والا PIN، ناکامی پر صفائی، اسکرین شاٹ تحفظ اور ایپ سوئچر رازداری نافذ کرتا ہے؛ اور نئے پیغامات کے لیے مختصر غائب ہونے والے ٹائمر طے کرتا ہے۔",
    "Switching back to your main wallet": "آپ کے مرکزی والٹ پر واپس جایا جا رہا ہے",
    "Switching to your Spectre identity": "آپ کی Spectre شناخت پر جایا جا رہا ہے",
    "This screen updates automatically as each Spectre stage finishes.":
      "ہر Spectre مرحلہ مکمل ہونے پر یہ اسکرین خودکار طور پر تازہ ہوتی ہے۔",
    "Tor could not connect": "Tor رابطہ قائم نہیں کر سکا",
    "Tor must be online before Spectre can switch identities and continue.":
      "Spectre کے شناخت تبدیل کرنے اور جاری رکھنے سے پہلے Tor کا آن لائن ہونا ضروری ہے۔",
    "Tor routing applies only inside Spectra. Device-wide network routing is unchanged.":
      "Tor روٹنگ صرف Spectra کے اندر لاگو ہوتی ہے۔ پورے ڈیوائس کی نیٹ ورک روٹنگ میں کوئی تبدیلی نہیں ہوتی۔",
    "Verify Primary PIN": "بنیادی PIN کی تصدیق کریں",
    "Verify your identity to change PIN": "PIN تبدیل کرنے کے لیے اپنی شناخت کی تصدیق کریں",
    "Verifying private access": "نجی رسائی کی تصدیق کی جا رہی ہے",
    "Your main wallet is restored": "آپ کا مرکزی والٹ بحال ہو گیا ہے",
    "Your PIN has been changed successfully.": "آپ کا PIN کامیابی سے تبدیل کر دیا گیا ہے۔",
    "Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.":
      "آپ کا Spectre والٹ اور Tor سرنگ تیار ہیں۔ چیٹس اور روابط کی تازہ کاری پس منظر میں مکمل ہو سکتی ہے۔",
    "Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.":
      "آپ کا Spectre والٹ فعال ہے۔ EXO اس نجی پروفائل کے لیے ذخیرہ دائرہ تبدیل کر کے مقامی ڈیٹا لوڈ کر رہا ہے۔",
    "This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.":
      "یہ اس EXO اکاؤنٹ کو اس ڈیوائس سے ہٹا کر اس بازیابی کے جملے کے لیے ایک شفاف EXO جگہ خالی کرتا ہے۔ اس اکاؤنٹ کے موجودہ پیغامات مقامی طور پر مٹا دیے جاتے ہیں۔ اسے واپس نہیں کیا جا سکتا۔",
    "Erase Account Permanently?": "اکاؤنٹ مستقل طور پر مٹائیں؟",
    "This cannot be undone. Backend data and local sensitive data will be erased for this account.":
      "اسے واپس نہیں کیا جا سکتا۔ اس اکاؤنٹ کا بیک اینڈ ڈیٹا اور مقامی حساس ڈیٹا مٹا دیا جائے گا۔",
    "Erase Everything": "سب کچھ مٹا دیں",
    "Cloud Session Required": "کلاؤڈ سیشن درکار ہے",
    "Unlock or reconnect to the backend before deleting the account.":
      "اکاؤنٹ حذف کرنے سے پہلے ان لاک کریں یا بیک اینڈ سے دوبارہ رابطہ قائم کریں۔",
    "Account deletion failed. Try again after checking your connection.":
      "اکاؤنٹ حذف کرنا ناکام ہو گیا۔ رابطہ جانچنے کے بعد دوبارہ کوشش کریں۔",
    "Account Deletion Failed": "اکاؤنٹ حذف کرنا ناکام ہو گیا",
    "Confirm Account Deletion": "اکاؤنٹ حذف کرنے کی تصدیق کریں",
    "Enter your PIN to continue to the final destructive confirmation.":
      "آخری ناقابل واپسی تصدیق تک جانے کے لیے اپنا PIN درج کریں۔",
    "Account Deletion": "اکاؤنٹ حذف کاری",
    "{{count}}s elapsed - this may take 30-240 seconds with bridges":
      "{{count}} سیکنڈ گزر چکے ہیں — برجز کے ساتھ اس میں 30 سے 240 سیکنڈ لگ سکتے ہیں",
    "Switch to your root EXO account to create or import transparent EXO accounts.":
      "شفاف EXO اکاؤنٹس بنانے یا درآمد کرنے کے لیے اپنے روٹ EXO اکاؤنٹ پر جائیں۔",
    "Failed to disable an expired Spectre session":
      "میعاد ختم شدہ Spectre سیشن غیر فعال کرنا ناکام ہو گیا",
    "Disabled by Spectre Mode": "Spectre موڈ کے ذریعے غیر فعال",
    "Contact Archive": "روابط کا محفوظہ",
    "Encrypted contact archive": "رمز کردہ رابطہ محفوظہ",
    "Export an encrypted file you control, then import it later to preserve saved contacts.":
      "اپنے اختیار میں موجود رمز کردہ فائل برآمد کریں، پھر محفوظ روابط برقرار رکھنے کے لیے اسے بعد میں درآمد کریں۔",
    "Export and import encrypted contacts": "رمز کردہ روابط برآمد اور درآمد کریں",
    "Unable to complete Spectre activation": "Spectre فعال کاری مکمل نہیں ہو سکی",
    "One anonymous activation token can be requested every 24 hours.":
      "ہر 24 گھنٹے میں ایک گمنام فعال کاری ٹوکن کی درخواست کی جا سکتی ہے۔",
    "Backend is not configured for Spectre activation":
      "بیک اینڈ Spectre فعال کاری کے لیے ترتیب یافتہ نہیں ہے",
    "A verified Backend session is required for Spectre activation":
      "Spectre فعال کاری کے لیے تصدیق شدہ بیک اینڈ سیشن درکار ہے",
    "Failed to refresh Spectre access": "Spectre رسائی تازہ کرنا ناکام ہو گیا",
  },
  profile: {
    "Show VDF progress": "VDF پیش رفت دکھائیں",
    "Proofs still run in the background when this is off.":
      "یہ بند ہونے پر بھی ثبوت پس منظر میں چلتے رہتے ہیں۔",
    "Public name contains unsupported characters": "عوامی نام میں غیر معاون حروف ہیں",
    "Public name is too large": "عوامی نام بہت بڑا ہے",
    "Public name must be {{max}} characters or fewer":
      "عوامی نام {{max}} یا اس سے کم حروف کا ہونا چاہیے",
    "Unable to use this public name": "یہ عوامی نام استعمال نہیں کیا جا سکتا",
    "Change Photo": "تصویر تبدیل کریں",
    "Chat bundle not on server — others cannot find you":
      "چیٹ بنڈل سرور پر نہیں ہے — دوسرے آپ کو نہیں ڈھونڈ سکتے",
    "Chat bundle registered on server": "چیٹ بنڈل سرور پر رجسٹر ہے",
    "Chat identity not available. Please restart the app.":
      "چیٹ شناخت دستیاب نہیں ہے۔ براہِ کرم ایپ دوبارہ شروع کریں۔",
    "Checking chat bundle...": "چیٹ بنڈل جانچا جا رہا ہے…",
    "Checking identity link...": "شناخت کے رابطے کی جانچ کی جا رہی ہے…",
    "Could not link identity. Please try again.": "شناخت منسلک نہیں ہو سکی۔ براہِ کرم دوبارہ کوشش کریں۔",
    "Could not refresh session. Check your connection.":
      "سیشن تازہ نہیں ہو سکا۔ اپنا رابطہ جانچیں۔",
    "Edit Profile": "پروفائل میں ترمیم کریں",
    "Identity linked to server": "شناخت سرور سے منسلک ہے",
    "Identity not linked — messaging is disabled": "شناخت منسلک نہیں — پیغام رسانی غیر فعال ہے",
    "Member since {{date}}": "{{date}} سے رکن",
    "Security Status": "سکیورٹی کی حالت",
    "Server session active": "سرور سیشن فعال ہے",
    "Server session expired — features may not work":
      "سرور سیشن کی میعاد ختم ہو گئی — خصوصیات کام نہیں کر سکتیں",
    "This name is visible to your contacts": "یہ نام آپ کے روابط کو نظر آتا ہے",
    "Unknown error": "نامعلوم خرابی",
    "Profile photos cannot be changed while Spectre Mode is active.":
      "Spectre موڈ فعال ہونے پر پروفائل کی تصاویر تبدیل نہیں کی جا سکتیں۔",
    "Photo disabled in Spectre Mode": "Spectre موڈ میں تصویر غیر فعال ہے",
    "Account Label": "اکاؤنٹ لیبل",
    "Name this account": "اس اکاؤنٹ کو نام دیں",
    "This is a local label to help you identify this account. It is not your public chat name.":
      "یہ مقامی لیبل آپ کو اس اکاؤنٹ کی شناخت میں مدد دیتا ہے۔ یہ آپ کا عوامی چیٹ نام نہیں ہے۔",
    "Public profile names cannot be edited while Spectre Mode is active.":
      "Spectre موڈ فعال ہونے پر عوامی پروفائل ناموں میں ترمیم نہیں کی جا سکتی۔",
    "Public Name": "عوامی نام",
    "Public name contains invalid text.": "عوامی نام میں غلط متن ہے۔",
    "Public name contains unsupported control characters.":
      "عوامی نام میں غیر معاون کنٹرول حروف ہیں۔",
    "Public name contains unsupported direction controls.":
      "عوامی نام میں غیر معاون سمت کے کنٹرول موجود ہیں۔",
    "Public name is too large when encoded.": "رمز بندی کے بعد عوامی نام بہت بڑا ہے۔",
    "Public name must be 80 characters or fewer.":
      "عوامی نام 80 یا اس سے کم حروف کا ہونا چاہیے۔",
    "Optional public name for chats": "چیٹس کے لیے اختیاری عوامی نام",
    "Publication needs attention. Retry when you are online.":
      "اشاعت پر توجہ درکار ہے۔ آن لائن ہونے پر دوبارہ کوشش کریں۔",
    "Published": "شائع شدہ",
    "Publishing public name...": "عوامی نام شائع کیا جا رہا ہے…",
    "Public profile metadata is read-only while Spectre Mode is active.":
      "Spectre موڈ فعال ہونے پر عوامی پروفائل میٹا ڈیٹا صرف پڑھنے کے لیے ہے۔",
    "Retry Publication": "اشاعت دوبارہ آزمائیں",
    "This repeatable name is public chat-directory metadata. People who have not saved you under another name can see it in chats and contacts. It appears in notifications only when both sides enable that privacy trade-off.":
      "یہ قابلِ تکرار نام عوامی چیٹ ڈائریکٹری کا میٹا ڈیٹا ہے۔ جن لوگوں نے آپ کو کسی اور نام سے محفوظ نہیں کیا وہ اسے چیٹس اور روابط میں دیکھ سکتے ہیں۔ یہ اطلاعات میں صرف تب ظاہر ہوتا ہے جب دونوں فریق اس رازداری کے سمجھوتے کو فعال کریں۔",
    "This public name is saved on this device and will publish when your chat identity is linked.":
      "یہ عوامی نام اس ڈیوائس پر محفوظ ہے اور آپ کی چیٹ شناخت منسلک ہونے پر شائع ہو جائے گا۔",
    "Waiting for chat readiness. Automatic retries are scheduled.":
      "چیٹ کے تیار ہونے کا انتظار ہے۔ خودکار دوبارہ کوششیں مقرر ہیں۔",
    "Save Public Name": "عوامی نام محفوظ کریں",
    "Preparing secure contact invitation…": "محفوظ رابطہ دعوت تیار کی جا رہی ہے…",
    "Preparing secure contact card…": "محفوظ رابطہ کارڈ تیار کیا جا رہا ہے…",
    "Preparing secure share…": "محفوظ شیئرنگ تیار کی جا رہی ہے…",
    "Create a one-time card to show your QR code.":
      "اپنا QR کوڈ دکھانے کے لیے ایک بار استعمال ہونے والا کارڈ بنائیں۔",
    "Create one-time contact card": "ایک بار استعمال ہونے والا رابطہ کارڈ بنائیں",
    "Publish for 5 minutes": "5 منٹ کے لیے شائع کریں",
    "Your account is discoverable for 5 minutes.": "آپ کا اکاؤنٹ 5 منٹ تک قابلِ تلاش ہے۔",
    "Your account is already discoverable.": "آپ کا اکاؤنٹ پہلے سے قابلِ تلاش ہے۔",
    "Your one-time contact card is still active.":
      "آپ کا ایک بار استعمال ہونے والا رابطہ کارڈ اب بھی فعال ہے۔",
    "Open one-time contact card": "ایک بار استعمال ہونے والا رابطہ کارڈ کھولیں",
    "One-time contact card ready": "ایک بار استعمال ہونے والا رابطہ کارڈ تیار ہے",
    "Expires in {{minutes}} min": "{{minutes}} منٹ میں ختم",
    "One-time contact card": "ایک بار استعمال ہونے والا رابطہ کارڈ",
    "Share this QR code before it expires.":
      "ختم ہونے سے پہلے یہ QR کوڈ شیئر کریں۔",
    "A one-time contact card expires after one hour and can be used once.":
      "ایک بار استعمال ہونے والا رابطہ کارڈ ایک گھنٹے بعد ختم ہو جاتا ہے اور صرف ایک بار استعمال کیا جا سکتا ہے۔",
    "Chat identity is not ready yet.": "چیٹ کی شناخت ابھی تیار نہیں ہے۔",
  },
  tor: {
    "Connected to Spectre": "Spectre سے مربوط",
  },
  crypto: {
    "~{{fee}} {{symbol}}": "تقریباً {{fee}} {{symbol}}",
    "{{symbol}} logo": "{{symbol}} لوگو",
    "USDT logo": "USDT لوگو",
  },
} satisfies LocaleTranslationOverrides

export default translations

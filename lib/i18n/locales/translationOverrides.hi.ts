/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LocaleTranslationOverrides } from './translationOverrideTypes'

const translations = {
  common: {
    "Creating your post-quantum identity...": "आपकी पोस्ट-क्वांटम पहचान बनाई जा रही है...",
    "Encrypted group sender keys": "एन्क्रिप्टेड समूह प्रेषक कुंजियाँ",
    "End-to-end encrypted": "एंड-टू-एंड एन्क्रिप्टेड",
    "End-to-end encryption available for supported chats":
      "समर्थित चैट के लिए एंड-टू-एंड एन्क्रिप्शन उपलब्ध है",
    "Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.":
      "समूह कुंजियाँ आपके मौजूदा एन्क्रिप्टेड सीधे सत्रों के माध्यम से वितरित की जाती हैं। किसी सदस्य को हटाने पर सक्रिय समूह कुंजी अपने आप बदल जाती है।",
    "Hybrid post-quantum messaging": "हाइब्रिड पोस्ट-क्वांटम मैसेजिंग",
    "ML-DSA-65 post-quantum signatures": "ML-DSA-65 पोस्ट-क्वांटम हस्ताक्षर",
    "Post-quantum": "पोस्ट-क्वांटम",
    "Post-quantum identity keys ready": "पोस्ट-क्वांटम पहचान कुंजियाँ तैयार हैं",
    "Securing your encrypted vault...": "आपका एन्क्रिप्टेड वॉल्ट सुरक्षित किया जा रहा है...",
    "Supported direct messages are end-to-end encrypted.":
      "समर्थित सीधे संदेश एंड-टू-एंड एन्क्रिप्टेड हैं।",
    " +{{count}} more": " +{{count}} और",
    "{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}":
      "{{bridgeCount}} {{transport}} ब्रिज लोड हुए। {{routeMessage}}",
    "{{count}} attachment_one": "{{count}} संलग्नक",
    "{{count}} attachment_other": "{{count}} संलग्नक",
    "{{count}} groups in common": "{{count}} समान समूह",
    "{{count}} slots available": "{{count}} स्लॉट उपलब्ध",
    "{{error}} This request used the normal network while Tor was disabled.":
      "{{error}} Tor अक्षम होने पर इस अनुरोध ने सामान्य नेटवर्क का उपयोग किया।",
    "{{network}} address": "{{network}} पता",
    "{{senderName}} requested": "{{senderName}} ने अनुरोध किया",
    "{{width}} px": "{{width}} पिक्सेल",
    "+ gas in": "+ गैस में",
    "Account Name (Optional)": "खाता नाम (वैकल्पिक)",
    "Account ready": "खाता तैयार है",
    "Add {{count}}": "{{count}} जोड़ें",
    "Add ETH before sending this token.": "इस टोकन को भेजने से पहले ETH जोड़ें।",
    "Add text": "टेक्स्ट जोड़ें",
    "Add user": "उपयोगकर्ता जोड़ें",
    "Allowed": "अनुमत",
    "Apply crop": "क्रॉप लागू करें",
    "Applying bridge configuration…": "ब्रिज कॉन्फ़िगरेशन लागू किया जा रहा है…",
    "Applying direct Tor…": "सीधा Tor लागू किया जा रहा है…",
    "Archive Exported": "संग्रह निर्यात किया गया",
    "Archive Passphrase": "संग्रह पासफ़्रेज़",
    "Archive Passphrase Required": "संग्रह पासफ़्रेज़ आवश्यक है",
    "Archives unavailable": "संग्रह उपलब्ध नहीं हैं",
    "At least 16 characters": "कम से कम 16 वर्ण",
    "Available": "उपलब्ध",
    "Back": "वापस",
    "BIP39 word suggestions": "BIP39 शब्द सुझाव",
    "Block": "ब्लॉक करें",
    "Block {{displayName}}? You will no longer receive messages from them.":
      "{{displayName}} को ब्लॉक करें? अब आपको उनसे संदेश नहीं मिलेंगे।",
    "Bridge Update Failed": "ब्रिज अपडेट विफल",
    "Buy": "खरीदें",
    "Calculated by network": "नेटवर्क द्वारा गणना की गई",
    "Calls": "कॉल",
    "Calls are only supported in direct chats.": "कॉल केवल प्रत्यक्ष चैट में समर्थित हैं।",
    "Calls unavailable": "कॉल उपलब्ध नहीं हैं",
    "Cancel Spectre Mode": "Spectre मोड रद्द करें",
    "Canceling Spectre Mode...": "Spectre मोड रद्द किया जा रहा है...",
    "Chat bundle is still missing from the server.": "चैट बंडल अभी भी सर्वर पर उपलब्ध नहीं है।",
    "Chat identity did not finish switching. Try reconnecting.":
      "चैट पहचान का स्विच पूरा नहीं हुआ। फिर से कनेक्ट करने का प्रयास करें।",
    "Chat identity is not ready for this EXO account.":
      "इस EXO खाते के लिए चैट पहचान तैयार नहीं है।",
    "Chat unavailable": "चैट उपलब्ध नहीं है",
    "Chats": "चैट",
    "Choose how long messages remain visible after they are read.":
      "संदेश पढ़े जाने के बाद कितनी देर तक दिखाई दें, चुनें।",
    "Claim Refund": "रिफ़ंड लें",
    "Clear chat": "चैट साफ़ करें",
    "Close": "बंद करें",
    "Close media preview": "मीडिया पूर्वावलोकन बंद करें",
    "Close poll failed": "पोल बंद नहीं किया जा सका",
    "Color": "रंग",
    "Confirm & Send": "पुष्टि करें और भेजें",
    "Confirm Payment": "भुगतान की पुष्टि करें",
    "Confirm that you backed up the recovery phrase before using this EXO account.":
      "इस EXO खाते का उपयोग करने से पहले पुष्टि करें कि आपने पुनर्प्राप्ति वाक्यांश का बैकअप लिया है।",
    "Confirm Transaction": "लेन-देन की पुष्टि करें",
    "Connecting encrypted chat...": "एन्क्रिप्टेड चैट से कनेक्ट किया जा रहा है...",
    "Connecting securely...": "सुरक्षित रूप से कनेक्ट किया जा रहा है...",
    "Connecting...": "कनेक्ट किया जा रहा है...",
    "Connection failed": "कनेक्शन विफल",
    "Connection problem": "कनेक्शन समस्या",
    "Contact Archive": "संपर्क संग्रह",
    "Contact archives are unavailable for Spectre accounts.":
      "Spectre खातों के लिए संपर्क संग्रह उपलब्ध नहीं हैं।",
    "Contact archives are unavailable while Spectre Mode is active.":
      "Spectre मोड सक्रिय होने पर संपर्क संग्रह उपलब्ध नहीं हैं।",
    "Contacts: {{contacts}}": "संपर्क: {{contacts}}",
    "Copy TX": "TX कॉपी करें",
    "Could not add members": "सदस्य जोड़े नहीं जा सके",
    "Could not import shared content": "साझा की गई सामग्री आयात नहीं की जा सकी",
    "Could not link this chat identity to the server.":
      "इस चैट पहचान को सर्वर से लिंक नहीं किया जा सका।",
    "Could not open this chat": "यह चैट खोली नहीं जा सकी",
    "Could not open this chat.": "यह चैट खोली नहीं जा सकी।",
    "Could not prepare this EXO account.": "यह EXO खाता तैयार नहीं किया जा सका।",
    "Could not publish chat bundle.": "चैट बंडल प्रकाशित नहीं किया जा सका।",
    "Could not save the edited image. Please try again.":
      "संपादित छवि सहेजी नहीं जा सकी। कृपया फिर प्रयास करें।",
    "Could not save your public name. Please try again.":
      "आपका सार्वजनिक नाम सहेजा नहीं जा सका। कृपया फिर प्रयास करें।",
    "Could not switch back to the root EXO account.":
      "रूट EXO खाते पर वापस स्विच नहीं किया जा सका।",
    "Could not switch EXO account": "EXO खाता स्विच नहीं किया जा सका",
    "Could not update notifications": "सूचनाएँ अपडेट नहीं की जा सकीं",
    "Could not update this image. Please try again.":
      "यह छवि अपडेट नहीं की जा सकी। कृपया फिर प्रयास करें।",
    "Could not verify the server session for this EXO account.":
      "इस EXO खाते के लिए सर्वर सत्र सत्यापित नहीं किया जा सका।",
    "Create a new transparent EXO account for work, friends, or another chat identity.":
      "काम, मित्रों या किसी अन्य चैट पहचान के लिए नया पारदर्शी EXO खाता बनाएँ।",
    "Create EXO Account": "EXO खाता बनाएँ",
    "Created": "बनाया गया",
    "Creator": "निर्माता",
    "Crop": "क्रॉप",
    "Default": "डिफ़ॉल्ट",
    "Diffusion channels require Spectre access.":
      "डिफ्यूज़न चैनलों के लिए Spectre पहुँच आवश्यक है।",
    "Disappearing messages": "गायब होने वाले संदेश",
    "Drag text on the image to reposition it.": "स्थिति बदलने के लिए छवि पर टेक्स्ट खींचें।",
    "Drag the crop frame or its corners, then apply.":
      "क्रॉप फ़्रेम या उसके कोनों को खींचें, फिर लागू करें।",
    "Draw": "आरेखित करें",
    "Each recovery phrase restores up to 5 transparent EXO accounts.":
      "हर पुनर्प्राप्ति वाक्यांश अधिकतम 5 पारदर्शी EXO खाते पुनर्स्थापित करता है।",
    "Edit": "संपादित करें",
    "Edit and resend": "संपादित करें और फिर भेजें",
    "Edit image": "छवि संपादित करें",
    "Encrypted contact archive": "एन्क्रिप्टेड संपर्क संग्रह",
    "Enter a valid amount": "मान्य राशि दर्ज करें",
    "Enter a valid EXO price greater than zero.": "शून्य से अधिक मान्य EXO मूल्य दर्ज करें।",
    "Erasing...": "मिटाया जा रहा है...",
    "ERC-20 on Ethereum Mainnet": "Ethereum Mainnet पर ERC-20",
    "ERC-20 Tokens": "ERC-20 टोकन",
    "Est. gas: {{amount}} {{symbol}}": "अनुमानित गैस: {{amount}} {{symbol}}",
    "Establishing secure call...": "सुरक्षित कॉल स्थापित की जा रही है...",
    "Estimated fee": "अनुमानित शुल्क",
    "EXO Account {{number}}": "EXO खाता {{number}}",
    "EXO account creation is disabled while Spectre Mode is active.":
      "Spectre मोड सक्रिय होने पर EXO खाता बनाना अक्षम है।",
    "External links are unavailable while Spectre Mode is active.":
      "Spectre मोड सक्रिय होने पर बाहरी लिंक उपलब्ध नहीं हैं।",
    "External links unavailable": "बाहरी लिंक उपलब्ध नहीं हैं",
    "Export an encrypted file you control, then import it later to preserve saved contacts.":
      "अपने नियंत्रण वाली एन्क्रिप्टेड फ़ाइल निर्यात करें, फिर सहेजे गए संपर्कों को सुरक्षित रखने के लिए उसे बाद में आयात करें।",
    "Export Failed": "निर्यात विफल",
    "Export file": "फ़ाइल निर्यात करें",
    "Failed to claim refund": "रिफ़ंड नहीं लिया जा सका",
    "Failed to complete the paid join flow": "सशुल्क शामिल होने की प्रक्रिया पूरी नहीं हो सकी",
    "Failed to create poll": "पोल बनाया नहीं जा सका",
    "Failed to create poll message": "पोल संदेश बनाया नहीं जा सका",
    "Failed to create request": "अनुरोध बनाया नहीं जा सका",
    "Failed to generate account": "खाता जनरेट नहीं किया जा सका",
    "Failed to import account": "खाता आयात नहीं किया जा सका",
    "Failed to Load": "लोड नहीं हो सका",
    "Failed to load market": "बाज़ार लोड नहीं किया जा सका",
    "Failed to save EXO account": "EXO खाता सहेजा नहीं जा सका",
    "Failed to save membership access settings": "सदस्यता पहुँच सेटिंग सहेजी नहीं जा सकी",
    "Failed to switch EXO account": "EXO खाता स्विच नहीं किया जा सका",
    "Failed to verify the payment confirmation.": "भुगतान पुष्टि सत्यापित नहीं की जा सकी।",
    "Fetched over the normal network while Tor was disabled.":
      "Tor अक्षम होने पर सामान्य नेटवर्क से प्राप्त किया गया।",
    "Generating secure keys...": "सुरक्षित कुंजियाँ बनाई जा रही हैं...",
    "Group members": "समूह सदस्य",
    "group-photo": "समूह-फ़ोटो",
    "Hidden": "छिपा हुआ",
    "Hide {{displayName}} from your Contacts tab on this device? Chats and encryption keys will stay intact.":
      "इस डिवाइस पर {{displayName}} को अपने संपर्क टैब से छिपाएँ? चैट और एन्क्रिप्शन कुंजियाँ सुरक्षित रहेंगी।",
    "Hide this contact's public name in your push notifications.":
      "अपनी पुश सूचनाओं में इस संपर्क का सार्वजनिक नाम छिपाएँ।",
    "I backed up this recovery phrase offline.":
      "मैंने इस पुनर्प्राप्ति वाक्यांश का ऑफ़लाइन बैकअप लिया है।",
    "I understand": "मैं समझता/समझती हूँ",
    "Import": "आयात करें",
    "Import a transparent EXO recovery phrase into this unlocked root vault.":
      "इस अनलॉक रूट वॉल्ट में एक पारदर्शी EXO पुनर्प्राप्ति वाक्यांश आयात करें।",
    "Import and Use Account": "खाता आयात करें और उपयोग करें",
    "Import Complete": "आयात पूरा हुआ",
    "Import contact archive?": "संपर्क संग्रह आयात करें?",
    "Import EXO Account": "EXO खाता आयात करें",
    "Import Failed": "आयात विफल",
    "Import file": "फ़ाइल आयात करें",
    "Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.":
      "आयात किए गए संपर्क इस डिवाइस पर पहले से मौजूद संपर्कों में मिला दिए जाते हैं। चैट, संदेश, सत्र, समूह कुंजियाँ और मीडिया कभी आयात नहीं किए जाते।",
    "Importing...": "आयात किया जा रहा है...",
    "Incorrect PIN": "गलत PIN",
    "Invalid {{network}} address": "अमान्य {{network}} पता",
    "Invalid amount": "अमान्य राशि",
    "Invalid market ID": "अमान्य बाज़ार ID",
    "Invalid recipient address": "अमान्य प्राप्तकर्ता पता",
    "Invalid recovery phrase": "अमान्य पुनर्प्राप्ति वाक्यांश",
    "Load this image before editing it.": "संपादित करने से पहले इस छवि को लोड करें।",
    "Loading pool data...": "पूल डेटा लोड किया जा रहा है...",
    "Loading shared content...": "साझा की गई सामग्री लोड की जा रही है...",
    "Loading voice note...": "वॉइस नोट लोड किया जा रहा है...",
    "Make sure no one is watching your screen": "सुनिश्चित करें कि कोई आपकी स्क्रीन नहीं देख रहा है",
    "Max": "अधिकतम",
    "Media": "मीडिया",
    "Media, links and docs": "मीडिया, लिंक और दस्तावेज़",
    "Message unavailable": "संदेश उपलब्ध नहीं है",
    "Messages": "संदेश",
    "Minimize call": "कॉल छोटा करें",
    "Muted": "म्यूट",
    "My {{network}} Address": "मेरा {{network}} पता",
    "Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}":
      "न तो मांगा गया कॉन्फ़िगरेशन और न ही पिछले ब्रिज कनेक्ट हो सके। Tor सक्षम रहेगा और बैकएंड ट्रैफ़िक अवरुद्ध रहेगा। {{error}}",
    "Network": "नेटवर्क",
    "Network Fee": "नेटवर्क शुल्क",
    "Network State": "नेटवर्क स्थिति",
    "Network: Mozaga native EXO": "नेटवर्क: Mozaga मूल EXO",
    "Never share your recovery phrase": "अपना पुनर्प्राप्ति वाक्यांश कभी साझा न करें",
    "New encrypted message": "नया एन्क्रिप्टेड संदेश",
    "New EXO Account": "नया EXO खाता",
    "New group message": "नया समूह संदेश",
    "New message": "नया संदेश",
    "Next": "अगला",
    "No active wallet is available.": "कोई सक्रिय वॉलेट उपलब्ध नहीं है।",
    "No address for this network": "इस नेटवर्क के लिए कोई पता नहीं है",
    "No documents shared yet": "अभी तक कोई दस्तावेज़ साझा नहीं किया गया है",
    "No links shared yet": "अभी तक कोई लिंक साझा नहीं किया गया है",
    "No Spectra chats are available for sharing yet.": "साझा करने के लिए अभी कोई Spectra चैट उपलब्ध नहीं है।",
    "No tokens found": "कोई टोकन नहीं मिला",
    "Notifications": "सूचनाएँ",
    "On": "चालू",
    "Only import a recovery phrase you control. Imported accounts can send and receive chats independently.":
      "केवल वही पुनर्प्राप्ति वाक्यांश आयात करें जिस पर आपका नियंत्रण हो। आयात किए गए खाते स्वतंत्र रूप से संदेश भेज और प्राप्त कर सकते हैं।",
    "Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.":
      "केवल सहेजे गए संपर्क और संपर्क लेबल शामिल किए जाते हैं। मौजूदा संपर्क रखे जाते हैं और पुनर्स्थापित संपर्क आयात के तुरंत बाद उपलब्ध हो जाते हैं।",
    "Opening...": "खोला जा रहा है...",
    "Paid access setup incomplete": "सशुल्क पहुँच सेटअप अधूरा है",
    "Paid by {{payerName}}": "{{payerName}} द्वारा भुगतान किया गया",
    "Paid in {{symbol}}": "{{symbol}} में भुगतान किया गया",
    "Paste recovery phrase": "पुनर्प्राप्ति वाक्यांश चिपकाएँ",
    "Pay {{amount}}": "{{amount}} का भुगतान करें",
    "Pay request": "भुगतान अनुरोध का भुगतान करें",
    "Payment": "भुगतान",
    "Payment already submitted": "भुगतान पहले ही भेजा जा चुका है",
    "Payment failed": "भुगतान विफल हुआ",
    "Payment message received": "भुगतान संदेश प्राप्त हुआ",
    "Payment paid": "भुगतान किया गया",
    "Payment Pending": "भुगतान लंबित है",
    "Payment recorded": "भुगतान दर्ज किया गया",
    "Payment request: {{amount}} {{symbol}}": "भुगतान अनुरोध: {{amount}} {{symbol}}",
    "Payment Required": "भुगतान आवश्यक है",
    "Payment submitted": "भुगतान भेज दिया गया",
    "Payment submitted: {{amount}} {{symbol}}": "भुगतान भेज दिया गया: {{amount}} {{symbol}}",
    "Platform fee: {{fee}}": "प्लेटफ़ॉर्म शुल्क: {{fee}}",
    "Please allow access to your photo library to change the group photo.":
      "समूह फ़ोटो बदलने के लिए अपनी फ़ोटो लाइब्रेरी तक पहुँच दें।",
    "Please retry the chat setup first.": "कृपया पहले चैट सेटअप का पुनः प्रयास करें।",
    "Please wait until this chat is ready.": "कृपया इस चैट के तैयार होने तक प्रतीक्षा करें।",
    "Post request": "अनुरोध पोस्ट करें",
    "Preparing voice note...": "वॉइस नोट तैयार किया जा रहा है...",
    "Previous": "पिछला",
    "Previous Bridges Restored": "पिछले ब्रिज बहाल किए गए",
    "Private handoff": "निजी हस्तांतरण",
    "Public name in notifications": "सूचनाओं में सार्वजनिक नाम",
    "Publishing chat bundle...": "चैट बंडल प्रकाशित किया जा रहा है...",
    "Receive address": "प्राप्ति पता",
    "Receive Crypto": "क्रिप्टो प्राप्त करें",
    "Recipient": "प्राप्तकर्ता",
    "Recipient {{network}} Address": "प्राप्तकर्ता का {{network}} पता",
    "Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.":
      "प्राप्तकर्ता केवल Spectra के अंदर दिखाए जाते हैं। iOS को केवल Spectra ऐप गंतव्य दिखाई देता है।",
    "Reconnecting...": "फिर से कनेक्ट किया जा रहा है...",
    "Recovering secure call...": "सुरक्षित कॉल पुनर्प्राप्त की जा रही है...",
    "Recovery word {{number}}": "पुनर्प्राप्ति शब्द {{number}}",
    "Refresh": "रीफ़्रेश करें",
    "Regenerate": "फिर से बनाएँ",
    "Request a payment in this chat": "इस चैट में भुगतान का अनुरोध करें",
    "Requested asset is not available in this wallet":
      "माँगी गई संपत्ति इस वॉलेट में उपलब्ध नहीं है।",
    "Reset": "रीसेट करें",
    "Retry failed": "पुनःप्रयास विफल हुआ",
    "Review Send": "भेजने की समीक्षा करें",
    "Root account": "रूट खाता",
    "Root account required": "रूट खाता आवश्यक है",
    "Rotate": "घुमाएँ",
    "Save and Use Account": "खाता सहेजें और उपयोग करें",
    "Save encrypted contact archive": "एन्क्रिप्टेड संपर्क संग्रह सहेजें",
    "Search contacts...": "संपर्क खोजें...",
    "Secure call": "सुरक्षित कॉल",
    "Secure call notifications": "सुरक्षित कॉल सूचनाएँ",
    "Secure call waiting": "सुरक्षित कॉल प्रतीक्षारत है",
    "Securing chat...": "चैट सुरक्षित की जा रही है...",
    "Preparing secure channel...": "चैट सुरक्षित की जा रही है...",
    "Select Blockchain": "ब्लॉकचेन चुनें",
    "Select drawing color": "आरेखण का रंग चुनें",
    "Sell": "बेचें",
    "Send {{symbol}}": "{{symbol}} भेजें",
    "Send {{symbol}} to my {{network}} address:\n{{address}}":
      "मेरे {{network}} पते पर {{symbol}} भेजें:\n{{address}}",
    "Send ETH": "ETH भेजें",
    "Sending as {{account}}": "{{account}} के रूप में भेजा जा रहा है",
    "Sending transaction...": "लेन-देन भेजा जा रहा है...",
    "Share {{network}} Address": "{{network}} पता साझा करें",
    "Share contact": "संपर्क साझा करें",
    "Share to Spectra": "Spectra पर साझा करें",
    "Shared content is missing. Please share it again.":
      "साझा की गई सामग्री उपलब्ध नहीं है। कृपया इसे फिर से साझा करें।",
    "Show {{displayName}} in your Contacts tab again?":
      "अपने संपर्क टैब में {{displayName}} को फिर से दिखाएँ?",
    "Snowflake bootstrap privacy notice": "Snowflake बूटस्ट्रैप गोपनीयता सूचना",
    "Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.":
      "Snowflake, ब्रोकर, STUN और स्वयंसेवी प्रॉक्सी सेवाओं सहित WebRTC बूटस्ट्रैप ढाँचे का उपयोग करता है। वे सेवाएँ आपके डिवाइस का IP पता और कनेक्शन समय देख सकती हैं। सर्किट स्थापित होने के बाद Tor ट्रैफ़िक की रक्षा करता है, लेकिन इस बूटस्ट्रैप कनेक्शन को छिपा नहीं सकता।",
    "Solana private key is not available": "Solana निजी कुंजी उपलब्ध नहीं है",
    "Solana wallet not available": "Solana वॉलेट उपलब्ध नहीं है",
    "Something went wrong. Please try again.": "कुछ गलत हो गया। कृपया फिर प्रयास करें।",
    "Spectra logo": "Spectra लोगो",
    "Spectre access includes one diffusion channel.":
      "Spectre पहुँच में एक डिफ्यूज़न चैनल शामिल है।",
    "SPL Tokens": "SPL टोकन",
    "SPL tokens on Solana": "Solana पर SPL टोकन",
    "Stroke": "स्ट्रोक",
    "Switch to your root EXO account to create transparent EXO accounts.":
      "पारदर्शी EXO खाते बनाने के लिए अपने रूट EXO खाते पर स्विच करें।",
    "Switch to your root EXO account to import transparent EXO accounts.":
      "पारदर्शी EXO खाते आयात करने के लिए अपने रूट EXO खाते पर स्विच करें।",
    "Switching EXO account...": "EXO खाता स्विच किया जा रहा है...",
    "Switching...": "स्विच किया जा रहा है...",
    "Tap to load voice note": "वॉइस नोट लोड करने के लिए टैप करें",
    "Tap to reveal your recovery phrase": "अपना पुनर्प्राप्ति वाक्यांश दिखाने के लिए टैप करें",
    "Tap to review and pay": "समीक्षा करने और भुगतान करने के लिए टैप करें",
    "Tap to view shared links and documents": "साझा किए गए लिंक और दस्तावेज़ देखने के लिए टैप करें",
    "Text": "टेक्स्ट",
    "Text or link": "टेक्स्ट या लिंक",
    "The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.":
      "साझा करने से पहले इस डिवाइस पर संग्रह एन्क्रिप्ट किया जाता है। यह कभी Spectra पर अपलोड नहीं होता। फ़ाइल और पासफ़्रेज़ को अलग-अलग रखें; Spectra इनमें से किसी को पुनर्प्राप्त नहीं कर सकता।",
    "The payment transaction failed on-chain.": "भुगतान लेन-देन ऑन-चेन विफल हुआ।",
    "This EXO account already exists on this device.": "यह EXO खाता इस डिवाइस पर पहले से मौजूद है।",
    "This fetch used the normal network while Tor was disabled.":
      "Tor अक्षम होने पर इस अनुरोध में सामान्य नेटवर्क का उपयोग किया गया।",
    "This file is not available on this device yet.": "यह फ़ाइल अभी इस डिवाइस पर उपलब्ध नहीं है।",
    "This image could not be edited right now.": "यह छवि अभी संपादित नहीं की जा सकती।",
    "This message was deleted": "यह संदेश हटा दिया गया",
    "This recovery phrase is shown only now. Store it offline before saving the new EXO account.":
      "यह पुनर्प्राप्ति वाक्यांश केवल अभी दिखाया गया है। नया EXO खाता सहेजने से पहले इसे ऑफ़लाइन सुरक्षित रखें।",
    "This request has already been marked as paid.": "इस अनुरोध को पहले ही भुगतान किया गया चिह्नित किया जा चुका है।",
    "This secure chat is not ready yet. Please try again in a moment.":
      "यह सुरक्षित चैट अभी तैयार नहीं है। कृपया कुछ क्षण बाद फिर प्रयास करें।",
    "This voice note could not be loaded right now.": "यह वॉइस नोट अभी लोड नहीं किया जा सकता।",
    "This wallet does not have an account for {{network}}.":
      "इस वॉलेट में {{network}} के लिए खाता नहीं है।",
    "To": "को",
    "Toggle media controls": "मीडिया नियंत्रण टॉगल करें",
    "Tor Bridges": "Tor ब्रिज",
    "Tor Connection Failed": "Tor कनेक्शन विफल",
    "Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}":
      "Tor मांगे गए कॉन्फ़िगरेशन से कनेक्ट नहीं हो सका, इसलिए पिछले कार्यरत ब्रिज बहाल किए गए। {{error}}",
    "Tor is disabled, so bridge requests will use the normal network.":
      "Tor अक्षम है, इसलिए ब्रिज अनुरोध सामान्य नेटवर्क का उपयोग करेंगे।",
    "Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.":
      "Tor सक्षम है लेकिन कनेक्ट नहीं है। सामान्य नेटवर्क पर बूटस्ट्रैप ब्रिज प्राप्त करने से पहले Tor अक्षम करें।",
    "Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.":
      "Tor अभी भी कनेक्ट हो रहा है। Tor सर्किट उपलब्ध होने तक ब्रिज अनुरोध अवरुद्ध रहेंगे।",
    "Transaction failed on-chain": "लेन-देन ऑन-चेन विफल हुआ",
    "Transfers": "स्थानांतरण",
    "Transparent EXO accounts are restored from your recovery phrase.":
      "पारदर्शी EXO खाते आपके पुनर्प्राप्ति वाक्यांश से पुनर्स्थापित होते हैं।",
    "TRC-20 on Tron": "Tron पर TRC-20",
    "TRC-20 Tokens": "TRC-20 टोकन",
    "Tron private key is not available": "Tron निजी कुंजी उपलब्ध नहीं है",
    "Tron wallet not available": "Tron वॉलेट उपलब्ध नहीं है",
    "Try Again": "फिर प्रयास करें",
    "Unable to edit image": "छवि संपादित नहीं की जा सकती",
    "Unable to load voice note": "वॉइस नोट लोड नहीं किया जा सकता",
    "Unable to open link": "लिंक खोला नहीं जा सकता",
    "Unable to remove recipient": "प्राप्तकर्ता हटाया नहीं जा सकता",
    "Unable to retry": "पुनः प्रयास नहीं किया जा सकता",
    "Unable to send": "भेजा नहीं जा सकता",
    "Unable to switch EXO account": "EXO खाता स्विच नहीं किया जा सकता",
    "Unblock": "अनब्लॉक करें",
    "Unblock {{displayName}}? They will be able to send you messages again.":
      "{{displayName}} को अनब्लॉक करें? वे आपको फिर से संदेश भेज सकेंगे।",
    "Undo": "पूर्ववत करें",
    "Unlock the wallet that will pay for this membership and try again.":
      "इस सदस्यता के लिए भुगतान करने वाले वॉलेट को अनलॉक करें और फिर प्रयास करें।",
    "Unlock your vault before managing a contact archive.":
      "संपर्क संग्रह प्रबंधित करने से पहले अपना वॉल्ट अनलॉक करें।",
    "Unsupported {{type}} attachment": "असमर्थित {{type}} संलग्नक",
    "Unsupported attachment": "असमर्थित संलग्नक",
    "Upgrade to Spectre to create one diffusion channel.":
      "एक डिफ्यूज़न चैनल बनाने के लिए Spectre में अपग्रेड करें।",
    "Use": "उपयोग करें",
    "Use {{word}} for recovery word {{number}}":
      "पुनर्प्राप्ति शब्द {{number}} के लिए {{word}} का उपयोग करें",
    "Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.":
      "अक्षरों, संख्याओं और प्रतीकों सहित कम से कम 16 वर्णों वाला अनन्य पासफ़्रेज़ उपयोग करें। Spectra इसे पुनर्प्राप्त नहीं कर सकता।",
    "Use Biometric": "बायोमेट्रिक का उपयोग करें",
    "Use original": "मूल का उपयोग करें",
    "Use the original offline backup you created during onboarding if you need the phrase again. If it is lost, create a newly backed up wallet and migrate to it. The device cannot reveal the old phrase.":
      "यदि आपको वाक्यांश फिर से चाहिए, तो ऑनबोर्डिंग के दौरान बनाया गया मूल ऑफ़लाइन बैकअप उपयोग करें। यदि वह खो गया है, तो नए बैकअप वाले वॉलेट बनाएँ और उसमें माइग्रेट करें। डिवाइस पुराना वाक्यांश नहीं दिखा सकता।",
    "V1 supports Mozaga native EXO only. The company fee is {{fee}}.":
      "V1 केवल Mozaga मूल EXO का समर्थन करता है। कंपनी शुल्क {{fee}} है।",
    "via {{account}}": "{{account}} के माध्यम से",
    "Voice note unavailable": "वॉइस नोट उपलब्ध नहीं है",
    "Volume": "वॉल्यूम",
    "Wallet transfer notifications": "वॉलेट स्थानांतरण सूचनाएँ",
    "Wallets": "वॉलेट",
    "Work, Friends, Personal...": "काम, मित्र, व्यक्तिगत...",
    "You can import up to 5 transparent EXO accounts from one recovery phrase.":
      "आप एक पुनर्प्राप्ति वाक्यांश से अधिकतम 5 पारदर्शी EXO खाते आयात कर सकते हैं।",
    "You requested": "आपने अनुरोध किया",
    "You'll enter the {{network}} address in the next step":
      "अगले चरण में आप {{network}} पता दर्ज करेंगे",
    "Your payment was submitted but is still waiting for confirmation. Reopen this invite in a moment to finish joining.":
      "आपका भुगतान भेज दिया गया है, लेकिन पुष्टि की प्रतीक्षा है। शामिल होना पूरा करने के लिए कुछ क्षण बाद यह निमंत्रण फिर खोलें।",
    "New message notifications": "नए संदेश की सूचनाएँ",
    "A newer version of Spectra is available. Update to get the latest features and fixes.":
      "Spectra का नया संस्करण उपलब्ध है। नवीनतम सुविधाएँ और सुधार पाने के लिए ऐप अपडेट करें।",
    "This version of Spectra is no longer supported. Update to continue using secure services.":
      "Spectra का यह संस्करण अब समर्थित नहीं है। सुरक्षित सेवाओं का उपयोग जारी रखने के लिए ऐप अपडेट करें।",
    "Update available": "अपडेट उपलब्ध है",
    "Update required": "अपडेट आवश्यक है",
    "Update Spectra": "Spectra अपडेट करें",
  },
  auth: {
    "{{count}} characters maximum.": "अधिकतम {{count}} वर्ण।",
    "Account import progress": "खाता आयात प्रगति",
    "Authenticate to upgrade biometric unlock":
      "बायोमेट्रिक अनलॉक को अपग्रेड करने के लिए प्रमाणीकरण करें",
    "Choose a Public Name": "सार्वजनिक नाम चुनें",
    "Deriving wallets...": "वॉलेट निकाले जा रहे हैं...",
    "Finishing previous account deletion...":
      "पिछले खाता विलोपन को पूरा किया जा रहा है...",
    "Go back": "वापस जाएँ",
    "Important": "महत्वपूर्ण",
    "Importing Account": "खाता आयात किया जा रहा है",
    "Optional public name for chats": "चैट के लिए वैकल्पिक सार्वजनिक नाम",
    "PIN input": "PIN दर्ज करें",
    "Public Name": "सार्वजनिक नाम",
    "Public name contains invalid text.": "सार्वजनिक नाम में अमान्य पाठ है।",
    "Public name contains unsupported characters": "सार्वजनिक नाम में असमर्थित वर्ण हैं",
    "Public name contains unsupported control characters.":
      "सार्वजनिक नाम में असमर्थित नियंत्रण वर्ण हैं।",
    "Public name contains unsupported direction controls.":
      "सार्वजनिक नाम में असमर्थित दिशा-नियंत्रक वर्ण हैं।",
    "Public name is too large": "सार्वजनिक नाम बहुत बड़ा है",
    "Public name is too large when encoded.": "एन्कोड किए जाने पर सार्वजनिक नाम बहुत बड़ा है।",
    "Public name must be {{max}} characters or fewer":
      "सार्वजनिक नाम {{max}} वर्ण या उससे कम होना चाहिए",
    "Public name must be 80 characters or fewer.": "सार्वजनिक नाम 80 वर्ण या उससे कम होना चाहिए।",
    "This optional name helps people recognize you in chats and contacts. You can change or remove it later.":
      "यह वैकल्पिक नाम लोगों को चैट और संपर्कों में आपको पहचानने में मदद करता है। आप इसे बाद में बदल या हटा सकते हैं।",
    "Unable to use this public name": "इस सार्वजनिक नाम का उपयोग नहीं किया जा सकता",
    "Unlock Spectra to connect your secure call":
      "अपना सुरक्षित कॉल कनेक्ट करने के लिए Spectra अनलॉक करें",
    "Your public name is shared as chat-directory metadata. It is not included in your recovery phrase and does not affect account security.":
      "आपका सार्वजनिक नाम चैट-डायरेक्टरी मेटाडेटा के रूप में साझा किया जाता है। यह आपके पुनर्प्राप्ति वाक्यांश में शामिल नहीं है और खाता सुरक्षा को प्रभावित नहीं करता।",
    "Mnemonic must be 12 or 24 words": "म्नेमोनिक 12 या 24 शब्दों का होना चाहिए",
    'Invalid word: "{{word}}"': 'अमान्य शब्द: "{{word}}"',
    "Invalid mnemonic checksum": "अमान्य म्नेमोनिक चेकसम",
  },
  chat: {
    "{{count}} messages": "{{count}} संदेश",
    "{{name}} took a screenshot": "{{name}} ने स्क्रीनशॉट लिया",
    "#Tag": "#टैग",
    "Add a contact and open a private chat": "संपर्क जोड़ें और निजी चैट खोलें",
    "Add attachment": "संलग्नक जोड़ें",
    "Add by address": "पते से जोड़ें",
    "Add by invitation": "निमंत्रण से जोड़ें",
    "Add someone by address or scan their QR code to start.":
      "किसी को पते से जोड़ें या शुरू करने के लिए उनका QR कोड स्कैन करें।",
    "Caching locally": "स्थानीय रूप से कैश किया जा रहा है",
    "Cancel reply": "उत्तर रद्द करें",
    "Cancel voice note": "वॉइस नोट रद्द करें",
    "Choose a contact or start with an address": "संपर्क चुनें या पते से शुरू करें",
    "Choose a contact or use a secure invitation": "संपर्क चुनें या सुरक्षित निमंत्रण का उपयोग करें",
    "Complete": "पूर्ण",
    "Crop bottom-left handle": "क्रॉप नीचे-बाएँ हैंडल",
    "Crop bottom-right handle": "क्रॉप नीचे-दाएँ हैंडल",
    "Crop frame": "क्रॉप फ़्रेम",
    "Crop top-left handle": "क्रॉप ऊपर-बाएँ हैंडल",
    "Crop top-right handle": "क्रॉप ऊपर-दाएँ हैंडल",
    "Edit image": "छवि संपादित करें",
    "Encrypting and uploading {{completed}}/{{total}}":
      "एन्क्रिप्ट और अपलोड किया जा रहा है {{completed}}/{{total}}",
    "Load more": "और लोड करें",
    "Nearby": "पास में",
    "Nearby delivery expired": "निकटवर्ती डिलीवरी की समय-सीमा समाप्त हो गई",
    "Nearby delivery failed": "निकटवर्ती डिलीवरी विफल हुई",
    "Nearby delivery interrupted": "निकटवर्ती डिलीवरी बाधित हो गई",
    "Nearby queue full": "निकटवर्ती कतार भर गई है",
    "Nearby receipt timed out": "निकटवर्ती रसीद का समय समाप्त हो गया",
    "Nearby retry limit reached": "निकटवर्ती पुनःप्रयास सीमा पूरी हो गई",
    "Nearby transmission failed": "निकटवर्ती प्रसारण विफल हुआ",
    "No saved contacts yet": "अभी कोई सहेजा हुआ संपर्क नहीं है",
    "Paste a secure invitation or scan its QR code":
      "सुरक्षित निमंत्रण चिपकाएँ या उसका QR कोड स्कैन करें",
    "Paste a secure invitation or scan its QR code to start.":
      "शुरू करने के लिए सुरक्षित निमंत्रण चिपकाएँ या उसका QR कोड स्कैन करें।",
    "Pause voice note": "वॉइस नोट रोकें",
    "Play voice note": "वॉइस नोट चलाएँ",
    "Preparing message": "संदेश तैयार किया जा रहा है",
    "Queued nearby": "पास में भेजने के लिए कतार में",
    "Record voice note": "वॉइस नोट रिकॉर्ड करें",
    "Remove attachment": "संलग्नक हटाएँ",
    "Scan, add, and start a private chat": "स्कैन करें, जोड़ें और निजी चैट शुरू करें",
    "Select from contacts": "संपर्कों में से चुनें",
    "Send message": "संदेश भेजें",
    "Send voice note": "वॉइस नोट भेजें",
    "Sending attachment": "संलग्नक भेजा जा रहा है",
    "Sending message": "संदेश भेजा जा रहा है",
    "Sending nearby": "पास में भेजा जा रहा है",
    "Start Chat": "चैट शुरू करें",
    "Start Secret Chat": "गुप्त चैट शुरू करें",
    "Starting chat...": "चैट शुरू की जा रही है...",
    "Starting from {{account}}": "{{account}} से शुरू किया जा रहा है",
    "Text overlay": "टेक्स्ट ओवरले",
    "Toggle one-time message": "एकल-उपयोग संदेश टॉगल करें",
    "Unable to start chat": "चैट शुरू नहीं की जा सकी",
    "Updated {{time}}": "{{time}} को अपडेट किया गया",
    "You took a screenshot": "आपने स्क्रीनशॉट लिया",
  },
  contacts: {
    "Add by secure contact invitation": "सुरक्षित संपर्क निमंत्रण से जोड़ें",
    "Adding to": "में जोड़ा जा रहा है",
    "Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.":
      "जिस व्यक्ति को आप जोड़ना चाहते हैं उसका पोस्ट-क्वांटम पता दर्ज करें। उसने अपना पता आपके साथ साझा किया होना चाहिए।",
    "EXO Account": "EXO खाता",
    "Invalid contact invitation": "अमान्य संपर्क निमंत्रण",
    "Invalid secure contact invitation": "अमान्य सुरक्षित संपर्क निमंत्रण",
    "Paste a secure contact invitation or scan a contact QR code":
      "सुरक्षित संपर्क निमंत्रण चिपकाएँ या संपर्क QR कोड स्कैन करें",
    "Paste a secure contact invitation or scan its QR code.":
      "सुरक्षित संपर्क निमंत्रण चिपकाएँ या उसका QR कोड स्कैन करें।",
    "Paste a valid secure contact invitation.": "मान्य सुरक्षित संपर्क निमंत्रण चिपकाएँ।",
    "Please wait until the EXO account switch finishes.":
      "कृपया EXO खाता स्विच पूरा होने तक प्रतीक्षा करें।",
    "Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.":
      "जिस व्यक्ति को जोड़ना है उसके द्वारा साझा किया गया संपर्क QR कोड स्कैन करें या सुरक्षित संपर्क निमंत्रण चिपकाएँ।",
    "Scan a secure Spectra contact QR code shared by the person you want to add.":
      "जिस व्यक्ति को जोड़ना है उसके द्वारा साझा किया गया सुरक्षित Spectra संपर्क QR कोड स्कैन करें।",
    "Secure Contact Invitation": "सुरक्षित संपर्क निमंत्रण",
    "Secure invitation ready": "सुरक्षित निमंत्रण तैयार है",
    "Selected": "चयनित",
    "Switching...": "स्विच किया जा रहा है...",
    "This contact will be saved under this EXO account on this device.":
      "यह संपर्क इस डिवाइस पर इस EXO खाते के अंतर्गत सहेजा जाएगा।",
    "via {{account}}": "{{account}} के माध्यम से",
  },
  crypto: {
    "Ether": "ईथर",
    "~{{fee}} {{symbol}}": "लगभग {{fee}} {{symbol}}",
    "{{symbol}} logo": "{{symbol}} लोगो",
    "USDT logo": "USDT लोगो",
  },
  markets: {
    "{{count}} backers": "{{count}} समर्थक",
    "{{count}}d left": "{{count}} दिन शेष",
    "{{count}}h left": "{{count}} घंटे शेष",
    "{{count}}m left": "{{count}} मिनट शेष",
    "0 (unlimited)": "0 (असीमित)",
    "Amount exceeds remaining allowance": "राशि शेष अनुमत सीमा से अधिक है",
    "Cannot contribute": "योगदान नहीं कर सकते",
    "Connect wallet to create a campaign": "अभियान बनाने के लिए वॉलेट कनेक्ट करें",
    "Connect wallet to create an escrow order": "एस्क्रो ऑर्डर बनाने के लिए वॉलेट कनेक्ट करें",
    "Connect wallet to view your campaigns": "अपने अभियान देखने के लिए वॉलेट कनेक्ट करें",
    "Connect wallet to view your escrow orders": "अपने एस्क्रो ऑर्डर देखने के लिए वॉलेट कनेक्ट करें",
    "Describe the condition for release...": "जारी करने की शर्त का वर्णन करें...",
    "Enter a valid market ID": "मान्य बाज़ार ID दर्ज करें",
    "Enter a valid sale ID": "मान्य बिक्री ID दर्ज करें",
    "Fiat price must be greater than zero": "फिएट मूल्य शून्य से अधिक होना चाहिए",
    "Filled": "भरा गया",
    "Hot Predictions": "लोकप्रिय पूर्वानुमान",
    "Invalid campaign ID": "अमान्य अभियान ID",
    "Invalid order ID": "अमान्य ऑर्डर ID",
    "Invalid sale ID": "अमान्य बिक्री ID",
    "Live Campaigns": "लाइव अभियान",
    "No description": "कोई विवरण नहीं",
    "No escrow orders found": "कोई एस्क्रो ऑर्डर नहीं मिला",
    "No order activity yet": "अभी कोई ऑर्डर गतिविधि नहीं है",
    "of": "का",
    "Partially Filled": "आंशिक रूप से भरा गया",
    "See all": "सभी देखें",
    "Trending Markets": "रुझान वाले बाज़ार",
    "Untitled campaign": "शीर्षकहीन अभियान",
    "Vol": "मात्रा",
    "Yes": "हाँ",
    "You are not eligible to contribute": "आप योगदान के लिए पात्र नहीं हैं",
  },
  profile: {
    "Show VDF progress": "VDF प्रगति दिखाएँ",
    "Proofs still run in the background when this is off.":
      "इसके बंद होने पर भी प्रमाण पृष्ठभूमि में चलते रहते हैं।",
    "Account Label": "खाता लेबल",
    "Change Photo": "फ़ोटो बदलें",
    "Chat bundle not on server — others cannot find you":
      "चैट बंडल सर्वर पर नहीं है — अन्य लोग आपको नहीं ढूँढ सकते",
    "Chat bundle registered on server": "चैट बंडल सर्वर पर पंजीकृत है",
    "Chat identity not available. Please restart the app.":
      "चैट पहचान उपलब्ध नहीं है। कृपया ऐप पुनः प्रारंभ करें।",
    "Checking chat bundle...": "चैट बंडल जाँचा जा रहा है...",
    "Checking identity link...": "पहचान लिंक जाँचा जा रहा है...",
    "Could not link identity. Please try again.":
      "पहचान को लिंक नहीं किया जा सका। कृपया फिर से प्रयास करें।",
    "Could not refresh session. Check your connection.":
      "सत्र रीफ़्रेश नहीं किया जा सका। अपना कनेक्शन जाँचें।",
    "Edit Profile": "प्रोफ़ाइल संपादित करें",
    "Identity linked to server": "पहचान सर्वर से लिंक है",
    "Identity not linked — messaging is disabled": "पहचान लिंक नहीं है — संदेश भेजना अक्षम है",
    "Member since {{date}}": "{{date}} से सदस्य",
    "Name this account": "इस खाते का नाम दें",
    "Optional public name for chats": "चैट के लिए वैकल्पिक सार्वजनिक नाम",
    "Photo disabled in Spectre Mode": "Spectre मोड में फ़ोटो अक्षम है",
    "Preparing secure contact invitation…": "सुरक्षित संपर्क निमंत्रण तैयार किया जा रहा है…",
    "Preparing secure contact card…": "सुरक्षित संपर्क कार्ड तैयार किया जा रहा है…",
    "Preparing secure share…": "सुरक्षित साझाकरण तैयार किया जा रहा है…",
    "Create a one-time card to show your QR code.":
      "अपना QR कोड दिखाने के लिए एक बार उपयोग होने वाला कार्ड बनाएं।",
    "Create one-time contact card": "एक बार उपयोग होने वाला संपर्क कार्ड बनाएं",
    "Publish for 5 minutes": "5 मिनट के लिए प्रकाशित करें",
    "Your account is discoverable for 5 minutes.": "आपका खाता 5 मिनट तक खोजा जा सकता है।",
    "Your account is already discoverable.": "आपका खाता पहले से खोजने योग्य है।",
    "Your one-time contact card is still active.":
      "आपका एक बार उपयोग होने वाला संपर्क कार्ड अभी भी सक्रिय है।",
    "Open one-time contact card": "एक बार उपयोग होने वाला संपर्क कार्ड खोलें",
    "One-time contact card ready": "एक बार उपयोग होने वाला संपर्क कार्ड तैयार है",
    "Expires in {{minutes}} min": "{{minutes}} मिनट में समाप्त",
    "One-time contact card": "एक बार उपयोग होने वाला संपर्क कार्ड",
    "Share this QR code before it expires.":
      "समाप्त होने से पहले यह QR कोड साझा करें।",
    "A one-time contact card expires after one hour and can be used once.":
      "एक बार उपयोग होने वाला संपर्क कार्ड एक घंटे बाद समाप्त हो जाता है और केवल एक बार इस्तेमाल किया जा सकता है।",
    "Chat identity is not ready yet.": "चैट पहचान अभी तैयार नहीं है।",
    "Profile photos cannot be changed while Spectre Mode is active.":
      "Spectre मोड सक्रिय होने पर प्रोफ़ाइल फ़ोटो नहीं बदली जा सकतीं।",
    "Public Name": "सार्वजनिक नाम",
    "Public name contains invalid text.": "सार्वजनिक नाम में अमान्य पाठ है।",
    "Public name contains unsupported characters": "सार्वजनिक नाम में असमर्थित वर्ण हैं",
    "Public name contains unsupported control characters.":
      "सार्वजनिक नाम में असमर्थित नियंत्रण वर्ण हैं।",
    "Public name contains unsupported direction controls.":
      "सार्वजनिक नाम में असमर्थित दिशा-नियंत्रक वर्ण हैं।",
    "Public name is too large": "सार्वजनिक नाम बहुत बड़ा है",
    "Public name is too large when encoded.": "एन्कोड किए जाने पर सार्वजनिक नाम बहुत बड़ा है।",
    "Public name must be {{max}} characters or fewer":
      "सार्वजनिक नाम {{max}} वर्ण या उससे कम होना चाहिए",
    "Public name must be 80 characters or fewer.": "सार्वजनिक नाम 80 वर्ण या उससे कम होना चाहिए।",
    "Public profile metadata is read-only while Spectre Mode is active.":
      "Spectre मोड सक्रिय होने पर सार्वजनिक प्रोफ़ाइल मेटाडेटा केवल-पढ़ने योग्य होता है।",
    "Public profile names cannot be edited while Spectre Mode is active.":
      "Spectre मोड सक्रिय होने पर सार्वजनिक प्रोफ़ाइल नाम संपादित नहीं किए जा सकते।",
    "Publication needs attention. Retry when you are online.":
      "प्रकाशन पर ध्यान देने की आवश्यकता है। ऑनलाइन होने पर पुनः प्रयास करें।",
    "Published": "प्रकाशित",
    "Publishing public name...": "सार्वजनिक नाम प्रकाशित किया जा रहा है...",
    "Retry Publication": "प्रकाशन का पुनः प्रयास करें",
    "Save Public Name": "सार्वजनिक नाम सहेजें",
    "Security Status": "सुरक्षा स्थिति",
    "Server session active": "सर्वर सत्र सक्रिय है",
    "Server session expired — features may not work":
      "सर्वर सत्र समाप्त हो गया है — सुविधाएँ काम नहीं कर सकतीं",
    "This is a local label to help you identify this account. It is not your public chat name.":
      "यह इस खाते की पहचान में मदद करने के लिए स्थानीय लेबल है। यह आपका सार्वजनिक चैट नाम नहीं है।",
    "This name is visible to your contacts": "यह नाम आपके संपर्कों को दिखाई देता है",
    "This public name is saved on this device and will publish when your chat identity is linked.":
      "यह सार्वजनिक नाम इस डिवाइस पर सहेजा गया है और आपकी चैट पहचान लिंक होने पर प्रकाशित होगा।",
    "This repeatable name is public chat-directory metadata. People who have not saved you under another name can see it in chats and contacts. It appears in notifications only when both sides enable that privacy trade-off.":
      "यह दोहराया जा सकने वाला नाम सार्वजनिक चैट-डायरेक्टरी मेटाडेटा है। जिन लोगों ने आपको किसी दूसरे नाम से नहीं सहेजा है, वे इसे चैट और संपर्कों में देख सकते हैं। यह सूचनाओं में केवल तभी दिखाई देता है जब दोनों पक्ष इस गोपनीयता विकल्प को सक्षम करें।",
    "Unable to use this public name": "इस सार्वजनिक नाम का उपयोग नहीं किया जा सकता",
    "Unknown error": "अज्ञात त्रुटि",
    "Waiting for chat readiness. Automatic retries are scheduled.":
      "चैट तैयार होने की प्रतीक्षा है। स्वचालित पुनःप्रयास निर्धारित हैं।",
  },
  settings: {
    "Activating secure online access": "सुरक्षित ऑनलाइन पहुँच सक्रिय की जा रही है",
    "Publishing secure discovery": "सुरक्षित खोजयोग्यता प्रकाशित की जा रही है",
    "Keeping you findable": "आपको खोज योग्य बनाए रखना",
    "Starting a secure chat": "सुरक्षित चैट शुरू की जा रही है",
    "Creating one-time contact card": "एकल-उपयोग संपर्क कार्ड बनाया जा रहा है",
    "Computing VDF proof": "VDF प्रमाण की गणना की जा रही है",
    "Solving a sequential proof that helps prevent automated account creation.":
      "क्रमिक प्रमाण हल किया जा रहा है जो स्वचालित खाता निर्माण को रोकने में मदद करता है।",
    "Generating VDF proof": "VDF प्रमाण बनाया जा रहा है",
    "Preparing the compact proof the server can verify efficiently.":
      "सर्वर द्वारा कुशलता से सत्यापित किए जाने वाले संक्षिप्त प्रमाण की तैयारी हो रही है।",
    "Waiting for server verification": "सर्वर सत्यापन की प्रतीक्षा है",
    "Retrying server verification": "सर्वर सत्यापन का पुनः प्रयास हो रहा है",
    "Proof ready. The server enforces a minimum delay before it accepts it.":
      "प्रमाण तैयार है। सर्वर स्वीकार करने से पहले न्यूनतम विलंब लागू करता है।",
    "Verifying VDF proof": "VDF प्रमाण सत्यापित किया जा रहा है",
    "Sending the proof for secure verification.": "सुरक्षित सत्यापन के लिए प्रमाण भेजा जा रहा है।",
    "Secure online access is ready": "सुरक्षित ऑनलाइन पहुँच तैयार है",
    "Your secure online access is active.": "आपकी सुरक्षित ऑनलाइन पहुँच सक्रिय है।",
    "VDF work was cancelled": "VDF कार्य रद्द कर दिया गया",
    "No proof was submitted.": "कोई प्रमाण भेजा नहीं गया।",
    "Secure access needs attention": "सुरक्षित पहुँच पर ध्यान देने की आवश्यकता है",
    "This proof could not be completed. Check your connection and try again.":
      "यह प्रमाण पूरा नहीं हो सका। अपना कनेक्शन जाँचें और फिर प्रयास करें।",
    "{{percent}}% complete": "{{percent}}% पूर्ण",
    "VDFs completed {{completed}}/{{total}}": "VDF पूर्ण {{completed}}/{{total}}",
    "{{rate}} VDF iterations/s": "{{rate}} VDF पुनरावृत्तियाँ/सेकंड",
    "Measuring VDF rate…": "VDF गति मापी जा रही है…",
    "~{{count}}s remaining": "~{{count}} सेकंड शेष",
    "Cancel secure work": "सुरक्षित कार्य रद्द करें",
    "Could not start this chat": "यह चैट शुरू नहीं हो सकी",
    "Could not update discovery": "खोज अपडेट नहीं हो सकी",
    "Could not create contact card": "संपर्क कार्ड नहीं बनाया जा सका",
    "Dismiss": "खारिज करें",
    "Keep Spectra open while the security proof is verified.":
      "सुरक्षा प्रमाण सत्यापित होने तक Spectra खुला रखें।",
    "{{count}}s elapsed": "{{count}} सेकंड बीत चुके हैं",
    "{{count}}s elapsed - this may take 30-240 seconds with bridges":
      "{{count}} सेकंड बीत चुके हैं — ब्रिज के साथ इसमें 30–240 सेकंड लग सकते हैं",
    "A verified backend session is required before deleting this account.":
      "यह खाता हटाने से पहले सत्यापित बैकएंड सत्र आवश्यक है।",
    "A verified Backend session is required for Spectre activation":
      "Spectre सक्रिय करने के लिए सत्यापित Backend सत्र आवश्यक है",
    "Account deleted": "खाता हटा दिया गया",
    "Account Deletion": "खाता विलोपन",
    "Account deletion completed": "खाता विलोपन पूरा हुआ",
    "Account Deletion Failed": "खाता विलोपन विफल",
    "Account deletion failed. Try again after checking your connection.":
      "खाता विलोपन विफल हुआ। अपना कनेक्शन जाँचकर फिर प्रयास करें।",
    "Account deletion needs attention": "खाता विलोपन पर ध्यान देने की आवश्यकता है",
    "Applying Spectre protections": "Spectre सुरक्षा उपाय लागू किए जा रहे हैं",
    "Backend cleanup could not be checked. Retry when the private connection is available.":
      "बैकएंड सफ़ाई जाँची नहीं जा सकी। निजी कनेक्शन उपलब्ध होने पर फिर प्रयास करें।",
    "Backend cleanup is paused and will be retried safely. Try checking again.":
      "बैकएंड सफ़ाई रुकी हुई है और सुरक्षित रूप से पुनः प्रयास की जाएगी। फिर जाँचें।",
    "Backend cleanup is still running. You can retry this status check safely.":
      "बैकएंड सफ़ाई अभी भी चल रही है। आप इस स्थिति जाँच को सुरक्षित रूप से फिर कर सकते हैं।",
    "Backend deletion completed, but final device cleanup needs to be retried.":
      "बैकएंड विलोपन पूरा हो गया, लेकिन अंतिम डिवाइस सफ़ाई का फिर से प्रयास करना होगा।",
    "Backend deletion completed, but local key erasure could not be confirmed.":
      "बैकएंड विलोपन पूरा हो गया, लेकिन स्थानीय कुंजियाँ मिटाने की पुष्टि नहीं हो सकी।",
    "Backend is not configured for Spectre activation":
      "बैकएंड Spectre सक्रियण के लिए कॉन्फ़िगर नहीं है",
    "Changes were rolled back": "परिवर्तन वापस ले लिए गए",
    "Checking private access": "निजी पहुँच जाँची जा रही है",
    "Choose a new 6-digit PIN": "नया 6-अंकीय PIN चुनें",
    "Cleanup could not be confirmed. You can retry safely.":
      "सफ़ाई की पुष्टि नहीं हो सकी। आप सुरक्षित रूप से फिर प्रयास कर सकते हैं।",
    "Cloud Session Required": "क्लाउड सत्र आवश्यक है",
    "Confirm Account Deletion": "खाता विलोपन की पुष्टि करें",
    "Confirm New PIN": "नए PIN की पुष्टि करें",
    "Connecting your private route": "आपका निजी मार्ग कनेक्ट किया जा रहा है",
    "Contact Archive": "संपर्क संग्रह",
    "Deleting Account": "खाता हटाया जा रहा है",
    "Deleting account records": "खाता रिकॉर्ड हटाए जा रहे हैं",
    "Deleting chat relay data": "चैट रिले डेटा हटाया जा रहा है",
    "Deleting encrypted objects": "एन्क्रिप्ट की गई वस्तुएँ हटाई जा रही हैं",
    "Deletion needs attention": "विलोपन पर ध्यान देने की आवश्यकता है",
    "Disabled by Spectre Mode": "Spectre मोड द्वारा अक्षम",
    "Encrypted contact archive": "एन्क्रिप्टेड संपर्क संग्रह",
    "Enter Current PIN": "वर्तमान PIN दर्ज करें",
    "Enter New PIN": "नया PIN दर्ज करें",
    "Enter your current PIN": "अपना वर्तमान PIN दर्ज करें",
    "Enter your current PIN before creating a duress PIN":
      "ड्यूरेस PIN बनाने से पहले अपना वर्तमान PIN दर्ज करें",
    "Enter your PIN to continue to the final destructive confirmation.":
      "अंतिम स्थायी विलोपन पुष्टि पर जाने के लिए अपना PIN दर्ज करें।",
    "Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.":
      "ड्यूरेस PIN दर्ज करने पर बैकएंड खाता डेटा और इस डिवाइस का डेटा मिटाने और आपको तुरंत साइन आउट करने का प्रयास होगा।",
    "Erase Account Permanently?": "खाता स्थायी रूप से मिटाएँ?",
    "Erase Everything": "सब कुछ मिटाएँ",
    "Erasing local keys and data": "स्थानीय कुंजियाँ और डेटा मिटाए जा रहे हैं",
    "EXO can continue refreshing chats in the background once Spectre is ready.":
      "Spectre तैयार होने पर EXO बैकग्राउंड में चैट रीफ़्रेश करना जारी रख सकता है।",
    "EXO has finished switching back from Spectre Mode.":
      "EXO ने Spectre मोड से वापस स्विच करना पूरा कर लिया है।",
    "EXO is validating your Spectre account and required protections before the private handoff starts.":
      "निजी हस्तांतरण शुरू होने से पहले EXO आपके Spectre खाते और आवश्यक सुरक्षा उपायों को सत्यापित कर रहा है।",
    "EXO is verifying the wallet session it uses for private network services.":
      "EXO निजी नेटवर्क सेवाओं के लिए उपयोग किए जाने वाले वॉलेट सत्र को सत्यापित कर रहा है।",
    "EXO stopped the Spectre flow and restored the previous safe state where it could.":
      "EXO ने Spectre प्रवाह रोक दिया और जहाँ संभव था, पिछली सुरक्षित स्थिति बहाल कर दी।",
    "Export an encrypted file you control, then import it later to preserve saved contacts.":
      "अपने नियंत्रण वाली एन्क्रिप्टेड फ़ाइल निर्यात करें, फिर सहेजे गए संपर्कों को सुरक्षित रखने के लिए उसे बाद में आयात करें।",
    "Export and import encrypted contacts": "एन्क्रिप्टेड संपर्क निर्यात और आयात करें",
    "Failed to change PIN": "PIN बदलना विफल हुआ",
    "Failed to disable an expired Spectre session": "समाप्त Spectre सत्र अक्षम नहीं किया जा सका",
    "Failed to disable Spectre Mode": "Spectre मोड अक्षम नहीं किया जा सका",
    "Failed to refresh Spectre access": "Spectre पहुँच रीफ़्रेश नहीं की जा सकी",
    "Failed to verify PIN": "PIN सत्यापित नहीं किया जा सका",
    "Finalizing secure cleanup": "सुरक्षित सफ़ाई को अंतिम रूप दिया जा रहा है",
    "Finalizing Spectre shutdown": "Spectre बंद करने को अंतिम रूप दिया जा रहा है",
    "Finishing the private handoff": "निजी हस्तांतरण पूरा किया जा रहा है",
    "Getting Spectre ready": "Spectre तैयार किया जा रहा है",
    "Keep Spectra open while each verified cleanup stage completes.":
      "हर सत्यापित सफ़ाई चरण पूरा होने तक Spectra खुला रखें।",
    "Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.":
      "Spectre मोड के लिए आवश्यक गोपनीयता परिवर्तन लागू करते समय यह स्क्रीन खुली रखें।",
    "Keep this screen open while EXO prepares the secure activation handoff.":
      "EXO सुरक्षित सक्रियण हस्तांतरण तैयार करते समय यह स्क्रीन खुली रखें।",
    "Keep this screen open while EXO restores your regular wallet and security settings.":
      "EXO आपके नियमित वॉलेट और सुरक्षा सेटिंग बहाल करते समय यह स्क्रीन खुली रखें।",
    "Loading your Spectre setup": "आपका Spectre सेटअप लोड किया जा रहा है",
    "Local data and the accepted backend cleanup have finished.":
      "स्थानीय डेटा मिटा दिया गया है और बैकएंड द्वारा स्वीकार की गई सफ़ाई पूरी हो गई है।",
    "Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.":
      "स्थानीय डेटा मिटा दिया गया है, लेकिन बैकएंड सफ़ाई की पुष्टि नहीं हो सकी। निजी कनेक्शन उपलब्ध होने पर फिर प्रयास करें।",
    "Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.":
      "स्थानीय डेटा मिटा दिया गया, लेकिन बैकएंड ने विलोपन अनुरोध स्वीकार नहीं किया। फिर प्रयास करने के लिए खाता दोबारा आयात करें।",
    "New PIN must be different from current PIN": "नया PIN वर्तमान PIN से अलग होना चाहिए",
    "One anonymous activation token can be requested every 24 hours.":
      "हर 24 घंटे में एक अनाम सक्रियण टोकन का अनुरोध किया जा सकता है।",
    "PINs do not match": "PIN मेल नहीं खाते",
    "Preparing secure deletion": "सुरक्षित विलोपन तैयार किया जा रहा है",
    "Preparing Spectre Mode": "Spectre मोड तैयार किया जा रहा है",
    "Preparing your private workspace": "आपका निजी कार्यक्षेत्र तैयार किया जा रहा है",
    "Preparing your Spectre account": "आपका Spectre खाता तैयार किया जा रहा है",
    "Preparing your Spectre setup": "आपका Spectre सेटअप तैयार किया जा रहा है",
    "Re-enter your new PIN to confirm": "पुष्टि के लिए अपना नया PIN फिर से दर्ज करें",
    "Registering the private account": "निजी खाता पंजीकृत किया जा रहा है",
    "Reserving private activation": "निजी सक्रियण आरक्षित किया जा रहा है",
    "Restoring network and cleanup": "नेटवर्क और सफ़ाई बहाल की जा रही है",
    "Restoring privacy protections": "गोपनीयता सुरक्षा उपाय बहाल किए जा रहे हैं",
    "Restoring your main profile": "आपकी मुख्य प्रोफ़ाइल बहाल की जा रही है",
    "Retry account deletion cleanup": "खाता विलोपन सफ़ाई का पुनः प्रयास करें",
    "Retry cleanup": "सफ़ाई का पुनः प्रयास करें",
    "Review the failed step below before trying again.":
      "फिर प्रयास करने से पहले नीचे दिए गए विफल चरण की समीक्षा करें।",
    "Secure account deletion stopped unexpectedly. Try again when the private connection is available.":
      "सुरक्षित खाता विलोपन अनपेक्षित रूप से रुक गया। निजी कनेक्शन उपलब्ध होने पर फिर प्रयास करें।",
    "Secure deletion in progress": "सुरक्षित विलोपन जारी है",
    "Spectre cannot finish until Tor is connected. Try bridges or a different network.":
      "Tor कनेक्ट होने तक Spectre पूरा नहीं हो सकता। ब्रिज या किसी दूसरे नेटवर्क का प्रयास करें।",
    "Spectre chats and contacts are still refreshing in the background.":
      "Spectre चैट और संपर्क अभी भी बैकग्राउंड में रीफ़्रेश हो रहे हैं।",
    "Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.":
      "Spectre कॉल और क्रिप्टो कार्रवाइयाँ अक्षम करता है; पुश टोकन हटाता है; Tor, ड्यूरेस PIN, विफलता पर मिटाना, स्क्रीनशॉट सुरक्षा और ऐप स्विचर गोपनीयता लागू करता है; और नए संदेशों के लिए डिफ़ॉल्ट रूप से कम समय के गायब होने वाले टाइमर सेट करता है।",
    "Spectre needs your attention": "Spectre को आपके ध्यान की आवश्यकता है",
    "Spectre protections are active": "Spectre सुरक्षा उपाय सक्रिय हैं",
    "Submitting the deletion request": "विलोपन अनुरोध भेजा जा रहा है",
    "Switch to your root EXO account to create or import transparent EXO accounts.":
      "पारदर्शी EXO खाते बनाने या आयात करने के लिए अपने रूट EXO खाते पर स्विच करें।",
    "Switching back to your main wallet": "आपके मुख्य वॉलेट पर वापस स्विच किया जा रहा है",
    "Switching to your Spectre identity": "आपकी Spectre पहचान पर स्विच किया जा रहा है",
    "The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.":
      "बैकएंड अब इस सफ़ाई टोकन को नहीं पहचानता। विलोपन सत्यापित करने के लिए खाता दोबारा आयात करें।",
    "The cleanup status token expired. Re-import the account to verify its status.":
      "सफ़ाई स्थिति टोकन समाप्त हो गया है। इसकी स्थिति सत्यापित करने के लिए खाता दोबारा आयात करें।",
    "There is no pending backend cleanup to retry.":
      "फिर से प्रयास करने के लिए कोई लंबित बैकएंड सफ़ाई नहीं है।",
    "This cannot be undone. Backend data and local sensitive data will be erased for this account.":
      "इसे वापस नहीं किया जा सकता। इस खाते का बैकएंड डेटा और स्थानीय संवेदनशील डेटा मिटा दिया जाएगा।",
    "This cannot be undone. Local sensitive data is erased before the backend deletion request starts.":
      "इसे वापस नहीं किया जा सकता। बैकएंड विलोपन अनुरोध शुरू होने से पहले स्थानीय संवेदनशील डेटा मिटा दिया जाता है।",
    "This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.":
      "यह पहले स्थानीय कुंजियाँ और डेटा हटाता है, फिर आपके वर्तमान निजी परिवहन से बैकएंड सफ़ाई भेजता है। सफ़ाई की पुष्टि होने तक प्रगति स्क्रीन दिखाई देती रहेगी।",
    "This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.":
      "यह इस EXO खाते को इस डिवाइस से हटाता है और इस पुनर्प्राप्ति वाक्यांश के लिए एक पारदर्शी EXO स्लॉट खाली करता है। इस खाते के मौजूदा संदेश स्थानीय रूप से मिटा दिए जाते हैं। इसे वापस नहीं किया जा सकता।",
    "This screen updates automatically as each Spectre stage finishes.":
      "हर Spectre चरण पूरा होने पर यह स्क्रीन अपने-आप अपडेट होती है।",
    "This screen updates only when a cleanup stage is confirmed.":
      "यह स्क्रीन केवल सफ़ाई चरण की पुष्टि होने पर अपडेट होती है।",
    "Tor could not connect": "Tor कनेक्ट नहीं हो सका",
    "Tor must be online before Spectre can switch identities and continue.":
      "Spectre के पहचान बदलकर आगे बढ़ने से पहले Tor का ऑनलाइन होना आवश्यक है।",
    "Tor routing applies only inside Spectra. Device-wide network routing is unchanged.":
      "Tor रूटिंग केवल Spectra के अंदर लागू होती है। डिवाइस-स्तरीय नेटवर्क रूटिंग अपरिवर्तित रहती है।",
    "Unable to complete Spectre activation": "Spectre सक्रियण पूरा नहीं किया जा सका",
    "Unlock or reconnect to the backend before deleting the account.":
      "खाता हटाने से पहले Spectra को अनलॉक करें या बैकएंड से फिर कनेक्ट करें।",
    "Verify Primary PIN": "प्राथमिक PIN सत्यापित करें",
    "Verify your identity to change PIN": "PIN बदलने के लिए अपनी पहचान सत्यापित करें",
    "Verifying private access": "निजी पहुँच सत्यापित की जा रही है",
    "Your main wallet is restored": "आपका मुख्य वॉलेट बहाल हो गया है",
    "Your PIN has been changed successfully.": "आपका PIN सफलतापूर्वक बदल दिया गया है।",
    "Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.":
      "आपका Spectre वॉलेट और Tor टनल तैयार हैं। चैट और संपर्कों का रीफ़्रेश बैकग्राउंड में पूरा हो सकता है।",
    "Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.":
      "आपका Spectre वॉलेट सक्रिय है। EXO इस निजी प्रोफ़ाइल के लिए संग्रहण दायरा बदल रहा है और स्थानीय डेटा लोड कर रहा है।",
  },
  tor: {
    "Connected to Spectre": "Spectre से कनेक्ट है",
  },
} satisfies LocaleTranslationOverrides

export default translations

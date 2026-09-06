/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
*/

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY_ADDRESS_LINES,
  LEGAL_ENTITY_NAME,
  LEGAL_ENTITY_RUC,
  PRIVACY_CONTACT_EMAIL,
} from './metadata'

export const LEGAL_LAST_UPDATED = 'September 4, 2026'

const LEGAL_ENTITY_ADDRESS = LEGAL_ENTITY_ADDRESS_LINES.join(', ')
const LEGAL_ENTITY_CONTACT = [
  LEGAL_ENTITY_NAME,
  `RUC: ${LEGAL_ENTITY_RUC}`,
  ...LEGAL_ENTITY_ADDRESS_LINES,
].join('\n')

export const TERMS_TEXT = `# Terms and Conditions

**Effective Date:** June 2, 2026
**Last Updated:** ${LEGAL_LAST_UPDATED}

These Terms and Conditions ("Terms") are a legally binding agreement between you ("you" or "User") and ${LEGAL_ENTITY_NAME}, a Panamanian private interest foundation (fundacion de interes privado) registered in the Republic of Panama, RUC ${LEGAL_ENTITY_RUC}, with its registered address at ${LEGAL_ENTITY_ADDRESS} ("Company," "we," "us," or "our"). These Terms govern your access to and use of Spectra, including the mobile application, related backend services, websites, APIs, encrypted messaging, wallet, local contact archive, and privacy features (collectively, the "App").

By creating or importing a wallet, accessing the App, enabling a feature, or otherwise using Spectra, you agree to these Terms. If you do not agree, do not use the App. If you use Spectra for an organization, you represent that you have authority to bind that organization.

The English version of these Terms controls. Translations are provided for convenience unless we expressly state otherwise.

---

## 1. Eligibility and Account Responsibility

1.1. You must be at least 18 years old and old enough to form a binding contract in your jurisdiction. Spectra is not intended for minors.

1.2. You may not use the App if you are barred from using it under applicable law, sanctions, export-control rules, or rules that apply to encrypted communications, anonymization tools, blockchain networks, digital assets, DeFi, or prediction markets.

1.3. You are responsible for all activity from your device, wallet, Backend-authenticated session, app account, push registration, Spectre account, transparent account, or other identity you use with Spectra.

1.4. You must provide accurate information where the App asks for it, keep your device secure, install security updates, and promptly stop using the App if you suspect compromise.

---

## 2. Self-Custody Wallet and Local Security

2.1. Spectra is non-custodial. Private keys, mnemonic recovery phrases, vault keys, PINs, recovery passphrases, and device-bound secrets are generated or stored locally. We do not custody your digital assets and do not have the ability to transfer them for you.

2.2. You are solely responsible for safeguarding your mnemonic, PIN, biometric access, device, contact-archive passphrases, and recovery material. If you lose them, we cannot recover your wallet, assets, or local contact archive.

2.3. Duress PIN, fail-wipe, emergency wipe, account erasure, Spectre cleanup, screenshot protection, and similar features may permanently delete local data. You accept the risk of accidental or intentional activation.

2.4. Contact conservation uses a local encrypted file that you choose where to save and share. Spectra does not upload, store, recover, or restore contact archives on its servers. You are responsible for the archive file and passphrase.

2.5. Spectra security depends on your device, operating system, secure enclave/keychain/keystore behavior, network, and app runtime. We do not guarantee protection after malware, jailbreak/root compromise, physical compromise, memory capture, social engineering, or disclosure by you.

---

## 3. Digital Assets, Wallet Indexing, and Blockchain Networks

3.1. Spectra may allow you to create, import, view, index, monitor, send, receive, or interact with wallets and addresses on Mozaga, Ethereum, Bitcoin, Solana, Tron, and other supported networks.

3.2. Blockchain transactions are initiated by you and executed by independent networks, validators, miners, RPC providers, smart contracts, and indexers. We do not operate or control those networks unless expressly stated for a specific Company-operated service.

3.3. Transactions are typically irreversible. You are responsible for checking network, token, address, amount, gas or network fees, memo/tag fields, contract permissions, slippage, and transaction details before confirming.

3.4. You may opt in, per chain, to VDF-gated temporary backend indexing after proving control of an address. The App stores delivered balance and activity updates locally and the Backend deletes acknowledged delivery events. An indexing lease expires after 30 days without an on-chain transaction; local history and public blockchain data are not deleted by that expiry. Registration does not transfer custody to us.

3.5. Displaying a token, collection, market, pool, campaign, payment option, price, quote, alert, or transaction history does not mean we endorse it or guarantee its value, legality, liquidity, security, issuer, reserves, code, availability, or regulatory status.

3.6. Network fees, gas, validator/miner fees, third-party service fees, treasury contributions included with sends, campaign contributions, and DeFi activity are your responsibility unless we expressly state otherwise in writing.

---

## 4. DeFi, Markets, and Digital Assets

4.1. Spectra may provide access to DeFi or market features, including swaps, AMM pools, liquidity provision, escrow, P2P activity, prediction markets, campaigns, crowdfunding, primary sales, token transfers, and digital-asset payments.

4.2. You may lose all funds or digital assets involved. Risks include volatility, smart-contract bugs, oracle failure, impermanent loss, slippage, low liquidity, depegging, issuer insolvency, chain forks, chain halts, failed transactions, front-running, MEV, market manipulation, counterparty default, fraud, chargebacks, regulatory action, and tax consequences.

4.3. We do not provide financial, legal, tax, investment, accounting, trading, brokerage, exchange, custody, banking, money-transmission, gambling, securities, derivatives, or fiduciary services.

4.4. Tor and Spectre privacy features are free and are not unlocked through subscriptions, purchases, account tiers, or renewal payments. They do not include blockchain fees, guarantee message delivery, guarantee anonymity, guarantee investment returns, guarantee uninterrupted service, or reduce digital-asset risk.

4.5. Blockchain payments and network fees are non-refundable once submitted to the maximum extent permitted by law. Third-party blockchain, marketplace, and app-store services may have their own terms, taxes, refunds, or chargeback processes.

---

## 5. Messaging, Calls, and User Content

5.1. Direct and group messaging may use end-to-end encryption, sealed relay envelopes, hybrid classical and post-quantum key agreement, post-quantum signatures, local encrypted storage, and encrypted media payloads where supported. These protections apply to private messaging features where they are enabled. They do not hide every form of metadata, do not protect content after it is decrypted on a recipient device, and do not apply to Agora, Spectra's public plaza.

5.2. Voice and video calls use WebRTC and encrypted call signaling. Calls are connected through TURN/relay infrastructure. Encrypted signaling, TURN credentials, device media permissions, and call state are used to place, receive, and end calls.

5.3. You are solely responsible for content you create, upload, send, receive, forward, store, publish, attach, react to, or make available through Spectra ("User Content"). You represent that you have all rights needed for your User Content.

5.4. You must not use Spectra to create, transmit, store, or facilitate illegal, abusive, exploitative, infringing, defamatory, harassing, hateful, violent, sexually exploitative, child sexual abuse, terrorist, extremist, privacy-invasive, malware, spam, phishing, scam, market-manipulative, sanctions-evasive, or otherwise harmful content or activity.

5.5. We may remove, restrict, block, rate limit, refuse to deliver, or disable access to content, accounts, wallets, features, or infrastructure where we believe it is necessary to protect users, comply with law, enforce these Terms, respond to reports, prevent abuse, or protect the App. Encryption may limit what we can see or moderate.

5.6. We do not guarantee delivery, receipt, readability, storage, recovery, synchronization, retention, notification, call quality, or availability of any message, attachment, call, contact archive, or User Content.

5.7. The App is not an emergency service and must not be used for emergency calls, emergency messaging, rescue, medical emergencies, law-enforcement contact, or other time-critical communications.

5.8. Agora is an optional public plaza. Agora messages, whispers, occupancy, plaza nicks, reports, and related plaza metadata are unencrypted and stored on Spectra's servers so rooms can be public. Whispers are visible to the sender, the recipient, and Spectra. Agora is isolated from end-to-end encrypted chats. Spectre Mode accounts cannot use Agora. Use of Agora is also governed by the Agora Terms.

---

## 6. Privacy, Security, Tor, Bluetooth, and Experimental Features

6.1. Your use of the App is also governed by our Privacy Policy. You acknowledge that privacy and security features reduce risk but do not eliminate it.

6.2. Tor routing, Spectre Mode, blind-token issuance, transparent accounts, sealed mailboxes, Bluetooth mesh, offline relay, post-quantum cryptography, local contact archives, and related privacy features may be experimental, incomplete, unavailable, misconfigured, rate limited, or removed.

6.3. Tor does not guarantee anonymity. Bluetooth mesh does not guarantee confidentiality beyond the App encryption layer, peer availability, delivery, unlinkability, or protection from radio-level observation. Android may require location permission for Bluetooth scanning even if the App does not collect precise location.

6.4. You are responsible for determining whether your use of encryption, Tor, Bluetooth mesh, digital assets, blockchain networks, or privacy technology is legal where you are located.

---

## 7. Third-Party Services

7.1. Spectra relies on third-party services, including Backend, app stores, push notification services, blockchain networks, RPC providers, TURN/relay providers, storage providers, and device operating systems.

7.2. Third-party services are not controlled by us and may have their own terms, privacy policies, outages, data practices, fees, sanctions controls, content rules, and availability limits. We are not responsible for third-party services except where applicable law does not allow us to exclude responsibility.

---

## 8. Intellectual Property and License

8.1. The App, brand, logos, designs, text, software, protocols, interfaces, and other materials are owned by us or our licensors and are protected by intellectual property laws.

8.2. Subject to these Terms, we grant you a limited, personal, revocable, non-exclusive, non-transferable, non-sublicensable license to use the App for its intended purpose.

8.3. Open-source components are governed by their applicable licenses. Those licenses control to the extent they expressly grant rights that conflict with this section.

8.4. You grant us a worldwide, non-exclusive, royalty-free license to host, store, transmit, display, process, reproduce, modify for formatting, and otherwise use User Content only as needed to operate, secure, provide, improve, and enforce the App and comply with law. This license does not give us access to decrypt content we technically cannot decrypt.

8.5. Feedback may be used by us without restriction or compensation.

---

## 9. Prohibited Uses

You must not use the App to:

- violate law, sanctions, export controls, court orders, or third-party rights;
- launder money, finance terrorism, evade sanctions, facilitate fraud, or conceal proceeds of crime;
- exploit, harm, harass, threaten, dox, impersonate, defame, or abuse any person;
- create, share, or facilitate child sexual abuse material or sexual exploitation;
- manipulate markets, deceive users, spoof, front-run, wash trade, pump and dump, or run scams;
- attack, overload, probe, scrape, reverse engineer, bypass, or interfere with the App or third-party systems except where permitted by law or open-source licenses;
- upload malware, steal keys, phish, harvest credentials, spam, or send unwanted communications;
- use Tor, Bluetooth, messaging, or wallets to bypass safety, legal, or platform rules;
- misrepresent your identity, eligibility, location, payments, or authority.

---

## 10. Compliance, Taxes, and Legal Process

10.1. You are solely responsible for legal compliance, licensing, registration, reporting, recordkeeping, and tax obligations arising from your use of the App.

10.2. We may preserve, disclose, suspend, restrict, or remove data, content, accounts, wallets, or features when we believe it is necessary to comply with law, legal process, sanctions, security obligations, these Terms, or requests from competent authorities.

10.3. We may cooperate with law enforcement, regulators, app stores, infrastructure providers, and affected third parties where legally permitted or required.

---

## 11. Disclaimers

11.1. The App is provided "as is" and "as available." To the maximum extent permitted by law, we disclaim all warranties, whether express, implied, statutory, or otherwise, including merchantability, fitness for a particular purpose, title, non-infringement, availability, accuracy, security, reliability, and uninterrupted operation.

11.2. We do not warrant that the App, cryptography, privacy features, blockchain functions, local contact archives, notifications, calls, messages, or third-party services will be secure, anonymous, private, error-free, compatible, uninterrupted, recoverable, or free from vulnerabilities.

11.3. We do not warrant that any digital asset, transaction, smart contract, market, quote, pool, campaign, payment, notification, or user interaction will meet your expectations or be legal in your jurisdiction.

11.4. Some jurisdictions do not allow certain disclaimers, so some disclaimers may not apply to you.

---

## 12. Limitation of Liability

12.1. To the maximum extent permitted by law, the Company and its directors, officers, employees, contractors, affiliates, licensors, and service providers will not be liable for indirect, incidental, special, consequential, exemplary, punitive, or enhanced damages; loss of profits, revenue, goodwill, data, content, local contact archives, keys, digital assets, opportunities, or anticipated savings; device compromise; unauthorized access; transaction loss; market loss; smart-contract loss; delivery failure; or third-party service failure.

12.2. To the extent liability cannot be excluded, our total aggregate liability for all claims arising out of or relating to the App or these Terms will not exceed USD 100.

12.3. These limits apply regardless of legal theory, even if a remedy fails of its essential purpose and even if we were advised of the possibility of damages.

12.4. Nothing in these Terms excludes liability that cannot be excluded under applicable law.

---

## 13. Indemnification

You agree to defend, indemnify, and hold harmless the Company and its directors, officers, employees, contractors, affiliates, licensors, and service providers from and against claims, damages, losses, liabilities, penalties, costs, and expenses, including reasonable legal fees, arising from or related to your use of the App, User Content, digital-asset activity, tax obligations, breach of these Terms, violation of law, violation of third-party rights, or misuse of any feature.

---

## 14. Suspension and Termination

14.1. You may stop using the App at any time and may delete local data from your device. Deleting the App does not delete blockchain data, content already delivered to others, data held by third parties, or records we must retain.

14.2. We may suspend, restrict, terminate, or refuse access to any feature, account, wallet, backend service, or App version at any time where permitted by law, including for suspected abuse, security risk, legal risk, sanctions risk, or breach of these Terms.

14.3. Sections that by their nature should survive termination survive, including self-custody responsibilities, ownership, disclaimers, limitations, indemnity, dispute resolution, and compliance obligations.

---

## 15. Changes to the App or Terms

We may modify, suspend, or discontinue any App feature. We may update these Terms from time to time. Material changes will be notified through the App or other reasonable means where required. Continued use after the effective date means you accept the updated Terms.

---

## 16. Governing Law and Dispute Resolution

16.1. These Terms are governed by the laws of the Republic of Panama, including applicable Panamanian civil, commercial, consumer-protection, electronic-commerce, data-protection, and private-interest-foundation rules, without regard to conflict-of-law rules, except where mandatory consumer law provides otherwise.

16.2. Any dispute arising out of or relating to these Terms or the App will be finally resolved by binding arbitration administered by the Centro de Conciliacion y Arbitraje de Panama under its rules. The seat of arbitration is Panama City, Panama. The language is Spanish unless the parties agree in writing to English. The award may be enforced in any court of competent jurisdiction.

16.3. To the maximum extent permitted by law, disputes must be brought on an individual basis only, not as a class, collective, consolidated, private attorney general, or representative action.

16.4. Either party may seek injunctive or equitable relief for intellectual property misuse, unauthorized access, security abuse, or misuse of confidential information in any court of competent jurisdiction.

---

## 17. Miscellaneous

17.1. These Terms, together with the Privacy Policy and Digital Assets Disclaimer, are the entire agreement regarding the App.

17.2. If a provision is unenforceable, the remaining provisions remain in effect and the unenforceable provision will be modified to the minimum extent needed to make it enforceable.

17.3. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent. We may assign them as part of a merger, acquisition, reorganization, sale of assets, operation of law, or business transfer.

17.4. We are not liable for delay or failure caused by events beyond our reasonable control, including network failures, blockchain failures, outages, attacks, war, terrorism, labor disputes, government action, disasters, pandemics, power failures, or third-party failures.

---

## 18. Contact

${LEGAL_ENTITY_CONTACT}
Email: ${LEGAL_CONTACT_EMAIL}

---

*These Terms and Conditions were last updated on ${LEGAL_LAST_UPDATED}.*`

export const PRIVACY_TEXT = `# Privacy Policy

**Effective Date:** June 2, 2026
**Last Updated:** ${LEGAL_LAST_UPDATED}

This Privacy Policy explains how ${LEGAL_ENTITY_NAME} ("Company," "we," "us," or "our") collects, uses, stores, shares, and protects information when you use Spectra, including the mobile application, backend services, encrypted messaging, wallet, local contact archive, support, and privacy features (collectively, the "App").

Spectra is designed to minimize trust in our servers, but it is not a zero-data service. Some data stays only on your device, some data is encrypted before upload, some metadata is needed to operate the App, and some blockchain data is public by design.

The English version of this Privacy Policy controls. Translations are provided for convenience unless we expressly state otherwise.

---

## 1. Controller and Contact

${LEGAL_ENTITY_NAME} is the controller for personal data we process for our own purposes.

${LEGAL_ENTITY_CONTACT}
Email: ${PRIVACY_CONTACT_EMAIL}
Data Protection Officer: ${LEGAL_ENTITY_NAME} Privacy Office -- ${PRIVACY_CONTACT_EMAIL}

---

## 2. Information Stored Locally on Your Device

The following categories are designed to remain on your device unless you choose to export, back up, transmit, or disclose them:

- mnemonic recovery phrases, private keys, vault keys, PIN-derived material, device-bound slot secrets, biometric unlock material, recovery passphrase material, and wallet vault contents;
- local address book data, including signed contact-profile names and avatar images, aliases, tags, hidden or blocked contact state, local conversation projections, local plaintext message cache after decryption, local media cache, and local UI preferences;
- Spectre Mode state, duress settings, fail-wipe settings, auto-lock settings, screenshot-protection settings, and local security state;
- temporary local transaction or payment state, temporary files, decrypted attachments, local contact archives, and logs that remain on the device;
- Bluetooth mesh state, nearby peer state, and store-and-forward cache maintained locally.

We cannot recover local-only secrets for you. If your device, operating system, backups, screenshots, notification previews, clipboard, or other apps expose this data, that exposure is outside our direct control.

---

## 3. Information We Process Through Our Backend

Depending on the features you use, we may process:

- wallet addresses, identity IDs, public keys, signed pre-keys, one-time pre-keys, mailbox tokens, delivery tokens, push tokens, notification labels, and muted-conversation preferences;
- encrypted direct-message envelopes, sealed relay payloads, delivery status, read or delivery receipts, timestamps, server sequence numbers, and message-retention metadata;
- encrypted chat media records, encrypted media metadata, object paths, content hashes, size, media type, upload status, download status, and deletion or expiry state;
- group chat membership, encrypted group payloads, sender-key distribution metadata, group message records, and related delivery metadata;
- wallet-authorized identity bindings, active public key bundles, one-time contact-card metadata, and encrypted contact-profile capsules that cannot be opened without the separate profile-decryption capability carried only in the invitation;
- optional public-discovery listings you enable, so others can look you up by wallet address for the listing period you choose;
- encrypted call invitations and signaling used to place and receive calls;
- support tickets, categories, descriptions, screenshots or attachments you submit, app version, operating system, and device model;
- temporary wallet-index data, including activated chain addresses and hashes, address-control proofs, owner-scoped leases, current snapshots, activity cursors, transient delivery events, and wakeup state; acknowledged wallet activity, balances, history, and unread state are stored locally in encrypted device storage;
- Spectre access data, including wallet address, blind-token issuance/redemption records, ephemeral Spectre address state, and rate-limit state;
- Agora plaza data you choose to use, including plaza nick, nick color, occupancy/presence timestamps, public messages, whispers, contact-invite records bound to a recipient, blocks, and reports;
- technical data such as app version, platform, request timing, rate-limit state, authentication/session state, security and abuse indicators, server logs, error diagnostics, and network metadata needed to provide and secure the App.

We do not intentionally collect precise GPS location. Android may require location permission for Bluetooth scanning; we use it for BLE operation, not to build location histories.

When Tor is connected, the App may query a third-party geolocation service through the Tor transport to show the country of the Tor exit node. That service receives the exit IP address and request timing, not your device IP address.

---

## 4. Blockchain and Public Network Data

When you use blockchain features, transaction data may be broadcast to public networks and third-party RPC or indexing infrastructure. Public blockchain data can include wallet addresses, transaction hashes, amounts, token identifiers, counterparties, timestamps, contract calls, fees, and event logs.

Public blockchain data is not controlled by us, is typically permanent, may be copied globally, and usually cannot be deleted, hidden, or corrected by us.

---

## 5. How We Use Information

We use information to:

- create, authenticate, and maintain wallet-based sessions;
- publish and retrieve public key bundles and mailbox data;
- route encrypted messages, attachments, calls, notifications, and receipts;
- provide wallet balances, transaction history, received-transfer alerts, on-chain payment or contribution verification, Spectre access, and blind-token flows;
- operate support tickets and user settings;
- secure the App, prevent abuse, detect prohibited conduct, enforce limits, troubleshoot, audit, and protect users;
- comply with law, legal process, sanctions, tax, accounting, security, and regulatory obligations;
- communicate with you about the App, support, security, policy changes, and service notices.

We do not sell personal information. We do not use third-party advertising SDKs or targeted advertising trackers in the App.

---

## 6. Device Permissions

The App may request:

- Camera: QR scanning, profile media, captured attachments, and video calls.
- Microphone: voice notes, voice calls, and video calls.
- Photo and media library: choosing avatars, attachments, images, videos, audio, saving media, and sharing files.
- Document picker and file access: selecting, caching, encrypting, opening, or sharing documents and attachments.
- Notifications: message, call, wallet-transfer, security, and status alerts.
- Bluetooth: BLE mesh discovery, advertising, nearby peer exchange, and offline relay.
- Location on Android: required by Android for BLE scanning on some versions; not used for precise-location tracking.
- Call audio and video: camera, microphone, and in-app audio routing for WebRTC calls.
- Biometrics: Face ID, Touch ID, fingerprint, or platform biometric unlock.
- Local storage, secure storage, background fetch, network state, and internet: core App operation, local vault, sync, Tor, local contact archives, notifications, calls, and security.

You can deny or revoke permissions through device settings. Some features will not work without their related permissions.

---

## 7. Encryption and Security

We use safeguards such as TLS in transit, authenticated backend authorization, database access controls, private storage buckets, signed URLs, access controls, encrypted local vaults, device secure storage, authenticated encryption, sealed relay envelopes, message/media encryption, local contact-archive encryption, and least-privilege service design where applicable.

Direct messages and chat media are intended to be encrypted before leaving your device. Encrypted direct-message payloads may be temporarily stored for delivery, but we should not be able to read message content if the encryption layer is working as designed.

Agora is not end-to-end encrypted. Public plaza messages, whispers, occupancy, plaza nicks, and related Agora records are stored in plaintext and can be read by Spectra.

No security system is perfect. Risks include software bugs, cryptographic implementation flaws, endpoint compromise, malicious recipients, compromised devices, screenshots, notifications, local archives, cloud OS services, third-party outages, insider risk, and legal compulsion.

---

## 8. Notifications

We use push tokens to deliver notifications. Notification payloads are designed to minimize message content where possible, but notification services and operating systems may process routing data, device tokens, titles, bodies, badge counts, thread identifiers, and metadata needed for delivery.

You can disable notifications in your device settings. Disabling notifications may prevent message, call, transfer, or security alerts.

---

## 9. Contact Archives

Contact archives are encrypted on your device with a passphrase before you save or share the exported file. The archive contains local contact records and contact labels; chats, messages, sessions, group keys, and media are not included. Spectra does not upload, store, recover, or process archive files or archive metadata through its backend.

We cannot recover an archive file or passphrase. If you lose either one, the archive may be unusable.

---

## 10. Sharing with Service Providers and Third Parties

We may share information with:

- Backend for database, storage, authentication-adjacent, realtime, and edge-function infrastructure;
- Expo, Apple Push Notification service, and Firebase Cloud Messaging for notifications;
- Cloudflare or other TURN/relay providers for call connectivity and network relay;
- blockchain networks, RPC providers, explorers, indexers, treasury/payment addresses, and pricing providers for wallet, transaction, history, quote, and payment features;
- app stores and other providers where external marketplace, tax, or support obligations require them;
- storage, security, hosting, logging, support, professional, legal, compliance, and fraud-prevention providers;
- law enforcement, regulators, courts, app stores, infrastructure providers, or affected third parties when legally required or when we believe disclosure is necessary to protect rights, safety, security, or enforce our terms.

Service providers may process data in countries other than yours.

---

## 11. Retention

We keep information only as long as needed for the purposes described in this Policy, unless a longer period is required or permitted by law.

Typical retention patterns include:

- local device data remains until you delete it, wipe it, uninstall the App, clear storage, rotate accounts, or activate a cleanup feature;
- encrypted direct-message relay payloads are retained for delivery and may be deleted shortly after delivery/read or after expiry, with pending messages subject to cleanup windows;
- direct chat media records and encrypted storage objects are retained for delivery, download, or expiry and may be deleted after download, deletion, or scheduled cleanup;
- wallet-index challenges, leases, shared index state, and unacknowledged delivery events remain only while needed to operate an active index; acknowledged events are deleted after encrypted local persistence, and an inactive lease expires after 30 days without an on-chain transaction;
- public-discovery listings remain only for the listing period you choose;
- Agora public messages are retained in a bounded per-room history and older lines are deleted when the cap is exceeded; Agora whispers and unused private-chat invites expire after a short period; occupancy records are removed shortly after you leave or go idle;
- push tokens remain until replaced, revoked, deleted, or no longer needed;
- support tickets remain while needed to resolve the request, maintain records, improve safety, and comply with law;
- blind-token, contribution, and audit records remain while needed for fraud prevention, security, and legal compliance;
- server logs and security diagnostics are generally retained for limited operational windows unless needed longer for abuse, security, fraud, legal, or compliance reasons;
- blockchain data may be permanent and outside our control.

---

## 12. Your Choices

You can:

- decline or revoke device permissions;
- disable notifications;
- avoid exporting contact archives, using Tor, Bluetooth mesh, support attachments, or wallet indexing features;
- remove optional profile fields such as display name or avatar where the App supports it;
- delete local data, trigger supported cleanup flows, or stop using the App;
- contact us to request access, deletion, correction, portability, objection, restriction, withdrawal of consent, or other rights available under applicable law.

Some requests cannot be fulfilled for data we do not control, data we cannot identify, data stored only on your device, data already delivered to other users, data retained for legal/security reasons, or public blockchain data.

---

## 13. Privacy Rights

Depending on your location, you may have rights under GDPR, UK GDPR, Swiss law, CCPA/CPRA, LGPD, Panamanian data protection law, including Law 81 of 2019 and Executive Decree 285 of 2021, or other laws. These rights may include access, correction, deletion, portability, restriction, objection, withdrawal of consent, appeal, and complaint to a supervisory authority.

To exercise rights, contact ${PRIVACY_CONTACT_EMAIL}. We may need to verify your request, including by wallet-based verification where appropriate. We will respond within legally required timeframes.

California residents: we do not sell or share personal information for cross-context behavioral advertising as those terms are commonly used under California privacy law. We do not knowingly sell or share personal information of minors.

---

## 14. International Transfers

We and our service providers may process information in Panama, the United States, the European Union, and other countries. Where required, we rely on contractual safeguards, adequacy decisions, standard contractual clauses, service-provider commitments, or other lawful transfer mechanisms.

Blockchain transactions and peer-to-peer communications may be propagated globally by design.

---

## 15. Children's Privacy

Spectra is not directed to minors under 18 or the age of majority in their jurisdiction, whichever is higher. We do not knowingly collect personal data from minors. If you believe a minor has provided personal data, contact ${PRIVACY_CONTACT_EMAIL}.

---

## 16. Cookies and Tracking

The native App does not use browser cookies for advertising. We do not include third-party advertising trackers. If we operate websites or web surfaces, they may use essential cookies or similar technologies as disclosed on those surfaces.

---

## 17. Data Breach Notification

If we become aware of a personal-data breach affecting data we control, we will assess it and notify affected users or regulators where required by law. A breach of our servers should not expose private keys, mnemonics, PINs, or contact-archive passphrases that we do not possess, but it may affect server-side data or metadata described in this Policy.

---

## 18. Changes to This Policy

We may update this Privacy Policy to reflect App changes, legal requirements, or data practices. If changes are material, we will provide notice through the App or other reasonable means where required. Continued use after the effective date means you accept the updated Policy.

---

## 19. Contact Us

${LEGAL_ENTITY_CONTACT}
Email: ${PRIVACY_CONTACT_EMAIL}
Data Protection Officer: ${LEGAL_ENTITY_NAME} Privacy Office -- ${PRIVACY_CONTACT_EMAIL}

---

*This Privacy Policy was last updated on ${LEGAL_LAST_UPDATED}.*`

export const DISCLAIMER_TEXT = `# Payment and Digital Assets Disclaimer

**Effective Date:** May 12, 2026
**Last Updated:** ${LEGAL_LAST_UPDATED}

This Payment and Digital Assets Disclaimer ("Disclaimer") is issued by ${LEGAL_ENTITY_NAME} ("Company," "we," "us," or "our") in connection with the Spectra mobile application ("App"). This Disclaimer supplements the Terms and Conditions and Privacy Policy and should be read in conjunction with those documents.

THIS DISCLAIMER CONTAINS IMPORTANT INFORMATION REGARDING THE RISKS ASSOCIATED WITH DIGITAL ASSETS, BLOCKCHAIN TECHNOLOGY, AND DECENTRALIZED FINANCE. PLEASE READ IT CAREFULLY BEFORE USING ANY DIGITAL ASSET FUNCTIONALITY IN THE APP. BY USING THE APP'S DIGITAL ASSET FEATURES, YOU ACKNOWLEDGE AND ACCEPT ALL RISKS DESCRIBED HEREIN.

---

## 1. General Disclaimer -- Not Financial Advice

1.1. The App is a software tool that provides a user interface for interacting with blockchain networks and managing digital assets. **The App is not a financial advisor, broker, dealer, exchange, custodian, bank, money services business, or investment company.**

1.2. Nothing in the App, including market data, token listings, pool information, campaign descriptions, prediction market odds, or any other content, constitutes financial advice, investment advice, trading advice, tax advice, legal advice, or any other form of professional advice or recommendation.

1.3. **You should consult qualified professional advisors** (financial, legal, tax) before making any decisions involving digital assets. All decisions to buy, sell, hold, stake, provide liquidity, participate in markets, or otherwise interact with digital assets are made solely at your own discretion and risk.

1.4. Past performance of any digital asset, pool, market, or campaign is not indicative of future results.

1.5. Tor and Spectre privacy features are free. They do not purchase digital assets, include blockchain gas or network fees, guarantee returns, or reduce the risks of any blockchain, DeFi, market, or digital asset transaction.

1.6. Supported crypto send flows include a treasury contribution of 0.1% of the send amount, capped at $10 USD equivalent, when a valid treasury recipient and USD price quote are available. The send flow cannot calculate that contribution without the required quote. Contributions do not unlock Tor, Spectre Mode, or other privacy features.

---

## 2. Self-Custody Risks

2.1. **The App is non-custodial.** The Company does not hold, control, manage, or have access to your digital assets, private keys, or mnemonic recovery phrases at any time. Your digital assets are held directly by you on the relevant blockchain networks.

2.2. **Loss of access credentials is permanent.** If you lose your private key, mnemonic recovery phrase, or PIN, you will permanently and irreversibly lose access to your digital assets. There is no password reset, account recovery, customer support override, or any other mechanism by which the Company can restore your access. **The Company bears no responsibility for any loss resulting from lost or compromised credentials.**

2.3. **Device compromise.** If your device is lost, stolen, compromised by malware, or physically accessed by an unauthorized person, your digital assets may be at risk. The Company is not responsible for losses resulting from device security failures.

2.4. **Duress and emergency wipe.** The App includes security features that allow you to permanently wipe wallet data from your device. If activated (whether intentionally or accidentally), all local wallet data is irreversibly destroyed. The Company is not responsible for any loss of access to digital assets resulting from the use of these features.

---

## 3. Digital Asset Volatility

3.1. **Digital asset values are highly volatile.** The market value of digital assets, including but not limited to Exos (EXO), Ether (ETH), and ERC-20 tokens (USDT, USDC, DAI, WETH, WBTC, UNI, LINK, and others), can fluctuate dramatically within short periods of time.

3.2. **Total loss is possible.** The value of any digital asset may decline to zero. You should only interact with digital assets using funds that you can afford to lose entirely.

3.3. **No price guarantees.** The Company makes no representations or guarantees regarding the current or future value of any digital asset. Price data displayed in the App is provided for informational purposes only and may be delayed, inaccurate, or incomplete.

3.4. **Market manipulation risks.** Digital asset markets may be subject to manipulation, including wash trading, spoofing, pump-and-dump schemes, and other deceptive practices by third parties. The Company does not monitor or prevent such activities on external markets.

---

## 4. Irreversibility of Blockchain Transactions

4.1. **All blockchain transactions are irreversible.** Once a transaction is confirmed on a blockchain network, it cannot be canceled, reversed, refunded, or modified by the Company or any other party.

4.2. **Verify before confirming.** You are solely responsible for verifying all transaction details -- including recipient address, amount, token type, and network -- before confirming any transaction. Sending digital assets to an incorrect address, on the wrong network, or in the wrong amount will result in permanent, irrecoverable loss.

4.3. **The Company cannot reverse transactions.** The Company has no ability to intervene in, cancel, or reverse any transaction once it has been broadcast to a blockchain network, regardless of the reason, including fraud, error, or unauthorized access.

---

## 5. Multi-Chain Risks

5.1. **Multiple blockchain networks.** The App supports interaction with multiple blockchain networks, including Mozaga Mainnet (a custom Layer 1 proof-of-work blockchain with chain ID 27182818), Ethereum, Bitcoin, Solana, and Tron.

5.2. **Cross-chain incompatibility.** Each blockchain network operates independently. Sending digital assets to an address on the wrong network (e.g., sending Mozaga-native tokens to an Ethereum address, or vice versa) will result in permanent loss. The Company cannot recover assets sent to incorrect networks.

5.3. **Network-specific risks.** Each blockchain network has its own set of risks, including but not limited to consensus mechanism vulnerabilities, validator behavior, network upgrades (hard forks), and governance decisions. The Company does not control any blockchain network and cannot protect you against network-specific risks.

5.4. **Mozaga network.** The Mozaga network is a relatively new blockchain. New blockchain networks inherently carry higher risks than established networks, including lower liquidity, smaller validator sets, less battle-tested code, potential consensus failures, and limited third-party tooling or support.

5.5. **Ethereum mainnet.** Interactions with the Ethereum mainnet are subject to that network's gas fee dynamics, congestion, and governance. Gas fees on Ethereum can become extremely high during periods of network congestion, and the Company has no control over these fees.

---

## 6. Decentralized Finance (DeFi) Feature Risks

The App provides access to various DeFi features, each carrying specific risks. **You should thoroughly understand these risks before participating.**

### 6.1. Automated Market Maker (AMM) Liquidity Pools

(a) **Impermanent loss.** When you provide liquidity to an AMM pool, the relative value of your deposited assets may shift due to price movements, resulting in a loss compared to simply holding the assets. This loss becomes permanent ("realized") when you withdraw liquidity.

(b) **Slippage.** Large trades relative to pool liquidity may execute at prices significantly different from the quoted price. Slippage can result in receiving fewer tokens than expected.

(c) **Low liquidity risk.** Pools with low liquidity are more susceptible to large price impacts, manipulation, and difficulty exiting positions.

(d) **Smart contract risk.** AMM pools operate through smart contracts that may contain bugs or vulnerabilities. A smart contract exploit could result in total loss of deposited liquidity.

(e) **No guarantee of fees or rewards.** Liquidity provider fees and rewards are not guaranteed and may fluctuate or cease entirely.

### 6.2. Prediction Markets

(a) **Speculative nature.** Prediction markets are speculative instruments. You may lose the entirety of your stake in any prediction market.

(b) **Resolution risk.** Prediction market outcomes are resolved through on-chain mechanisms. Resolution may be delayed, disputed, or inaccurate. The Company does not guarantee the accuracy, fairness, or timeliness of market resolution.

(c) **Liquidity risk.** You may be unable to exit a prediction market position before resolution if there is insufficient counterparty liquidity.

(d) **Regulatory risk.** Prediction markets may be classified as gambling, derivatives, or other regulated financial instruments in certain jurisdictions. You are solely responsible for determining whether participation is legal in your jurisdiction.

### 6.3. Escrow and Peer-to-Peer (P2P) Trading

(a) **Counterparty risk.** P2P transactions involve direct dealing with other users. The Company does not guarantee the honesty, reliability, solvency, or identity of any counterparty.

(b) **Dispute resolution limitations.** While the App may provide escrow mechanisms, the Company is not a party to any P2P transaction and has limited ability to resolve disputes. On-chain escrow logic is governed by smart contract code, not human judgment.

(c) **Fiat-related risks.** Where P2P orders reference fiat currency transactions, the fiat leg of the transaction occurs entirely outside the App and the blockchain. The Company has no visibility into, control over, or responsibility for fiat payments. Risks of fiat non-payment, chargeback fraud, or bank account freezing are borne entirely by you.

(d) **Fraud.** P2P trading environments are targets for scammers. The Company does not vet users and is not liable for losses due to fraud.

### 6.4. Campaigns and Crowdfunding

(a) **Project failure.** Campaigns may fail to deliver promised products, services, or returns. The Company does not vet, endorse, audit, or guarantee any campaign, its organizers, or its stated objectives.

(b) **Non-refundable contributions.** Contributions to campaigns may be non-refundable, regardless of whether the campaign achieves its goals.

(c) **Misuse of funds.** Campaign organizers may misuse or misallocate contributed funds. The Company has no control over how campaign funds are used after contribution.

(d) **Regulatory risk.** Depending on the jurisdiction and structure, campaigns may constitute unregistered securities offerings or other regulated fundraising activities. Neither the Company nor the App provides any determination as to the regulatory classification of any campaign.

### 6.5. Primary Sales and Token Offerings

(a) **Value risk.** Tokens or assets acquired through primary sales may decline significantly in value or become entirely worthless after purchase.

(b) **No guarantee of listing or liquidity.** There is no guarantee that tokens acquired in a primary sale will be listed on any exchange or secondary market, or that any liquid market will exist for resale.

(c) **Regulatory classification.** Tokens offered in primary sales may be classified as securities, utility tokens, or other regulated instruments depending on the jurisdiction. You are responsible for determining the legal implications of participating in any token sale.

(d) **Disclosure limitations.** Information about primary sale projects is provided by the project organizers, not the Company. The Company does not verify, audit, or guarantee the accuracy of any project disclosures.

## 7. Smart Contract and Protocol Risks

7.1. **Smart contract vulnerabilities.** The App interacts with smart contracts on blockchain networks. Smart contracts are computer programs that may contain bugs, logic errors, design flaws, or security vulnerabilities. Such defects could result in the loss, theft, or permanent locking of digital assets.

7.2. **No audit guarantee.** Unless explicitly stated and documented, smart contracts and protocol code accessed through the App may not have been audited by independent third-party security firms. Even audited contracts may contain undiscovered vulnerabilities.

7.3. **Protocol upgrades.** Blockchain protocols and smart contracts may be upgraded, modified, or replaced through governance mechanisms or developer decisions. Such changes may affect the functionality, security, or value of digital assets and DeFi positions.

7.4. **Experimental technology.** The Mozaga network and its associated protocols represent experimental, cutting-edge technology. The post-quantum signature algorithm used for transaction signing, ML-DSA-65 (the FIPS 204 standardized algorithm based on CRYSTALS-Dilithium), is relatively new and may be subject to unforeseen vulnerabilities as the field of post-quantum cryptography evolves.

7.5. **Oracle and data feed risks.** DeFi features that rely on external data (e.g., price feeds, event outcomes) are subject to oracle manipulation, data feed failures, or delays that could result in incorrect execution of smart contract logic and financial loss.

---

## 8. Network and Infrastructure Risks

8.1. **Network congestion.** Blockchain networks may experience periods of high congestion, resulting in delayed transaction confirmation, elevated gas fees, and potential transaction failures.

8.2. **Network forks.** Blockchain networks may undergo hard forks or soft forks that create competing chains. Forks may affect asset availability, create duplicate assets on different chains, or require user action to secure assets on the preferred chain.

8.3. **Chain halts.** Blockchain networks may experience temporary or permanent halts due to consensus failures, critical bugs, or governance decisions. During a halt, transactions cannot be processed and assets may be inaccessible.

8.4. **RPC provider outages.** The App connects to blockchain networks through RPC (Remote Procedure Call) providers. Outages or degraded performance of these providers may temporarily prevent you from viewing balances, broadcasting transactions, or interacting with the blockchain. This does not affect the security of your assets on-chain.

8.5. **Third-party service disruptions.** The App relies on third-party infrastructure for various functions (push notifications, call relay, backend storage). Disruptions to these services may affect App functionality but do not affect the security of your on-chain digital assets.

8.6. **Internet connectivity.** Most App functions require an active internet connection. While the App includes experimental Bluetooth mesh features for limited offline functionality, full digital asset management requires internet access.

---

## 9. Regulatory and Legal Risks

9.1. **Evolving regulatory landscape.** The regulation of digital assets, blockchain technology, decentralized finance, and encrypted communications varies significantly by jurisdiction and is rapidly evolving. Laws and regulations that are currently permissive may become restrictive or prohibitive.

9.2. **Securities classification.** Digital assets accessible through the App may be classified as securities, derivatives, commodities, or other regulated financial instruments in certain jurisdictions. The Company does not make any determination regarding the regulatory classification of any digital asset.

9.3. **Licensing requirements.** The use, purchase, sale, staking, or trading of digital assets may require licenses, registrations, or approvals in certain jurisdictions. You are solely responsible for determining and complying with all applicable licensing and registration requirements.

9.4. **Sanctions and restricted territories.** Interacting with digital assets or using encryption technologies may be prohibited or restricted in certain jurisdictions. You are solely responsible for ensuring that your use of the App complies with all applicable sanctions, export control, and encryption laws.

9.5. **Enforcement actions.** Regulatory authorities may take enforcement actions against blockchain protocols, token issuers, DeFi platforms, or service providers that could affect the availability, value, or legality of digital assets accessible through the App.

9.6. **No legal advice.** The Company does not provide legal advice regarding the regulatory status of any digital asset, DeFi feature, or blockchain activity. You should consult qualified legal counsel in your jurisdiction.

---

## 10. Tax Obligations

10.1. **User responsibility.** You are solely responsible for determining, calculating, reporting, and paying all taxes (including income tax, capital gains tax, value-added tax, and any other applicable taxes) arising from your use of the App and your digital asset activities.

10.2. **Taxable events.** Transactions involving digital assets -- including but not limited to buying, selling, trading, swapping, staking, providing liquidity, receiving rewards, participating in prediction markets, and receiving digital assets from campaigns or primary sales -- may constitute taxable events in your jurisdiction.

10.3. **Record keeping.** You are responsible for maintaining adequate records of all transactions for tax reporting purposes. The App may provide transaction history features, but the Company does not guarantee the completeness or accuracy of such records for tax purposes.

10.4. **No tax advice.** The Company does not provide tax advice and makes no representations regarding the tax consequences of any transaction or activity conducted through the App. You should consult a qualified tax professional regarding your specific circumstances.

---

## 11. No Insurance or Deposit Protection

11.1. **No government insurance.** Digital assets held in your self-custody wallet are **not** insured by any government deposit insurance program, including but not limited to the Federal Deposit Insurance Corporation (FDIC), the Securities Investor Protection Corporation (SIPC), the Financial Services Compensation Scheme (FSCS), or any equivalent program in any jurisdiction.

11.2. **No Company insurance.** The Company does not maintain insurance coverage for user digital assets and makes no guarantee against loss from any cause, including theft, hacking, smart contract failure, market volatility, or operational error.

11.3. **No deposit guarantee.** Digital assets are not bank deposits and are not guaranteed by any bank or financial institution. You may lose the entire value of your digital assets.

---

## 12. Third-Party Tokens and Assets

12.1. **No endorsement.** The display, listing, or support of any third-party token or digital asset in the App (including but not limited to USDT, USDC, DAI, WETH, WBTC, UNI, LINK, and any other ERC-20 or network-native token) does not constitute an endorsement, recommendation, guarantee, or warranty by the Company regarding that token's value, legitimacy, security, regulatory status, or fitness for any purpose.

12.2. **Third-party risk.** Third-party tokens are issued and managed by entities unrelated to the Company. The Company has no control over the issuance, supply, governance, smart contract code, regulatory compliance, or continued operation of any third-party token. Third-party tokens may be subject to depegging, smart contract failures, regulatory action, issuer insolvency, or other risks specific to their issuers and protocols.

12.3. **Stablecoin disclaimer.** Tokens marketed as "stablecoins" (e.g., USDT, USDC, DAI) are not guaranteed to maintain a stable value. Stablecoins may depeg from their reference asset, and issuers may face regulatory, reserve adequacy, or operational challenges that affect the token's value and redeemability.

12.4. **Delisting.** The Company reserves the right to add or remove support for any token at any time, with or without notice. Removal of token support does not affect your on-chain holdings, which remain accessible through other compatible wallet applications.

---

## 13. Experimental and Emerging Technology

13.1. **Post-quantum cryptography.** The App uses ML-DSA-65, the FIPS 204 post-quantum digital-signature algorithm based on CRYSTALS-Dilithium. While this algorithm represents the current state of the art in post-quantum signatures, the field is evolving, and unforeseen cryptographic weaknesses or attack vectors may be discovered in the future.

13.2. **Mozaga network.** The Mozaga blockchain is a custom Layer 1 network using novel consensus and cryptographic mechanisms. As a relatively new network, it carries inherent risks associated with less mature technology, including potential undiscovered bugs, lower network effects, smaller validator and developer ecosystems, and limited battle-testing under adversarial conditions.

13.3. **Bluetooth mesh and Tor routing.** The App's Bluetooth mesh relay and Tor routing features are experimental. These features may not function as expected, may have security limitations, and may be modified or removed in future versions. Neither feature guarantees anonymity, privacy, or message delivery.

13.4. **Rapid technological change.** The blockchain, cryptography, and digital asset industries are subject to rapid technological change. Features, protocols, and security assumptions that are current today may become obsolete, insecure, or non-functional in the future.

---

## 14. No Fiduciary Duty

14.1. The Company owes no fiduciary duty to any user of the App. The relationship between you and the Company is governed solely by these Terms, the Terms and Conditions, and the Privacy Policy.

14.2. The Company's provision of the App does not create any advisory, trust, agency, partnership, joint venture, or fiduciary relationship between the Company and you.

---

## 15. Assumption of Risk

15.1. **BY USING THE APP'S DIGITAL ASSET FEATURES, YOU EXPRESSLY ACKNOWLEDGE AND ASSUME ALL RISKS DESCRIBED IN THIS DISCLAIMER, AS WELL AS ANY OTHER RISKS INHERENT IN THE USE OF DIGITAL ASSETS, BLOCKCHAIN TECHNOLOGY, AND DECENTRALIZED FINANCE, WHETHER OR NOT SPECIFICALLY DESCRIBED HEREIN.**

15.2. You acknowledge that the Company has made this Disclaimer available to provide you with a comprehensive understanding of the risks involved. You agree that the Company shall not be liable for any losses you may incur as a result of your use of the App's digital asset features.

15.3. You represent that you have sufficient knowledge and experience in financial, business, and digital asset matters to evaluate the merits and risks of using the App, and that you have sought independent professional advice to the extent you deemed necessary.

---

## 16. Limitation of Liability

16.1. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE COMPANY, ITS DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, AFFILIATES, SUCCESSORS, AND ASSIGNS SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES ARISING FROM OR RELATED TO:

   (a) Loss of digital assets due to any cause, including but not limited to lost private keys, mnemonic phrases, or PINs;

   (b) Fluctuations in the value of digital assets;

   (c) Smart contract bugs, vulnerabilities, exploits, or failures;

   (d) Blockchain network failures, forks, congestion, halts, or reorganizations;

   (e) Impermanent loss, slippage, or other losses incurred through DeFi features;

   (f) Counterparty default or fraud in P2P or escrow transactions;

   (g) Failed or underperforming campaigns, primary sales, or prediction markets;

   (h) Slashing, lock-up, or reward variability in staking or participation;

   (i) Regulatory actions affecting digital assets or blockchain networks;

   (j) Tax liabilities arising from digital asset activities;

   (k) Third-party token failures, depeg events, or issuer insolvency;

   (l) RPC provider, backend, or third-party service outages;

   (m) Losses resulting from experimental features (post-quantum cryptography, Tor, Bluetooth mesh);

   (n) Any other cause related to the use of digital assets through the App;

   REGARDLESS OF THE THEORY OF LIABILITY (CONTRACT, TORT, STRICT LIABILITY, OR OTHERWISE), AND EVEN IF THE COMPANY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

---

## 17. Severability

If any provision of this Disclaimer is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, such invalidity shall not affect the remaining provisions, which shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it enforceable while preserving its intended purpose.

---

## 18. Relationship to Other Documents

This Disclaimer is part of the legal framework governing your use of the App and should be read together with:

- **Terms and Conditions** -- governing your overall use of the App
- **Privacy Policy** -- governing the collection, use, and protection of your data

In the event of any conflict between this Disclaimer and the Terms and Conditions, the provision that provides greater protection to the Company shall prevail.

---

## 19. Updates to This Disclaimer

The Company reserves the right to update this Disclaimer at any time. Material changes will be communicated through the App or by other reasonable means. Your continued use of the App's digital asset features after the effective date of any update constitutes your acceptance of the updated Disclaimer.

---

## 20. Contact Information

If you have any questions about this Disclaimer, please contact us at:

**${LEGAL_ENTITY_NAME}**
RUC: ${LEGAL_ENTITY_RUC}
${LEGAL_ENTITY_ADDRESS_LINES[0]}
${LEGAL_ENTITY_ADDRESS_LINES[1]}
Email: ${LEGAL_CONTACT_EMAIL}

---

*This Payment and Digital Assets Disclaimer was last updated on ${LEGAL_LAST_UPDATED}.*`

export const AGORA_TERMS_TEXT = `# Agora Terms

**Effective Date:** September 4, 2026
**Last Updated:** ${LEGAL_LAST_UPDATED}

These Agora Terms govern your use of Agora, Spectra's optional public plaza. They supplement the Spectra Terms and Conditions and Privacy Policy. If you do not agree, do not join Agora.

The English version controls. Translations are provided for convenience unless we expressly state otherwise.

---

## 1. What Agora Is

1.1. Agora is a public, unencrypted plaza of canonical topic rooms. It is not a private chat, encrypted group, call, or Spectre feature.

1.2. Agora is isolated from Spectra's end-to-end encrypted messaging. Private-chat encryption, sealed mailboxes, and related protections do not apply to Agora content.

1.3. Tor, when enabled, may hide your device IP address from Spectra's servers for supported Agora requests. Tor does not encrypt Agora messages, whispers, occupancy, or plaza nicks.

1.4. Spectre Mode accounts and Spectre wallets cannot use Agora.

---

## 2. No Encryption and Server Visibility

2.1. Public messages, whispers, occupancy, plaza nicks, nick colors, reports, blocks, and related plaza metadata are stored in plaintext on Spectra's servers.

2.2. Whispers are visible to you, the person you whisper, and Spectra. They are not end-to-end encrypted. Do not send secrets, passwords, recovery phrases, keys, financial credentials, or other sensitive data through Agora.

2.3. A private-chat invite sent from Agora is stored as an opaque one-time contact card bound to the recipient. The invite is not published in the public transcript. Redeeming it opens Spectra's separate encrypted contact/chat flow. The invite record itself is readable by Spectra until it expires or is used.

---

## 3. Identity and Conduct

3.1. Your Agora nick is a plaza handle. It is not your discovery alias and is not your EXO address. You may not choose a nick that matches your discovery alias or looks like an EXO00 address.

3.2. You are responsible for what you post, whisper, invite, report, or otherwise make available in Agora.

3.3. You must not use Agora for illegal, abusive, exploitative, harassing, hateful, violent, sexually exploitative, child sexual abuse, spam, phishing, scam, malware, or otherwise harmful activity. We may remove content, kick occupancy, block, rate limit, close rooms, or disable Agora access to protect users, comply with law, or enforce these terms.

3.4. Agora is not an emergency service.

---

## 4. Retention and Moderation

4.1. Public rooms keep a bounded recent history. Older public lines are deleted when the cap is exceeded. Whispers and unused private-chat invites expire after a short period. Occupancy is removed shortly after you leave, background the app beyond the hold window, or go idle.

4.2. Reports, blocks, and security logs may be retained longer as needed for safety, abuse prevention, and legal compliance.

4.3. Encryption does not limit what we can see in Agora. We may review plaza records when we believe it is necessary to enforce these terms, protect users, or comply with law.

---

## 5. Contact

${LEGAL_ENTITY_CONTACT}
Email: ${LEGAL_CONTACT_EMAIL}

---

*These Agora Terms were last updated on ${LEGAL_LAST_UPDATED}.*`

export interface LegalDoc {
  titleKey: string
  contentKey: string
  fallbackTitle: string
  fallbackContent: string
}

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  terms: {
    titleKey: 'legal.terms.title',
    contentKey: 'legal.terms.content',
    fallbackTitle: 'Terms and Conditions',
    fallbackContent: TERMS_TEXT,
  },
  privacy: {
    titleKey: 'legal.privacy.title',
    contentKey: 'legal.privacy.content',
    fallbackTitle: 'Privacy Policy',
    fallbackContent: PRIVACY_TEXT,
  },
  disclaimer: {
    titleKey: 'legal.disclaimer.title',
    contentKey: 'legal.disclaimer.content',
    fallbackTitle: 'Payment and Digital Assets Disclaimer',
    fallbackContent: DISCLAIMER_TEXT,
  },
  agora: {
    titleKey: 'legal.agora.title',
    contentKey: 'legal.agora.content',
    fallbackTitle: 'Agora Terms',
    fallbackContent: AGORA_TERMS_TEXT,
  },
}

import type { LocaleTranslationOverrides } from './translationOverrideTypes'

const translations = {
  common: {
    'Creating your post-quantum identity...': 'Deine Post-Quantum-Identität wird erstellt...',
    'Encrypted group sender keys': 'Verschlüsselte Gruppensendeschlüssel',
    'End-to-end encrypted': 'Ende-zu-Ende-verschlüsselt',
    'End-to-end encryption available for supported chats':
      'Ende-zu-Ende-Verschlüsselung für unterstützte Chats verfügbar',
    'Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.':
      'Gruppenschlüssel werden über deine vorhandenen verschlüsselten Direktverbindungen verteilt. Beim Entfernen eines Mitglieds wird der aktive Gruppenschlüssel automatisch rotiert.',
    'Hybrid post-quantum messaging': 'Hybride Post-Quantum-Messaging',
    'ML-DSA-65 post-quantum signatures': 'ML-DSA-65-Post-Quantum-Signaturen',
    'Post-quantum': 'Post-Quantum',
    'Post-quantum identity keys ready': 'Post-Quantum-Identitätsschlüssel bereit',
    'Securing your encrypted vault...': 'Dein verschlüsselter Tresor wird gesichert...',
    'Supported direct messages are end-to-end encrypted.':
      'Unterstützte Direktnachrichten sind Ende-zu-Ende-verschlüsselt.',
    ' +{{count}} more': ' +{{count}} weitere',
    '{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}':
      '{{bridgeCount}} {{transport}}-Brücken geladen. {{routeMessage}}',
    '{{count}} attachment_one': '{{count}} Anhang',
    '{{count}} attachment_other': '{{count}} Anhänge',
    '{{count}} groups in common': '{{count}} gemeinsame Gruppen',
    '{{count}} slots available': '{{count}} Plätze verfügbar',
    '{{error}} This request used the normal network while Tor was disabled.':
      '{{error}} Diese Anfrage hat das normale Netzwerk verwendet, während Tor deaktiviert war.',
    '{{network}} address': '{{network}}-Adresse',
    '{{senderName}} requested': '{{senderName}} hat angefragt',
    '{{width}} px': '{{width}} px',
    '+ gas in': '+ Gas in',
    'Account Name (Optional)': 'Kontoname (optional)',
    'Account ready': 'Konto bereit',
    'Add {{count}}': '{{count}} hinzufügen',
    'Add ETH before sending this token.': 'Füge ETH hinzu, bevor du diesen Token sendest.',
    'Add text': 'Text hinzufügen',
    'Add user': 'Nutzer hinzufügen',
    'Allowed': 'Erlaubt',
    'Apply crop': 'Zuschnitt anwenden',
    'Applying bridge configuration…': 'Bridge-Konfiguration wird angewendet…',
    'Applying direct Tor…': 'Direktes Tor wird angewendet…',
    'Archive Exported': 'Archiv exportiert',
    'Archive Passphrase': 'Archiv-Passphrase',
    'Archive Passphrase Required': 'Archiv-Passphrase erforderlich',
    'Archives unavailable': 'Archive nicht verfügbar',
    'At least 16 characters': 'Mindestens 16 Zeichen',
    'Available': 'Verfügbar',
    'Back': 'Zurück',
    'BIP39 word suggestions': 'BIP39-Wortvorschläge',
    'Block': 'Blockieren',
    'Block {{displayName}}? You will no longer receive messages from them.':
      '{{displayName}} blockieren? Du erhältst keine Nachrichten mehr von dieser Person.',
    'Bridge Update Failed': 'Bridge-Aktualisierung fehlgeschlagen',
    'Buy': 'Kaufen',
    'Calculated by network': 'Vom Netzwerk berechnet',
    'Calls': 'Anrufe',
    'Calls are only supported in direct chats.': 'Anrufe werden nur in Direktchats unterstützt.',
    'Calls unavailable': 'Anrufe nicht verfügbar',
    'Cancel Spectre Mode': 'Spectre-Modus abbrechen',
    'Canceling Spectre Mode...': 'Spectre-Modus wird abgebrochen...',
    'Chat bundle is still missing from the server.': 'Chat-Bundle fehlt weiterhin auf dem Server.',
    'Chat identity did not finish switching. Try reconnecting.':
      'Der Wechsel der Chat-Identität wurde nicht abgeschlossen. Versuche, die Verbindung erneut herzustellen.',
    'Chat identity is not ready for this EXO account.':
      'Die Chat-Identität ist für dieses EXO-Konto nicht bereit.',
    'Chat unavailable': 'Chat nicht verfügbar',
    'Chats': 'Chats',
    'Choose how long messages remain visible after they are read.':
      'Wähle, wie lange Nachrichten nach dem Lesen sichtbar bleiben.',
    'Claim Refund': 'Rückerstattung anfordern',
    'Clear chat': 'Chat leeren',
    'Close': 'Schließen',
    'Close media preview': 'Medienvorschau schließen',
    'Close poll failed': 'Umfrage konnte nicht geschlossen werden',
    'Color': 'Farbe',
    'Confirm & Send': 'Bestätigen und senden',
    'Confirm Payment': 'Zahlung bestätigen',
    'Confirm that you backed up the recovery phrase before using this EXO account.':
      'Bestätige, dass du die Wiederherstellungsphrase gesichert hast, bevor du dieses EXO-Konto verwendest.',
    'Confirm Transaction': 'Transaktion bestätigen',
    'Connecting encrypted chat...': 'Verschlüsselter Chat wird verbunden...',
    'Connecting securely...': 'Sichere Verbindung wird hergestellt...',
    'Connecting...': 'Verbindung wird hergestellt...',
    'Connection failed': 'Verbindung fehlgeschlagen',
    'Connection problem': 'Verbindungsproblem',
    'Contact Archive': 'Kontaktarchiv',
    'Contact archives are unavailable for Spectre accounts.':
      'Kontaktarchive sind für Spectre-Konten nicht verfügbar.',
    'Contact archives are unavailable while Spectre Mode is active.':
      'Kontaktarchive sind nicht verfügbar, während der Spectre-Modus aktiv ist.',
    'Contacts: {{contacts}}': 'Kontakte: {{contacts}}',
    'Copy TX': 'TX kopieren',
    'Could not add members': 'Mitglieder konnten nicht hinzugefügt werden',
    'Could not import shared content': 'Geteilte Inhalte konnten nicht importiert werden',
    'Could not link this chat identity to the server.':
      'Diese Chat-Identität konnte nicht mit dem Server verknüpft werden.',
    'Could not open this chat': 'Dieser Chat konnte nicht geöffnet werden',
    'Could not open this chat.': 'Dieser Chat konnte nicht geöffnet werden.',
    'Could not prepare this EXO account.': 'Dieses EXO-Konto konnte nicht vorbereitet werden.',
    'Could not publish chat bundle.': 'Chat-Bundle konnte nicht veröffentlicht werden.',
    'Could not save the edited image. Please try again.':
      'Das bearbeitete Bild konnte nicht gespeichert werden. Bitte versuche es erneut.',
    'Could not save your public name. Please try again.':
      'Der öffentliche Name konnte nicht gespeichert werden. Bitte versuche es erneut.',
    'Could not switch back to the root EXO account.':
      'Es konnte nicht zum Root-EXO-Konto zurückgewechselt werden.',
    'Could not switch EXO account': 'EXO-Konto konnte nicht gewechselt werden',
    'Could not update notifications': 'Benachrichtigungen konnten nicht aktualisiert werden',
    'Could not update this image. Please try again.':
      'Dieses Bild konnte nicht aktualisiert werden. Bitte versuche es erneut.',
    'Could not verify the server session for this EXO account.':
      'Die Serversitzung für dieses EXO-Konto konnte nicht verifiziert werden.',
    'Create a new transparent EXO account for work, friends, or another chat identity.':
      'Erstelle ein neues transparentes EXO-Konto für Arbeit, Freunde oder eine andere Chat-Identität.',
    'Create EXO Account': 'EXO-Konto erstellen',
    'Created': 'Erstellt',
    'Creator': 'Ersteller',
    'Crop': 'Zuschneiden',
    'Default': 'Standard',
    'Diffusion channels require Spectre access.': 'Diffusionskanäle erfordern Spectre-Zugang.',
    'Disappearing messages': 'Verschwindende Nachrichten',
    'Drag text on the image to reposition it.': 'Ziehe den Text auf dem Bild, um ihn neu zu positionieren.',
    'Drag the crop frame or its corners, then apply.':
      'Ziehe den Zuschneiderahmen oder seine Ecken und wende dann den Zuschnitt an.',
    'Draw': 'Zeichnen',
    'Each recovery phrase restores up to 5 transparent EXO accounts.':
      'Jede Wiederherstellungsphrase stellt bis zu 5 transparente EXO-Konten wieder her.',
    'Edit': 'Bearbeiten',
    'Edit and resend': 'Bearbeiten und erneut senden',
    'Edit image': 'Bild bearbeiten',
    'Encrypted contact archive': 'Verschlüsseltes Kontaktarchiv',
    'Enter a valid amount': 'Gib einen gültigen Betrag ein',
    'Enter a valid EXO price greater than zero.': 'Gib einen gültigen EXO-Preis größer als null ein.',
    'ERC-20 on Ethereum Mainnet': 'ERC-20 im Ethereum-Mainnet',
    'ERC-20 Tokens': 'ERC-20-Token',
    'Erasing...': 'Wird gelöscht...',
    'Est. gas: {{amount}} {{symbol}}': 'Geschätztes Gas: {{amount}} {{symbol}}',
    'Establishing secure call...': 'Sicherer Anruf wird aufgebaut...',
    'Estimated fee': 'Geschätzte Gebühr',
    'EXO Account {{number}}': 'EXO-Konto {{number}}',
    'EXO account creation is disabled while Spectre Mode is active.':
      'Die Erstellung von EXO-Konten ist nicht verfügbar, während der Spectre-Modus aktiv ist.',
    'External links are unavailable while Spectre Mode is active.':
      'Externe Links sind nicht verfügbar, während der Spectre-Modus aktiv ist.',
    'External links unavailable': 'Externe Links nicht verfügbar',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Exportiere eine verschlüsselte Datei, die du kontrollierst, und importiere sie später, um gespeicherte Kontakte zu erhalten.',
    'Export Failed': 'Export fehlgeschlagen',
    'Export file': 'Datei exportieren',
    'Failed to claim refund': 'Rückerstattung konnte nicht angefordert werden',
    'Failed to complete the paid join flow': 'Der kostenpflichtige Beitritt konnte nicht abgeschlossen werden',
    'Failed to create poll': 'Umfrage konnte nicht erstellt werden',
    'Failed to create poll message': 'Umfragenachricht konnte nicht erstellt werden',
    'Failed to create request': 'Anfrage konnte nicht erstellt werden',
    'Failed to generate account': 'Konto konnte nicht erstellt werden',
    'Failed to import account': 'Konto konnte nicht importiert werden',
    'Failed to Load': 'Laden fehlgeschlagen',
    'Failed to load market': 'Markt konnte nicht geladen werden',
    'Failed to save EXO account': 'EXO-Konto konnte nicht gespeichert werden',
    'Failed to save membership access settings':
      'Einstellungen für den Mitgliedschaftszugang konnten nicht gespeichert werden',
    'Failed to switch EXO account': 'EXO-Konto konnte nicht gewechselt werden',
    'Failed to verify the payment confirmation.':
      'Die Zahlungsbestätigung konnte nicht verifiziert werden.',
    'Fetched over the normal network while Tor was disabled.':
      'Über das normale Netzwerk abgerufen, während Tor deaktiviert war.',
    'Generating secure keys...': 'Sichere Schlüssel werden erstellt...',
    'Group members': 'Gruppenmitglieder',
    'Hidden': 'Ausgeblendet',
    'Hide {{displayName}} from your Contacts tab on this device? Chats and encryption keys will stay intact.':
      '{{displayName}} auf diesem Gerät aus dem Kontakte-Tab ausblenden? Chats und Verschlüsselungsschlüssel bleiben erhalten.',
    'Hide this contact\'s public name in your push notifications.':
      'Blende den öffentlichen Namen dieses Kontakts in deinen Push-Benachrichtigungen aus.',
    'I backed up this recovery phrase offline.': 'Ich habe diese Wiederherstellungsphrase offline gesichert.',
    'I understand': 'Ich verstehe',
    'Import': 'Importieren',
    'Import a transparent EXO recovery phrase into this unlocked root vault.':
      'Importiere eine transparente EXO-Wiederherstellungsphrase in diesen entsperrten Root-Tresor.',
    'Import and Use Account': 'Konto importieren und verwenden',
    'Import Complete': 'Import abgeschlossen',
    'Import contact archive?': 'Kontaktarchiv importieren?',
    'Import EXO Account': 'EXO-Konto importieren',
    'Import Failed': 'Import fehlgeschlagen',
    'Import file': 'Datei importieren',
    'Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.':
      'Importierte Kontakte werden mit den bereits auf diesem Gerät vorhandenen Kontakten zusammengeführt. Chats, Nachrichten, Sitzungen, Gruppenschlüssel und Medien werden nie importiert.',
    'Importing...': 'Wird importiert...',
    'Incorrect PIN': 'Falsche PIN',
    'Invalid {{network}} address': 'Ungültige {{network}}-Adresse',
    'Invalid amount': 'Ungültiger Betrag',
    'Invalid market ID': 'Ungültige Markt-ID',
    'Invalid recipient address': 'Ungültige Empfängeradresse',
    'Invalid recovery phrase': 'Ungültige Wiederherstellungsphrase',
    'Load this image before editing it.': 'Lade dieses Bild, bevor du es bearbeitest.',
    'Loading pool data...': 'Pooldaten werden geladen...',
    'Loading shared content...': 'Geteilte Inhalte werden geladen...',
    'Loading voice note...': 'Sprachnotiz wird geladen...',
    'Make sure no one is watching your screen': 'Stelle sicher, dass niemand auf deinen Bildschirm schaut',
    'Max': 'Max.',
    'Media': 'Medien',
    'Media, links and docs': 'Medien, Links und Dokumente',
    'Message unavailable': 'Nachricht nicht verfügbar',
    'Messages': 'Nachrichten',
    'Minimize call': 'Anruf minimieren',
    'Muted': 'Stummgeschaltet',
    'My {{network}} Address': 'Meine {{network}}-Adresse',
    'Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}':
      'Weder die angeforderte Konfiguration noch die vorherigen Bridges konnten eine Verbindung herstellen. Tor bleibt aktiviert und der Backend-Datenverkehr bleibt blockiert. {{error}}',
    'Network': 'Netzwerk',
    'Network Fee': 'Netzwerkgebühr',
    'Network State': 'Netzwerkstatus',
    'Network: Mozaga native EXO': 'Netzwerk: natives EXO von Mozaga',
    'Never share your recovery phrase': 'Teile deine Wiederherstellungsphrase niemals',
    'New encrypted message': 'Neue verschlüsselte Nachricht',
    'New EXO Account': 'Neues EXO-Konto',
    'New group message': 'Neue Gruppennachricht',
    'New message': 'Neue Nachricht',
    'New message notifications': 'Benachrichtigungen über neue Nachrichten',
    'Next': 'Weiter',
    'No active wallet is available.': 'Keine aktive Wallet verfügbar.',
    'No address for this network': 'Keine Adresse für dieses Netzwerk',
    'No documents shared yet': 'Noch keine Dokumente geteilt',
    'No links shared yet': 'Noch keine Links geteilt',
    'No Spectra chats are available for sharing yet.': 'Noch keine Spectra-Chats zum Teilen verfügbar.',
    'No tokens found': 'Keine Token gefunden',
    'Notifications': 'Benachrichtigungen',
    'On': 'Ein',
    'Only import a recovery phrase you control. Imported accounts can send and receive chats independently.':
      'Importiere nur eine Wiederherstellungsphrase, die du kontrollierst. Importierte Konten können unabhängig Nachrichten senden und empfangen.',
    'Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.':
      'Es werden nur gespeicherte Kontakte und Kontaktbezeichnungen einbezogen. Bestehende Kontakte bleiben erhalten, und wiederhergestellte Kontakte sind sofort nach dem Import verfügbar.',
    'Opening...': 'Wird geöffnet...',
    'Paid access setup incomplete': 'Einrichtung des kostenpflichtigen Zugangs unvollständig',
    'Paid by {{payerName}}': 'Bezahlt von {{payerName}}',
    'Paid in {{symbol}}': 'Bezahlt in {{symbol}}',
    'Paste recovery phrase': 'Wiederherstellungsphrase einfügen',
    'Pay {{amount}}': '{{amount}} bezahlen',
    'Pay request': 'Zahlungsanfrage bezahlen',
    'Payment': 'Zahlung',
    'Payment already submitted': 'Zahlung bereits übermittelt',
    'Payment failed': 'Zahlung fehlgeschlagen',
    'Payment message received': 'Zahlungsnachricht erhalten',
    'Payment paid': 'Zahlung erfolgt',
    'Payment Pending': 'Zahlung ausstehend',
    'Payment recorded': 'Zahlung erfasst',
    'Payment request: {{amount}} {{symbol}}': 'Zahlungsanfrage: {{amount}} {{symbol}}',
    'Payment Required': 'Zahlung erforderlich',
    'Payment submitted': 'Zahlung übermittelt',
    'Payment submitted: {{amount}} {{symbol}}': 'Zahlung übermittelt: {{amount}} {{symbol}}',
    'Platform fee: {{fee}}': 'Plattformgebühr: {{fee}}',
    'Please allow access to your photo library to change the group photo.':
      'Erlaube den Zugriff auf deine Fotomediathek, um das Gruppenfoto zu ändern.',
    'Please retry the chat setup first.': 'Bitte versuche zuerst erneut, den Chat einzurichten.',
    'Please wait until this chat is ready.': 'Bitte warte, bis dieser Chat bereit ist.',
    'Post request': 'Anfrage senden',
    'Preparing voice note...': 'Sprachnotiz wird vorbereitet...',
    'Previous': 'Zurück',
    'Previous Bridges Restored': 'Vorherige Bridges wiederhergestellt',
    'Private handoff': 'Privater Übergang',
    'Public name in notifications': 'Öffentlicher Name in Benachrichtigungen',
    'Publishing chat bundle...': 'Chat-Bundle wird veröffentlicht...',
    'Receive address': 'Empfangsadresse',
    'Receive Crypto': 'Krypto empfangen',
    'Recipient': 'Empfänger',
    'Recipient {{network}} Address': '{{network}}-Adresse des Empfängers',
    'Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.':
      'Empfänger werden nur innerhalb von Spectra angezeigt. iOS sieht nur das Ziel der Spectra-App.',
    'Reconnecting...': 'Verbindung wird erneut hergestellt...',
    'Recovering secure call...': 'Sicherer Anruf wird wiederhergestellt...',
    'Recovery word {{number}}': 'Wiederherstellungswort {{number}}',
    'Refresh': 'Aktualisieren',
    'Regenerate': 'Neu generieren',
    'Request a payment in this chat': 'Zahlung in diesem Chat anfordern',
    'Requested asset is not available in this wallet': 'Angeforderter Vermögenswert ist in dieser Wallet nicht verfügbar',
    'Reset': 'Zurücksetzen',
    'Retry failed': 'Erneuter Versuch fehlgeschlagen',
    'Review Send': 'Senden prüfen',
    'Root account': 'Root-Konto',
    'Root account required': 'Root-Konto erforderlich',
    'Rotate': 'Rotieren',
    'Save and Use Account': 'Konto speichern und verwenden',
    'Save encrypted contact archive': 'Verschlüsseltes Kontaktarchiv speichern',
    'Search contacts...': 'Kontakte suchen...',
    'Secure call': 'Sicherer Anruf',
    'Secure call notifications': 'Benachrichtigungen über sichere Anrufe',
    'Secure call waiting': 'Sicherer Anruf wartet',
    'Securing chat...': 'Chat wird gesichert...',
    'Preparing secure channel...': 'Chat wird gesichert...',
    'Select Blockchain': 'Blockchain auswählen',
    'Select drawing color': 'Zeichenfarbe auswählen',
    'Sell': 'Verkaufen',
    'Send {{symbol}}': '{{symbol}} senden',
    'Send {{symbol}} to my {{network}} address:\n{{address}}':
      '{{symbol}} an meine {{network}}-Adresse senden:\n{{address}}',
    'Send ETH': 'ETH senden',
    'Sending as {{account}}': 'Senden als {{account}}',
    'Sending transaction...': 'Transaktion wird gesendet...',
    'Share {{network}} Address': '{{network}}-Adresse teilen',
    'Share contact': 'Kontakt teilen',
    'Share to Spectra': 'Mit Spectra teilen',
    'Shared content is missing. Please share it again.':
      'Geteilter Inhalt fehlt. Bitte teile ihn erneut.',
    'Show {{displayName}} in your Contacts tab again?':
      '{{displayName}} wieder im Kontakte-Tab anzeigen?',
    'Snowflake bootstrap privacy notice': 'Datenschutzhinweis zum Snowflake-Start',
    'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.':
      'Snowflake verwendet WebRTC-Startinfrastruktur, einschließlich Broker-, STUN- und freiwilliger Proxy-Dienste. Diese Dienste können die IP-Adresse deines Geräts und den Zeitpunkt der Verbindung sehen. Tor schützt den Datenverkehr nach Aufbau eines Circuits, kann diese Startverbindung jedoch nicht verbergen.',
    'Solana private key is not available': 'Privater Solana-Schlüssel ist nicht verfügbar',
    'Solana wallet not available': 'Solana-Wallet nicht verfügbar',
    'Something went wrong. Please try again.': 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
    'Spectra logo': 'Spectra-Logo',
    'Spectre access includes one diffusion channel.':
      'Der Spectre-Zugang umfasst einen Diffusionskanal.',
    'SPL Tokens': 'SPL-Token',
    'SPL tokens on Solana': 'SPL-Token auf Solana',
    'Stroke': 'Strich',
    'Switch to your root EXO account to create transparent EXO accounts.':
      'Wechsle zu deinem Root-EXO-Konto, um transparente EXO-Konten zu erstellen.',
    'Switch to your root EXO account to import transparent EXO accounts.':
      'Wechsle zu deinem Root-EXO-Konto, um transparente EXO-Konten zu importieren.',
    'Switching EXO account...': 'EXO-Konto wird gewechselt...',
    'Switching...': 'Wird gewechselt...',
    'Tap to load voice note': 'Tippe, um die Sprachnotiz zu laden',
    'Tap to reveal your recovery phrase': 'Tippe, um deine Wiederherstellungsphrase anzuzeigen',
    'Tap to review and pay': 'Tippe, um zu prüfen und zu bezahlen',
    'Tap to view shared links and documents': 'Tippe, um geteilte Links und Dokumente anzusehen',
    'Text': 'Text',
    'Text or link': 'Text oder Link',
    'The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.':
      'Das Archiv wird auf diesem Gerät verschlüsselt, bevor es geteilt wird. Es wird niemals zu Spectra hochgeladen. Bewahre Datei und Passphrase getrennt auf; Spectra kann keines von beidem wiederherstellen.',
    'The payment transaction failed on-chain.': 'Die Zahlungstransaktion ist on-chain fehlgeschlagen.',
    'This EXO account already exists on this device.': 'Dieses EXO-Konto existiert bereits auf diesem Gerät.',
    'This fetch used the normal network while Tor was disabled.':
      'Dieser Abruf hat das normale Netzwerk verwendet, während Tor deaktiviert war.',
    'This file is not available on this device yet.': 'Diese Datei ist auf diesem Gerät noch nicht verfügbar.',
    'This image could not be edited right now.': 'Dieses Bild konnte gerade nicht bearbeitet werden.',
    'This message was deleted': 'Diese Nachricht wurde gelöscht',
    'This recovery phrase is shown only now. Store it offline before saving the new EXO account.':
      'Diese Wiederherstellungsphrase wird nur jetzt angezeigt. Speichere sie offline, bevor du das neue EXO-Konto sicherst.',
    'This request has already been marked as paid.': 'Diese Anfrage wurde bereits als bezahlt markiert.',
    'This secure chat is not ready yet. Please try again in a moment.':
      'Dieser sichere Chat ist noch nicht bereit. Bitte versuche es gleich noch einmal.',
    'This voice note could not be loaded right now.': 'Diese Sprachnotiz konnte gerade nicht geladen werden.',
    'This wallet does not have an account for {{network}}.':
      'Diese Wallet hat kein Konto für {{network}}.',
    'To': 'An',
    'Toggle media controls': 'Mediensteuerung umschalten',
    'Tor Bridges': 'Tor-Brücken',
    'Tor Connection Failed': 'Tor-Verbindung fehlgeschlagen',
    'Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}':
      'Tor konnte mit der angeforderten Konfiguration keine Verbindung herstellen; deshalb wurden die zuvor funktionierenden Bridges wiederhergestellt. {{error}}',
    'Tor is disabled, so bridge requests will use the normal network.':
      'Tor ist deaktiviert; Bridge-Anfragen verwenden daher das normale Netzwerk.',
    'Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.':
      'Tor ist aktiviert, aber nicht verbunden. Deaktiviere Tor, bevor du Bootstrap-Bridges über das normale Netzwerk abrufst.',
    'Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.':
      'Tor stellt noch eine Verbindung her. Bridge-Anfragen bleiben blockiert, bis ein Tor-Circuit verfügbar ist.',
    'Transaction failed on-chain': 'Transaktion ist on-chain fehlgeschlagen',
    'Transfers': 'Überweisungen',
    'Transparent EXO accounts are restored from your recovery phrase.':
      'Transparente EXO-Konten werden aus deiner Wiederherstellungsphrase wiederhergestellt.',
    'TRC-20 on Tron': 'TRC-20 auf Tron',
    'TRC-20 Tokens': 'TRC-20-Token',
    'Tron private key is not available': 'Privater Tron-Schlüssel ist nicht verfügbar',
    'Tron wallet not available': 'Tron-Wallet nicht verfügbar',
    'Try Again': 'Erneut versuchen',
    'Unable to edit image': 'Bild kann nicht bearbeitet werden',
    'Unable to load voice note': 'Sprachnotiz kann nicht geladen werden',
    'Unable to open link': 'Link kann nicht geöffnet werden',
    'Unable to remove recipient': 'Empfänger kann nicht entfernt werden',
    'Unable to retry': 'Erneuter Versuch nicht möglich',
    'Unable to send': 'Senden nicht möglich',
    'Unable to switch EXO account': 'EXO-Konto kann nicht gewechselt werden',
    'Unblock': 'Entsperren',
    'Unblock {{displayName}}? They will be able to send you messages again.':
      '{{displayName}} entsperren? Diese Person kann dir dann wieder Nachrichten senden.',
    'Undo': 'Rückgängig',
    'Unlock the wallet that will pay for this membership and try again.':
      'Entsperre die Wallet, die diese Mitgliedschaft bezahlt, und versuche es erneut.',
    'Unlock your vault before managing a contact archive.':
      'Entsperre deinen Tresor, bevor du ein Kontaktarchiv verwaltest.',
    'Unsupported {{type}} attachment': 'Nicht unterstützter {{type}}-Anhang',
    'Unsupported attachment': 'Nicht unterstützter Anhang',
    'Upgrade to Spectre to create one diffusion channel.':
      'Aktualisiere auf Spectre, um einen Diffusionskanal zu erstellen.',
    'Use': 'Verwenden',
    'Use {{word}} for recovery word {{number}}':
      '{{word}} als Wiederherstellungswort {{number}} verwenden',
    'Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.':
      'Verwende eine eindeutige Passphrase mit mindestens 16 Zeichen, einschließlich Buchstaben, Zahlen und Symbolen. Spectra kann sie nicht wiederherstellen.',
    'Use Biometric': 'Biometrie verwenden',
    'Use original': 'Original verwenden',
    'Use the original offline backup you created during onboarding if you need the phrase again. If it is lost, create a newly backed up wallet and migrate to it. The device cannot reveal the old phrase.':
      'Verwende das ursprüngliche Offline-Backup, das du während der Einrichtung erstellt hast, wenn du die Phrase erneut benötigst. Falls sie verloren geht, erstelle eine neu gesicherte Wallet und migriere dorthin. Das Gerät kann die alte Phrase nicht anzeigen.',
    'V1 supports Mozaga native EXO only. The company fee is {{fee}}.':
      'V1 unterstützt nur natives EXO von Mozaga. Die Unternehmensgebühr beträgt {{fee}}.',
    'via {{account}}': 'über {{account}}',
    'Voice note unavailable': 'Sprachnotiz nicht verfügbar',
    'Volume': 'Lautstärke',
    'Wallet transfer notifications': 'Benachrichtigungen über Wallet-Überweisungen',
    'Wallets': 'Wallets',
    'Work, Friends, Personal...': 'Arbeit, Freunde, Privat...',
    'You can import up to 5 transparent EXO accounts from one recovery phrase.':
      'Du kannst bis zu 5 transparente EXO-Konten aus einer Wiederherstellungsphrase importieren.',
    'You requested': 'Du hast angefragt',
    'You\'ll enter the {{network}} address in the next step':
      'Im nächsten Schritt gibst du die {{network}}-Adresse ein',
    'Your payment was submitted but is still waiting for confirmation. Reopen this invite in a moment to finish joining.':
      'Deine Zahlung wurde übermittelt, wartet aber noch auf Bestätigung. Öffne diese Einladung gleich erneut, um den Beitritt abzuschließen.',
    'A newer version of Spectra is available. Update to get the latest features and fixes.':
      'Eine neuere Version von Spectra ist verfügbar. Aktualisiere die App, um die neuesten Funktionen und Fehlerbehebungen zu erhalten.',
    'This version of Spectra is no longer supported. Update to continue using secure services.':
      'Diese Version von Spectra wird nicht mehr unterstützt. Aktualisiere die App, um die sicheren Dienste weiter zu nutzen.',
    'Update available': 'Update verfügbar',
    'Update required': 'Update erforderlich',
    'Update Spectra': 'Spectra aktualisieren',
  },
  auth: {
    '{{count}} characters maximum.': 'Maximal {{count}} Zeichen.',
    'Account import progress': 'Fortschritt beim Kontoimport',
    'Authenticate to upgrade biometric unlock':
      'Authentifiziere dich, um die biometrische Entsperrung zu aktualisieren',
    'Choose a Public Name': 'Öffentlichen Namen wählen',
    'Deriving wallets...': 'Wallets werden abgeleitet...',
    'Finishing previous account deletion...': 'Vorherige Kontolöschung wird abgeschlossen...',
    'Go back': 'Zurück',
    'Important': 'Wichtig',
    'Importing Account': 'Konto wird importiert',
    'Invalid mnemonic checksum': 'Ungültige Prüfsumme der Mnemonik',
    'Invalid word: "{{word}}"': 'Ungültiges Wort: "{{word}}"',
    'Mnemonic must be 12 or 24 words': 'Die Mnemonik muss aus 12 oder 24 Wörtern bestehen',
    'Optional public name for chats': 'Optionaler öffentlicher Name für Chats',
    'PIN input': 'PIN-Eingabe',
    'Public Name': 'Öffentlicher Name',
    'Public name contains invalid text.': 'Der öffentliche Name enthält ungültigen Text.',
    'Public name contains unsupported characters': 'Der öffentliche Name enthält nicht unterstützte Zeichen',
    'Public name contains unsupported control characters.':
      'Der öffentliche Name enthält nicht unterstützte Steuerzeichen.',
    'Public name contains unsupported direction controls.':
      'Der öffentliche Name enthält nicht unterstützte Richtungssteuerzeichen.',
    'Public name is too large': 'Der öffentliche Name ist zu lang',
    'Public name is too large when encoded.':
      'Der öffentliche Name ist in codierter Form zu lang.',
    'Public name must be {{max}} characters or fewer':
      'Der öffentliche Name darf höchstens {{max}} Zeichen haben',
    'Public name must be 80 characters or fewer.':
      'Der öffentliche Name darf höchstens 80 Zeichen haben.',
    'This optional name helps people recognize you in chats and contacts. You can change or remove it later.':
      'Dieser optionale Name hilft anderen, dich in Chats und Kontakten zu erkennen. Du kannst ihn später ändern oder entfernen.',
    'Unable to use this public name': 'Dieser öffentliche Name kann nicht verwendet werden',
    'Unlock Spectra to connect your secure call':
      'Entsperre Spectra, um deinen sicheren Anruf zu verbinden',
    'Your public name is shared as chat-directory metadata. It is not included in your recovery phrase and does not affect account security.':
      'Dein öffentlicher Name wird als Metadaten im Chatverzeichnis geteilt. Er ist nicht in deiner Wiederherstellungsphrase enthalten und beeinflusst die Kontosicherheit nicht.',
  },
  chat: {
    '#Tag': '#Tag',
    '{{count}} messages': '{{count}} Nachrichten',
    '{{name}} took a screenshot': '{{name}} hat einen Screenshot erstellt',
    'Add a contact and open a private chat': 'Kontakt hinzufügen und privaten Chat öffnen',
    'Add attachment': 'Anhang hinzufügen',
    'Add by address': 'Über Adresse hinzufügen',
    'Add by invitation': 'Über Einladung hinzufügen',
    'Add someone by address or scan their QR code to start.':
      'Füge jemanden über die Adresse hinzu oder scanne den QR-Code, um zu beginnen.',
    'Caching locally': 'Wird lokal gespeichert',
    'Cancel reply': 'Antwort abbrechen',
    'Cancel voice note': 'Sprachnotiz abbrechen',
    'Choose a contact or start with an address': 'Kontakt auswählen oder mit einer Adresse beginnen',
    'Choose a contact or use a secure invitation':
      'Kontakt auswählen oder eine sichere Einladung verwenden',
    'Complete': 'Abgeschlossen',
    'Crop bottom-left handle': 'Zuschneidegriff unten links',
    'Crop bottom-right handle': 'Zuschneidegriff unten rechts',
    'Crop frame': 'Zuschneiderahmen',
    'Crop top-left handle': 'Zuschneidegriff oben links',
    'Crop top-right handle': 'Zuschneidegriff oben rechts',
    'Edit image': 'Bild bearbeiten',
    'Encrypting and uploading {{completed}}/{{total}}':
      'Verschlüsseln und hochladen {{completed}}/{{total}}',
    'Load more': 'Mehr laden',
    'Nearby': 'In der Nähe',
    'Nearby delivery expired': 'Zustellung in der Nähe abgelaufen',
    'Nearby delivery failed': 'Zustellung in der Nähe fehlgeschlagen',
    'Nearby delivery interrupted': 'Zustellung in der Nähe unterbrochen',
    'Nearby queue full': 'Warteschlange für die Nähe ist voll',
    'Nearby receipt timed out': 'Empfangsbestätigung in der Nähe hat das Zeitlimit überschritten',
    'Nearby retry limit reached': 'Wiederholungslimit für die Nähe erreicht',
    'Nearby transmission failed': 'Übertragung in der Nähe fehlgeschlagen',
    'No saved contacts yet': 'Noch keine gespeicherten Kontakte',
    'Paste a secure invitation or scan its QR code':
      'Sichere Einladung einfügen oder ihren QR-Code scannen',
    'Paste a secure invitation or scan its QR code to start.':
      'Füge eine sichere Einladung ein oder scanne ihren QR-Code, um zu beginnen.',
    'Pause voice note': 'Sprachnotiz pausieren',
    'Play voice note': 'Sprachnotiz abspielen',
    'Preparing message': 'Nachricht wird vorbereitet',
    'Queued nearby': 'In der Nähe in Warteschlange',
    'Record voice note': 'Sprachnotiz aufnehmen',
    'Remove attachment': 'Anhang entfernen',
    'Scan, add, and start a private chat': 'Scannen, hinzufügen und privaten Chat starten',
    'Select from contacts': 'Aus Kontakten auswählen',
    'Send message': 'Nachricht senden',
    'Send voice note': 'Sprachnotiz senden',
    'Sending attachment': 'Anhang wird gesendet',
    'Sending message': 'Nachricht wird gesendet',
    'Sending nearby': 'Wird in der Nähe gesendet',
    'Start Chat': 'Chat starten',
    'Start Secret Chat': 'Geheimen Chat starten',
    'Starting chat...': 'Chat wird gestartet...',
    'Starting from {{account}}': 'Startet von {{account}}',
    'Text overlay': 'Textüberlagerung',
    'Toggle one-time message': 'Einmalnachricht umschalten',
    'Unable to start chat': 'Chat kann nicht gestartet werden',
    'Updated {{time}}': 'Aktualisiert {{time}}',
    'You took a screenshot': 'Du hast einen Screenshot erstellt',
  },
  contacts: {
    'Add by secure contact invitation': 'Über sichere Kontakteinladung hinzufügen',
    'Adding to': 'Hinzufügen zu',
    'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.':
      'Gib die Post-Quantum-Adresse der Person ein, die du hinzufügen möchtest. Sie muss ihre Adresse mit dir geteilt haben.',
    'EXO Account': 'EXO-Konto',
    'Invalid contact invitation': 'Ungültige Kontakteinladung',
    'Invalid secure contact invitation': 'Ungültige sichere Kontakteinladung',
    'Paste a secure contact invitation or scan a contact QR code':
      'Sichere Kontakteinladung einfügen oder Kontakt-QR-Code scannen',
    'Paste a secure contact invitation or scan its QR code.':
      'Füge eine sichere Kontakteinladung ein oder scanne ihren QR-Code.',
    'Paste a valid secure contact invitation.': 'Füge eine gültige sichere Kontakteinladung ein.',
    'Please wait until the EXO account switch finishes.':
      'Bitte warte, bis der Wechsel des EXO-Kontos abgeschlossen ist.',
    'Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.':
      'Scanne einen Kontakt-QR-Code oder füge die sichere Kontakteinladung ein, die die Person mit dir geteilt hat.',
    'Scan a secure Spectra contact QR code shared by the person you want to add.':
      'Scanne einen sicheren Spectra-Kontakt-QR-Code, den die Person mit dir geteilt hat.',
    'Secure Contact Invitation': 'Sichere Kontakteinladung',
    'Secure invitation ready': 'Sichere Einladung bereit',
    'Selected': 'Ausgewählt',
    'Switching...': 'Wird gewechselt...',
    'This contact will be saved under this EXO account on this device.':
      'Dieser Kontakt wird auf diesem Gerät unter diesem EXO-Konto gespeichert.',
    'via {{account}}': 'über {{account}}',
  },
  crypto: {
    '~{{fee}} {{symbol}}': '~{{fee}} {{symbol}}',
    '{{symbol}} logo': '{{symbol}}-Logo',
    'USDT logo': 'USDT-Logo',
  },
  markets: {
    '{{count}} backers': '{{count}} Unterstützer',
    '{{count}}d left': 'noch {{count}} Tage',
    '{{count}}h left': 'noch {{count}} Std.',
    '{{count}}m left': 'noch {{count}} Min.',
    '0 (unlimited)': '0 (unbegrenzt)',
    'Amount exceeds remaining allowance': 'Betrag überschreitet das verbleibende Limit',
    'Cannot contribute': 'Beitrag nicht möglich',
    'Connect wallet to create a campaign': 'Wallet verbinden, um eine Kampagne zu erstellen',
    'Connect wallet to create an escrow order': 'Wallet verbinden, um einen Treuhandauftrag zu erstellen',
    'Connect wallet to view your campaigns': 'Wallet verbinden, um deine Kampagnen anzuzeigen',
    'Connect wallet to view your escrow orders': 'Wallet verbinden, um deine Treuhandaufträge anzuzeigen',
    'Describe the condition for release...': 'Bedingung für die Freigabe beschreiben...',
    'Enter a valid market ID': 'Gib eine gültige Markt-ID ein',
    'Enter a valid sale ID': 'Gib eine gültige Verkaufs-ID ein',
    'Fiat price must be greater than zero': 'Der Fiat-Preis muss größer als null sein',
    'Filled': 'Ausgeführt',
    'Hot Predictions': 'Beliebte Prognosen',
    'Invalid campaign ID': 'Ungültige Kampagnen-ID',
    'Invalid order ID': 'Ungültige Auftrags-ID',
    'Invalid sale ID': 'Ungültige Verkaufs-ID',
    'Live Campaigns': 'Laufende Kampagnen',
    'No description': 'Keine Beschreibung',
    'No escrow orders found': 'Keine Treuhandaufträge gefunden',
    'No order activity yet': 'Noch keine Auftragsaktivität',
    'of': 'von',
    'Partially Filled': 'Teilweise ausgeführt',
    'See all': 'Alle anzeigen',
    'Trending Markets': 'Trendmärkte',
    'Untitled campaign': 'Unbenannte Kampagne',
    'Vol': 'Vol.',
    'Yes': 'Ja',
    'You are not eligible to contribute': 'Du bist nicht berechtigt, einen Beitrag zu leisten',
  },
  settings: {
    'Activating secure online access': 'Sicheren Onlinezugang aktivieren',
    'Publishing secure discovery': 'Sichere Auffindbarkeit veröffentlichen',
    'Keeping you findable': 'Du bleibst auffindbar',
    'Starting a secure chat': 'Sicherer Chat wird gestartet',
    'Creating one-time contact card': 'Einmalige Kontaktkarte erstellen',
    'Computing VDF proof': 'VDF-Nachweis wird berechnet',
    'Solving a sequential proof that helps prevent automated account creation.':
      'Ein sequenzieller Nachweis wird gelöst, der automatisierte Kontoerstellung erschwert.',
    'Generating VDF proof': 'VDF-Nachweis wird erzeugt',
    'Preparing the compact proof the server can verify efficiently.':
      'Der kompakte Nachweis wird für eine effiziente Serverprüfung vorbereitet.',
    'Waiting for server verification': 'Warte auf Serverprüfung',
    'Retrying server verification': 'Serverprüfung wird erneut versucht',
    'Proof ready. The server enforces a minimum delay before it accepts it.':
      'Der Nachweis ist bereit. Der Server erzwingt eine Mindestwartezeit vor der Annahme.',
    'Verifying VDF proof': 'VDF-Nachweis wird geprüft',
    'Sending the proof for secure verification.':
      'Der Nachweis wird zur sicheren Prüfung gesendet.',
    'Secure online access is ready': 'Sicherer Onlinezugang ist bereit',
    'Your secure online access is active.': 'Dein sicherer Onlinezugang ist aktiv.',
    'VDF work was cancelled': 'Die VDF-Berechnung wurde abgebrochen',
    'No proof was submitted.': 'Es wurde kein Nachweis gesendet.',
    'Secure access needs attention': 'Sicherer Zugang erfordert Aufmerksamkeit',
    'This proof could not be completed. Check your connection and try again.':
      'Dieser Nachweis konnte nicht abgeschlossen werden. Prüfe deine Verbindung und versuche es erneut.',
    '{{percent}}% complete': '{{percent}} % abgeschlossen',
    'VDFs completed {{completed}}/{{total}}': 'VDFs abgeschlossen {{completed}}/{{total}}',
    '{{rate}} VDF iterations/s': '{{rate}} VDF-Iterationen/s',
    'Measuring VDF rate…': 'VDF-Geschwindigkeit wird gemessen…',
    '~{{count}}s remaining': '~{{count}} s verbleibend',
    'Cancel secure work': 'Sichere Berechnung abbrechen',
    'Could not start this chat': 'Chat konnte nicht gestartet werden',
    'Could not update discovery': 'Entdeckung konnte nicht aktualisiert werden',
    'Could not create contact card': 'Kontaktkarte konnte nicht erstellt werden',
    'Dismiss': 'Ausblenden',
    'Keep Spectra open while the security proof is verified.':
      'Lass Spectra geöffnet, während der Sicherheitsnachweis geprüft wird.',
    '{{count}}s elapsed': '{{count}} s vergangen',
    '{{count}}s elapsed - this may take 30-240 seconds with bridges':
      '{{count}} s vergangen – mit Bridges kann dies 30–240 Sekunden dauern',
    'A verified backend session is required before deleting this account.':
      'Vor dem Löschen dieses Kontos ist eine verifizierte Backend-Sitzung erforderlich.',
    'A verified Backend session is required for Spectre activation':
      'Für die Spectre-Aktivierung ist eine verifizierte Backend-Sitzung erforderlich',
    'Account deleted': 'Konto gelöscht',
    'Account Deletion': 'Kontolöschung',
    'Account deletion completed': 'Kontolöschung abgeschlossen',
    'Account Deletion Failed': 'Kontolöschung fehlgeschlagen',
    'Account deletion failed. Try again after checking your connection.':
      'Kontolöschung fehlgeschlagen. Prüfe deine Verbindung und versuche es erneut.',
    'Account deletion needs attention': 'Kontolöschung erfordert Aufmerksamkeit',
    'Applying Spectre protections': 'Spectre-Schutzmaßnahmen werden angewendet',
    'Backend cleanup could not be checked. Retry when the private connection is available.':
      'Die Backend-Bereinigung konnte nicht geprüft werden. Versuche es erneut, wenn die private Verbindung verfügbar ist.',
    'Backend cleanup is paused and will be retried safely. Try checking again.':
      'Die Backend-Bereinigung ist angehalten und wird sicher erneut versucht. Versuche, den Status erneut zu prüfen.',
    'Backend cleanup is still running. You can retry this status check safely.':
      'Die Backend-Bereinigung läuft noch. Du kannst diese Statusprüfung sicher erneut versuchen.',
    'Backend deletion completed, but final device cleanup needs to be retried.':
      'Die Backend-Löschung ist abgeschlossen, aber die abschließende Bereinigung des Geräts muss erneut versucht werden.',
    'Backend deletion completed, but local key erasure could not be confirmed.':
      'Die Backend-Löschung ist abgeschlossen, aber das Löschen lokaler Schlüssel konnte nicht bestätigt werden.',
    'Backend is not configured for Spectre activation':
      'Das Backend ist nicht für die Spectre-Aktivierung konfiguriert',
    'Changes were rolled back': 'Änderungen wurden zurückgesetzt',
    'Checking private access': 'Privater Zugriff wird geprüft',
    'Choose a new 6-digit PIN': 'Neue 6-stellige PIN wählen',
    'Cleanup could not be confirmed. You can retry safely.':
      'Die Bereinigung konnte nicht bestätigt werden. Du kannst es sicher erneut versuchen.',
    'Cloud Session Required': 'Cloud-Sitzung erforderlich',
    'Confirm Account Deletion': 'Kontolöschung bestätigen',
    'Confirm New PIN': 'Neue PIN bestätigen',
    'Connecting your private route': 'Die Verbindung mit deiner privaten Route wird hergestellt',
    'Contact Archive': 'Kontaktarchiv',
    'Deleting Account': 'Konto wird gelöscht',
    'Deleting account records': 'Kontodaten werden gelöscht',
    'Deleting chat relay data': 'Chat-Relay-Daten werden gelöscht',
    'Deleting encrypted objects': 'Verschlüsselte Objekte werden gelöscht',
    'Deletion needs attention': 'Löschung erfordert Aufmerksamkeit',
    'Disabled by Spectre Mode': 'Durch den Spectre-Modus deaktiviert',
    'Encrypted contact archive': 'Verschlüsseltes Kontaktarchiv',
    'Enter Current PIN': 'Aktuelle PIN eingeben',
    'Enter New PIN': 'Neue PIN eingeben',
    'Enter your current PIN': 'Gib deine aktuelle PIN ein',
    'Enter your current PIN before creating a duress PIN':
      'Gib deine aktuelle PIN ein, bevor du eine Zwangs-PIN erstellst',
    'Enter your PIN to continue to the final destructive confirmation.':
      'Gib deine PIN ein, um mit der endgültigen Bestätigung der Kontolöschung fortzufahren.',
    'Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.':
      'Die Eingabe der Zwangs-PIN versucht, Backend-Kontodaten und die Daten auf diesem Gerät zu löschen und dich sofort abzumelden.',
    'Erase Account Permanently?': 'Konto dauerhaft löschen?',
    'Erase Everything': 'Alles löschen',
    'Erasing local keys and data': 'Lokale Schlüssel und Daten werden gelöscht',
    'EXO can continue refreshing chats in the background once Spectre is ready.':
      'EXO kann Chats im Hintergrund weiter aktualisieren, sobald Spectre bereit ist.',
    'EXO has finished switching back from Spectre Mode.':
      'EXO hat den Wechsel vom Spectre-Modus zurück abgeschlossen.',
    'EXO is validating your Spectre account and required protections before the private handoff starts.':
      'EXO prüft dein Spectre-Konto und die erforderlichen Schutzmaßnahmen, bevor der private Übergang beginnt.',
    'EXO is verifying the wallet session it uses for private network services.':
      'EXO prüft die Wallet-Sitzung, die es für private Netzwerkdienste verwendet.',
    'EXO stopped the Spectre flow and restored the previous safe state where it could.':
      'EXO hat den Spectre-Ablauf beendet und den vorherigen sicheren Zustand so weit wie möglich wiederhergestellt.',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Exportiere eine verschlüsselte Datei, die du kontrollierst, und importiere sie später, um gespeicherte Kontakte zu erhalten.',
    'Export and import encrypted contacts': 'Verschlüsselte Kontakte exportieren und importieren',
    'Failed to change PIN': 'PIN konnte nicht geändert werden',
    'Failed to disable an expired Spectre session':
      'Abgelaufene Spectre-Sitzung konnte nicht deaktiviert werden',
    'Failed to disable Spectre Mode': 'Spectre-Modus konnte nicht deaktiviert werden',
    'Failed to refresh Spectre access': 'Spectre-Zugang konnte nicht aktualisiert werden',
    'Failed to verify PIN': 'PIN konnte nicht verifiziert werden',
    'Finalizing secure cleanup': 'Sichere Bereinigung wird abgeschlossen',
    'Finalizing Spectre shutdown': 'Spectre wird endgültig beendet',
    'Finishing the private handoff': 'Privater Übergang wird abgeschlossen',
    'Getting Spectre ready': 'Spectre wird vorbereitet',
    'Keep Spectra open while each verified cleanup stage completes.':
      'Lass Spectra geöffnet, während jede verifizierte Bereinigungsphase abgeschlossen wird.',
    'Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.':
      'Lass diesen Bildschirm geöffnet, während EXO die für den Spectre-Modus erforderlichen Datenschutzänderungen anwendet.',
    'Keep this screen open while EXO prepares the secure activation handoff.':
      'Lass diesen Bildschirm geöffnet, während EXO den sicheren Aktivierungsübergang vorbereitet.',
    'Keep this screen open while EXO restores your regular wallet and security settings.':
      'Lass diesen Bildschirm geöffnet, während EXO deine reguläre Wallet und Sicherheitseinstellungen wiederherstellt.',
    'Loading your Spectre setup': 'Deine Spectre-Einrichtung wird geladen',
    'Local data and the accepted backend cleanup have finished.':
      'Die lokalen Daten wurden gelöscht und die vom Backend bestätigte Bereinigung ist abgeschlossen.',
    'Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.':
      'Lokale Daten wurden gelöscht, aber die Backend-Bereinigung konnte nicht bestätigt werden. Versuche es erneut, wenn die private Verbindung verfügbar ist.',
    'Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.':
      'Lokale Daten wurden gelöscht, aber das Backend hat die Löschanfrage nicht akzeptiert. Importiere das Konto erneut, um es noch einmal zu versuchen.',
    'New PIN must be different from current PIN': 'Die neue PIN muss sich von der aktuellen PIN unterscheiden',
    'One anonymous activation token can be requested every 24 hours.':
      'Ein anonymer Aktivierungstoken kann alle 24 Stunden angefordert werden.',
    'PINs do not match': 'PINs stimmen nicht überein',
    'Preparing secure deletion': 'Sichere Löschung wird vorbereitet',
    'Preparing Spectre Mode': 'Spectre-Modus wird vorbereitet',
    'Preparing your private workspace': 'Dein privater Arbeitsbereich wird vorbereitet',
    'Preparing your Spectre account': 'Dein Spectre-Konto wird vorbereitet',
    'Preparing your Spectre setup': 'Deine Spectre-Einrichtung wird vorbereitet',
    'Re-enter your new PIN to confirm': 'Gib deine neue PIN zur Bestätigung erneut ein',
    'Registering the private account': 'Privates Konto wird registriert',
    'Reserving private activation': 'Private Aktivierung wird reserviert',
    'Restoring network and cleanup': 'Netzwerk und Bereinigung werden wiederhergestellt',
    'Restoring privacy protections': 'Datenschutzmaßnahmen werden wiederhergestellt',
    'Restoring your main profile': 'Dein Hauptprofil wird wiederhergestellt',
    'Retry account deletion cleanup': 'Bereinigung der Kontolöschung erneut versuchen',
    'Retry cleanup': 'Bereinigung erneut versuchen',
    'Review the failed step below before trying again.':
      'Prüfe den fehlgeschlagenen Schritt unten, bevor du es erneut versuchst.',
    'Secure account deletion stopped unexpectedly. Try again when the private connection is available.':
      'Die sichere Kontolöschung wurde unerwartet beendet. Versuche es erneut, wenn die private Verbindung verfügbar ist.',
    'Secure deletion in progress': 'Sichere Löschung läuft',
    'Spectre cannot finish until Tor is connected. Try bridges or a different network.':
      'Spectre kann erst abgeschlossen werden, wenn Tor verbunden ist. Versuche Bridges oder ein anderes Netzwerk.',
    'Spectre chats and contacts are still refreshing in the background.':
      'Spectre-Chats und -Kontakte werden noch im Hintergrund aktualisiert.',
    'Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.':
      'Spectre deaktiviert Anrufe und Kryptoaktionen, entfernt Push-Token, erzwingt Tor, Zwangs-PIN, Löschen bei Fehlversuchen, Screenshot-Schutz und App-Umschalter-Datenschutz und setzt für neue Nachrichten kurze Timer zum Verschwinden als Standard.',
    'Spectre needs your attention': 'Spectre benötigt deine Aufmerksamkeit',
    'Spectre protections are active': 'Spectre-Schutzmaßnahmen sind aktiv',
    'Submitting the deletion request': 'Löschanfrage wird übermittelt',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Wechsle zu deinem Root-EXO-Konto, um transparente EXO-Konten zu erstellen oder zu importieren.',
    'Switching back to your main wallet': 'Wechsel zurück zu deiner Haupt-Wallet',
    'Switching to your Spectre identity': 'Wechsel zu deiner Spectre-Identität',
    'The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.':
      'Das Backend erkennt diesen Bereinigungstoken nicht mehr. Importiere das Konto erneut, um die Löschung zu verifizieren.',
    'The cleanup status token expired. Re-import the account to verify its status.':
      'Der Status-Token für die Bereinigung ist abgelaufen. Importiere das Konto erneut, um seinen Status zu prüfen.',
    'There is no pending backend cleanup to retry.':
      'Es gibt keine ausstehende Backend-Bereinigung, die erneut versucht werden kann.',
    'This cannot be undone. Backend data and local sensitive data will be erased for this account.':
      'Dies kann nicht rückgängig gemacht werden. Backend-Daten und lokale sensible Daten für dieses Konto werden gelöscht.',
    'This cannot be undone. Local sensitive data is erased before the backend deletion request starts.':
      'Dies kann nicht rückgängig gemacht werden. Lokale sensible Daten werden gelöscht, bevor die Backend-Löschanfrage beginnt.',
    'This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.':
      'Dies löscht zuerst lokale Schlüssel und Daten und übermittelt dann die Backend-Bereinigung über deinen aktuellen privaten Transport. Ein Fortschrittsbildschirm bleibt sichtbar, bis die Bereinigung bestätigt ist.',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'Dies entfernt dieses EXO-Konto von diesem Gerät und gibt einen transparenten EXO-Platz für diese Wiederherstellungsphrase frei. Vorhandene Nachrichten für dieses Konto werden lokal gelöscht. Dies kann nicht rückgängig gemacht werden.',
    'This screen updates automatically as each Spectre stage finishes.':
      'Dieser Bildschirm wird automatisch aktualisiert, wenn jede Spectre-Phase abgeschlossen ist.',
    'This screen updates only when a cleanup stage is confirmed.':
      'Dieser Bildschirm wird nur aktualisiert, wenn eine Bereinigungsphase bestätigt ist.',
    'Tor could not connect': 'Tor konnte keine Verbindung herstellen',
    'Tor must be online before Spectre can switch identities and continue.':
      'Tor muss online sein, bevor Spectre Identitäten wechseln und fortfahren kann.',
    'Tor routing applies only inside Spectra. Device-wide network routing is unchanged.':
      'Tor-Routing gilt nur innerhalb von Spectra. Das netzwerkweite Routing des Geräts bleibt unverändert.',
    'Unable to complete Spectre activation': 'Spectre-Aktivierung kann nicht abgeschlossen werden',
    'Unlock or reconnect to the backend before deleting the account.':
      'Entsperre das Konto oder verbinde dich erneut mit dem Backend, bevor du es löschst.',
    'Verify Primary PIN': 'Primäre PIN verifizieren',
    'Verify your identity to change PIN': 'Verifiziere deine Identität, um die PIN zu ändern',
    'Verifying private access': 'Privater Zugriff wird verifiziert',
    'Your main wallet is restored': 'Deine Haupt-Wallet ist wiederhergestellt',
    'Your PIN has been changed successfully.': 'Deine PIN wurde erfolgreich geändert.',
    'Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.':
      'Deine Spectre-Wallet und dein Tor-Tunnel sind bereit. Chats und Kontakte können die Aktualisierung im Hintergrund abschließen.',
    'Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.':
      'Deine Spectre-Wallet ist aktiv. EXO wechselt den Speicherbereich und lädt lokale Daten für dieses private Profil.',
  },
  profile: {
    'Show VDF progress': 'VDF-Fortschritt anzeigen',
    'Proofs still run in the background when this is off.':
      'Nachweise laufen im Hintergrund weiter, wenn dies ausgeschaltet ist.',
    'Account Label': 'Kontobezeichnung',
    'Change Photo': 'Foto ändern',
    'Chat bundle not on server — others cannot find you':
      'Chat-Bundle nicht auf dem Server – andere können dich nicht finden',
    'Chat bundle registered on server': 'Chat-Bundle auf dem Server registriert',
    'Chat identity not available. Please restart the app.':
      'Chat-Identität nicht verfügbar. Bitte starte die App neu.',
    'Checking chat bundle...': 'Chat-Bundle wird geprüft...',
    'Checking identity link...': 'Identitätsverknüpfung wird geprüft...',
    'Could not link identity. Please try again.':
      'Identität konnte nicht verknüpft werden. Bitte versuche es erneut.',
    'Could not refresh session. Check your connection.':
      'Sitzung konnte nicht aktualisiert werden. Prüfe deine Verbindung.',
    'Edit Profile': 'Profil bearbeiten',
    'Identity linked to server': 'Identität mit Server verknüpft',
    'Identity not linked — messaging is disabled':
      'Identität nicht verknüpft – Nachrichten sind deaktiviert',
    'Member since {{date}}': 'Mitglied seit {{date}}',
    'Name this account': 'Dieses Konto benennen',
    'Optional public name for chats': 'Optionaler öffentlicher Name für Chats',
    'Photo disabled in Spectre Mode': 'Foto im Spectre-Modus deaktiviert',
    'Preparing secure contact invitation…': 'Sichere Kontakteinladung wird vorbereitet…',
    'Preparing secure contact card…': 'Sichere Kontaktkarte wird vorbereitet…',
    'Preparing secure share…': 'Sicheres Teilen wird vorbereitet…',
    'Create a one-time card to show your QR code.':
      'Erstelle eine Einmalkarte, um deinen QR-Code anzuzeigen.',
    'Create one-time contact card': 'Einmalige Kontaktkarte erstellen',
    'Publish for 5 minutes': 'Für 5 Minuten veröffentlichen',
    'Your account is discoverable for 5 minutes.':
      'Dein Konto ist 5 Minuten lang auffindbar.',
    'Your account is already discoverable.': 'Dein Konto ist bereits auffindbar.',
    'Your one-time contact card is still active.':
      'Deine einmalige Kontaktkarte ist noch aktiv.',
    'Open one-time contact card': 'Einmalige Kontaktkarte öffnen',
    'One-time contact card ready': 'Einmalige Kontaktkarte bereit',
    'Expires in {{minutes}} min': 'Läuft in {{minutes}} Min. ab',
    'One-time contact card': 'Einmalige Kontaktkarte',
    'Share this QR code before it expires.':
      'Teile diesen QR-Code, bevor er abläuft.',
    'A one-time contact card expires after one hour and can be used once.':
      'Eine einmalige Kontaktkarte läuft nach einer Stunde ab und kann nur einmal verwendet werden.',
    'Chat identity is not ready yet.': 'Die Chat-Identität ist noch nicht bereit.',
    'Profile photos cannot be changed while Spectre Mode is active.':
      'Profilfotos können nicht geändert werden, während der Spectre-Modus aktiv ist.',
    'Public Name': 'Öffentlicher Name',
    'Public name contains invalid text.': 'Der öffentliche Name enthält ungültigen Text.',
    'Public name contains unsupported characters': 'Der öffentliche Name enthält nicht unterstützte Zeichen',
    'Public name contains unsupported control characters.':
      'Der öffentliche Name enthält nicht unterstützte Steuerzeichen.',
    'Public name contains unsupported direction controls.':
      'Der öffentliche Name enthält nicht unterstützte Richtungssteuerzeichen.',
    'Public name is too large': 'Der öffentliche Name ist zu lang',
    'Public name is too large when encoded.':
      'Der öffentliche Name ist in codierter Form zu lang.',
    'Public name must be {{max}} characters or fewer':
      'Der öffentliche Name darf höchstens {{max}} Zeichen haben',
    'Public name must be 80 characters or fewer.':
      'Der öffentliche Name darf höchstens 80 Zeichen haben.',
    'Public profile metadata is read-only while Spectre Mode is active.':
      'Öffentliche Profilmetadaten sind im Spectre-Modus schreibgeschützt.',
    'Public profile names cannot be edited while Spectre Mode is active.':
      'Öffentliche Profilnamen können im Spectre-Modus nicht bearbeitet werden.',
    'Publication needs attention. Retry when you are online.':
      'Veröffentlichung erfordert Aufmerksamkeit. Versuche es erneut, wenn du online bist.',
    'Published': 'Veröffentlicht',
    'Publishing public name...': 'Öffentlicher Name wird veröffentlicht...',
    'Retry Publication': 'Veröffentlichung erneut versuchen',
    'Save Public Name': 'Öffentlichen Namen speichern',
    'Security Status': 'Sicherheitsstatus',
    'Server session active': 'Serversitzung aktiv',
    'Server session expired — features may not work':
      'Serversitzung abgelaufen – Funktionen funktionieren möglicherweise nicht',
    'This is a local label to help you identify this account. It is not your public chat name.':
      'Dies ist eine lokale Bezeichnung, die dir hilft, dieses Konto zu erkennen. Sie ist nicht dein öffentlicher Chatname.',
    'This name is visible to your contacts': 'Dieser Name ist für deine Kontakte sichtbar',
    'This public name is saved on this device and will publish when your chat identity is linked.':
      'Dieser öffentliche Name wird auf diesem Gerät gespeichert und veröffentlicht, sobald deine Chat-Identität verknüpft ist.',
    'This repeatable name is public chat-directory metadata. People who have not saved you under another name can see it in chats and contacts. It appears in notifications only when both sides enable that privacy trade-off.':
      'Dieser wiederverwendbare Name ist öffentliches Metadatum im Chatverzeichnis. Personen, die dich nicht unter einem anderen Namen gespeichert haben, können ihn in Chats und Kontakten sehen. Er erscheint nur dann in Benachrichtigungen, wenn beide Seiten diese Datenschutzabwägung aktivieren.',
    'Unable to use this public name': 'Dieser öffentliche Name kann nicht verwendet werden',
    'Unknown error': 'Unbekannter Fehler',
    'Waiting for chat readiness. Automatic retries are scheduled.':
      'Warte auf die Bereitschaft des Chats. Automatische Wiederholungen sind geplant.',
  },
  tor: {
    'Connected to Spectre': 'Mit Spectre verbunden',
  },
} satisfies LocaleTranslationOverrides

export default translations

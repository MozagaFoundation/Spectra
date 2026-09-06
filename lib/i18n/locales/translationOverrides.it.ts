/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LocaleTranslationOverrides } from './translationOverrideTypes'

const translations = {
  common: {
    'Creating your post-quantum identity...': 'Creazione della tua identità post-quantistica...',
    'Encrypted group sender keys': 'Chiavi mittente di gruppo crittografate',
    'End-to-end encrypted': 'Crittografato end-to-end',
    'End-to-end encryption available for supported chats':
      'La crittografia end-to-end è disponibile per le chat supportate',
    'Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.':
      'Le chiavi di gruppo vengono distribuite tramite le tue sessioni dirette crittografate esistenti. La rimozione di un membro ruota automaticamente la chiave di gruppo attiva.',
    'Hybrid post-quantum messaging': 'Messaggistica ibrida post-quantistica',
    'ML-DSA-65 post-quantum signatures': 'Firme post-quantistiche ML-DSA-65',
    'Post-quantum': 'Post-quantistico',
    'Post-quantum identity keys ready': 'Chiavi di identità post-quantistiche pronte',
    'Securing your encrypted vault...': 'Protezione del tuo archivio crittografato...',
    'Supported direct messages are end-to-end encrypted.':
      'I messaggi diretti supportati sono crittografati end-to-end.',
    ' +{{count}} more': ' +{{count}} in più',
    '+ gas in': '+ gas in',
    'Add ETH before sending this token.': 'Aggiungi ETH prima di inviare questo token.',
    'Add text': 'Aggiungi testo',
    'Add user': 'Aggiungi utente',
    'Add {{count}}': 'Aggiungi {{count}}',
    'Allowed': 'Consentito',
    'Apply crop': 'Applica ritaglio',
    'Applying bridge configuration…': 'Applicazione della configurazione dei bridge…',
    'Applying direct Tor…': 'Attivazione del Tor diretto…',
    'Available': 'Disponibile',
    'BIP39 word suggestions': 'Suggerimenti di parole BIP39',
    'Back': 'Indietro',
    'Block': 'Blocca',
    'Block {{displayName}}? You will no longer receive messages from them.':
      'Bloccare {{displayName}}? Non riceverai più messaggi da questa persona.',
    'Blockchain': 'Blockchain',
    'Bridge Update Failed': 'Aggiornamento dei bridge non riuscito',
    'Buy': 'Acquista',
    'Calculated by network': 'Calcolato dalla rete',
    'Calls are only supported in direct chats.': 'Le chiamate sono supportate solo nelle chat dirette.',
    'Calls unavailable': 'Chiamate non disponibili',
    'Cancel Spectre Mode': 'Annulla la modalità Spectre',
    'Canceling Spectre Mode...': 'Annullamento della modalità Spectre...',
    'Chat unavailable': 'Chat non disponibile',
    'Chats': 'Chat',
    'Choose how long messages remain visible after they are read.':
      'Scegli per quanto tempo i messaggi restano visibili dopo essere stati letti.',
    'Claim Refund': 'Richiedi rimborso',
    'Clear chat': 'Cancella chat',
    'Close media preview': 'Chiudi anteprima multimediale',
    'Close poll failed': 'Chiusura del sondaggio non riuscita',
    'Color': 'Colore',
    'Confirm & Send': 'Conferma e invia',
    'Confirm Payment': 'Conferma pagamento',
    'Confirm Transaction': 'Conferma transazione',
    'Connecting encrypted chat...': 'Connessione alla chat crittografata...',
    'Connecting...': 'Connessione...',
    'Connection failed': 'Connessione non riuscita',
    'Copy TX': 'Copia TX',
    'Could not add members': 'Impossibile aggiungere membri',
    'Could not import shared content': 'Impossibile importare il contenuto condiviso',
    'Could not open this chat': 'Impossibile aprire questa chat',
    'Could not open this chat.': 'Impossibile aprire questa chat.',
    'Could not save the edited image. Please try again.':
      'Impossibile salvare l\'immagine modificata. Riprova.',
    'Could not save your public name. Please try again.':
      'Impossibile salvare il tuo nome pubblico. Riprova.',
    'Could not update notifications': 'Impossibile aggiornare le notifiche',
    'Could not update this image. Please try again.':
      'Impossibile aggiornare questa immagine. Riprova.',
    'Created': 'Creato',
    'Creator': 'Creatore',
    'Crop': 'Ritaglia',
    'Diffusion channels require Spectre access.':
      'I canali di diffusione richiedono l\'accesso Spectre.',
    'Disappearing messages': 'Messaggi a scomparsa',
    'Drag text on the image to reposition it.':
      'Trascina il testo sull\'immagine per riposizionarlo.',
    'Drag the crop frame or its corners, then apply.':
      'Trascina il riquadro di ritaglio o i suoi angoli, quindi applica.',
    'Draw': 'Disegna',
    'ERC-20 Tokens': 'Token ERC-20',
    'ERC-20 on Ethereum Mainnet': 'ERC-20 sulla rete principale di Ethereum',
    'EXO Account': 'Account EXO',
    'EXO account creation is disabled while Spectre Mode is active.':
      'La creazione di account EXO è disattivata mentre la modalità Spectre è attiva.',
    'Edit': 'Modifica',
    'Edit and resend': 'Modifica e invia di nuovo',
    'Edit image': 'Modifica immagine',
    'Enter a valid EXO price greater than zero.':
      'Inserisci un prezzo EXO valido maggiore di zero.',
    'Enter a valid amount': 'Inserisci un importo valido',
    'Est. gas: {{amount}} {{symbol}}': 'Gas stimato: {{amount}} {{symbol}}',
    'Establishing secure call...': 'Connessione della chiamata sicura...',
    'Estimated fee': 'Commissione stimata',
    'Euro': 'Euro',
    'Failed to Load': 'Caricamento non riuscito',
    'Failed to claim refund': 'Impossibile richiedere il rimborso',
    'Failed to complete the paid join flow':
      'Impossibile completare la procedura di accesso a pagamento',
    'Failed to create poll': 'Impossibile creare il sondaggio',
    'Failed to create poll message': 'Impossibile creare il messaggio del sondaggio',
    'Failed to create request': 'Impossibile creare la richiesta',
    'Failed to load market': 'Impossibile caricare il mercato',
    'Failed to save membership access settings':
      'Impossibile salvare le impostazioni di accesso all\'iscrizione',
    'Failed to switch EXO account': 'Impossibile cambiare account EXO',
    'Failed to verify the payment confirmation.':
      'Impossibile verificare la conferma del pagamento.',
    'Fetched over the normal network while Tor was disabled.':
      'Recuperato tramite la rete normale mentre Tor era disattivato.',
    'Group members': 'Membri del gruppo',
    'Hidden': 'Nascosto',
    'Hide this contact\'s public name in your push notifications.':
      'Nascondi il nome pubblico di questo contatto nelle notifiche push.',
    'Hide {{displayName}} from your Contacts tab on this device? Chats and encryption keys will stay intact.':
      'Nascondere {{displayName}} dalla scheda Contatti su questo dispositivo? Le chat e le chiavi di crittografia resteranno intatte.',
    'Incorrect PIN': 'PIN errato',
    'Invalid amount': 'Importo non valido',
    'Invalid market ID': 'ID mercato non valido',
    'Invalid recipient address': 'Indirizzo del destinatario non valido',
    'Invalid {{network}} address': 'Indirizzo {{network}} non valido',
    'Load this image before editing it.': 'Carica questa immagine prima di modificarla.',
    'Loading pool data...': 'Caricamento dei dati del pool...',
    'Loading shared content...': 'Caricamento del contenuto condiviso...',
    'Loading voice note...': 'Caricamento della nota vocale...',
    'Max': 'Massimo',
    'Media': 'Media',
    'Media, links and docs': 'Media, link e documenti',
    'Message unavailable': 'Messaggio non disponibile',
    'Minimize call': 'Riduci chiamata',
    'Muted': 'Silenziato',
    'My {{network}} Address': 'Il mio indirizzo {{network}}',
    'Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}':
      'Né la configurazione richiesta né i bridge precedenti sono riusciti a connettersi. Tor resta attivo e il traffico verso il backend rimane bloccato. {{error}}',
    'Network': 'Rete',
    'Network Fee': 'Commissione di rete',
    'Network State': 'Stato della rete',
    'Network: Mozaga native EXO': 'Rete: EXO nativo di Mozaga',
    'Next': 'Avanti',
    'No Spectra chats are available for sharing yet.':
      'Non sono ancora disponibili chat Spectra per la condivisione.',
    'No address for this network': 'Nessun indirizzo per questa rete',
    'No documents shared yet': 'Nessun documento condiviso',
    'No links shared yet': 'Nessun link condiviso',
    'No tokens found': 'Nessun token trovato',
    'Notifications': 'Notifiche',
    'On': 'Attivo',
    'Opening...': 'Apertura...',
    'Paid access setup incomplete': 'Configurazione dell\'accesso a pagamento incompleta',
    'Paid by {{payerName}}': 'Pagato da {{payerName}}',
    'Paid in {{symbol}}': 'Pagato in {{symbol}}',
    'Paste recovery phrase': 'Incolla la frase di recupero',
    'Pay request': 'Paga la richiesta di pagamento',
    'Pay {{amount}}': 'Paga {{amount}}',
    'Payment': 'Pagamento',
    'Payment Pending': 'Pagamento in sospeso',
    'Payment Required': 'Pagamento richiesto',
    'Payment already submitted': 'Pagamento già inviato',
    'Payment failed': 'Pagamento non riuscito',
    'Payment message received': 'Messaggio di pagamento ricevuto',
    'Payment paid': 'Pagamento effettuato',
    'Payment recorded': 'Pagamento registrato',
    'Payment request: {{amount}} {{symbol}}': 'Richiesta di pagamento: {{amount}} {{symbol}}',
    'Payment submitted': 'Pagamento inviato',
    'Payment submitted: {{amount}} {{symbol}}': 'Pagamento inviato: {{amount}} {{symbol}}',
    'Platform fee: {{fee}}': 'Commissione della piattaforma: {{fee}}',
    'Please allow access to your photo library to change the group photo.':
      'Consenti l\'accesso alla libreria foto per modificare la foto del gruppo.',
    'Please retry the chat setup first.': 'Prima riprova a configurare la chat.',
    'Please wait until this chat is ready.': 'Attendi che questa chat sia pronta.',
    'Post request': 'Pubblica richiesta',
    'Preparing voice note...': 'Preparazione della nota vocale...',
    'Previous': 'Precedente',
    'Previous Bridges Restored': 'Bridge precedenti ripristinati',
    'Private handoff': 'Passaggio privato',
    'Public name in notifications': 'Nome pubblico nelle notifiche',
    'Receive Crypto': 'Ricevi criptovalute',
    'Receive address': 'Indirizzo di ricezione',
    'Recipient': 'Destinatario',
    'Recipient {{network}} Address': 'Indirizzo {{network}} del destinatario',
    'Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.':
      'I destinatari sono mostrati solo all\'interno di Spectra. iOS vede solo Spectra come destinazione dell\'app.',
    'Reconnecting...': 'Riconnessione...',
    'Recovering secure call...': 'Ripristino della chiamata sicura...',
    'Recovery word {{number}}': 'Parola di recupero {{number}}',
    'Request a payment in this chat': 'Richiedi un pagamento in questa chat',
    'Requested asset is not available in this wallet':
      'L\'asset richiesto non è disponibile in questo portafoglio',
    'Reset': 'Reimposta',
    'Retry failed': 'Nuovo tentativo non riuscito',
    'Review Send': 'Rivedi invio',
    'Rotate': 'Ruota',
    'SPL Tokens': 'Token SPL',
    'SPL tokens on Solana': 'Token SPL su Solana',
    'Search contacts...': 'Cerca contatti...',
    'Secure call waiting': 'Chiamata sicura in attesa',
    'Securing chat...': 'Protezione della chat...',
    'Preparing secure channel...': 'Protezione della chat...',
    'Select Blockchain': 'Seleziona blockchain',
    'Select drawing color': 'Seleziona il colore di disegno',
    'Sell': 'Vendi',
    'Send ETH': 'Invia ETH',
    'Send {{symbol}}': 'Invia {{symbol}}',
    'Send {{symbol}} to my {{network}} address:\n{{address}}':
      'Invia {{symbol}} al mio indirizzo {{network}}:\n{{address}}',
    'Sending as {{account}}': 'Invio come {{account}}',
    'Sending transaction...': 'Invio della transazione...',
    'Share contact': 'Condividi contatto',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      'Condividi questo codice QR o indirizzo per ricevere {{symbol}} su {{network}}. Invia a questo indirizzo solo asset di questa rete.',
    'Share to Spectra': 'Condividi con Spectra',
    'Share {{network}} Address': 'Condividi indirizzo {{network}}',
    'Shared content is missing. Please share it again.':
      'Il contenuto condiviso non è disponibile. Condividilo di nuovo.',
    'Show {{displayName}} in your Contacts tab again?':
      'Mostrare di nuovo {{displayName}} nella scheda Contatti?',
    'Signature': 'Firma',
    'Solana private key is not available': 'La chiave privata di Solana non è disponibile',
    'Solana wallet not available': 'Portafoglio Solana non disponibile',
    'Something went wrong. Please try again.': 'Qualcosa è andato storto. Riprova.',
    'Spectre access includes one diffusion channel.':
      'L\'accesso Spectre include un canale di diffusione.',
    'Stroke': 'Tratto',
    'TRC-20 Tokens': 'Token TRC-20',
    'TRC-20 on Tron': 'TRC-20 su Tron',
    'Tap to load voice note': 'Tocca per caricare la nota vocale',
    'Tap to review and pay': 'Tocca per rivedere e pagare',
    'Tap to view shared links and documents':
      'Tocca per visualizzare i link e i documenti condivisi',
    'Text': 'Testo',
    'Text or link': 'Testo o link',
    'The payment transaction failed on-chain.':
      'La transazione di pagamento non è riuscita on-chain.',
    'This fetch used the normal network while Tor was disabled.':
      'Questo recupero ha usato la rete normale mentre Tor era disattivato.',
    'This file is not available on this device yet.':
      'Questo file non è ancora disponibile su questo dispositivo.',
    'This image could not be edited right now.':
      'Questa immagine non può essere modificata in questo momento.',
    'This message was deleted': 'Questo messaggio è stato eliminato',
    'This request has already been marked as paid.':
      'Questa richiesta è già stata contrassegnata come pagata.',
    'This secure chat is not ready yet. Please try again in a moment.':
      'Questa chat sicura non è ancora pronta. Riprova tra poco.',
    'This voice note could not be loaded right now.':
      'Impossibile caricare questa nota vocale in questo momento.',
    'This wallet does not have an account for {{network}}.':
      'Questo portafoglio non dispone di un account per {{network}}.',
    'To': 'A',
    'Toggle media controls': 'Mostra o nascondi i controlli multimediali',
    'Tor Bridges': 'Bridge Tor',
    'Tor Connection Failed': 'Connessione Tor non riuscita',
    'Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}':
      'Tor non è riuscito a connettersi con la configurazione richiesta, quindi sono stati ripristinati i bridge precedentemente funzionanti. {{error}}',
    'Tor is disabled, so bridge requests will use the normal network.':
      'Tor è disattivato, quindi le richieste dei bridge useranno la rete normale.',
    'Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.':
      'Tor è attivato ma non connesso. Disattiva Tor prima di recuperare bridge di bootstrap tramite la rete normale.',
    'Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.':
      'Tor si sta ancora connettendo. Le richieste dei bridge restano bloccate finché non è disponibile un circuito Tor.',
    'Transaction failed on-chain': 'Transazione non riuscita on-chain',
    'Tron private key is not available': 'La chiave privata di Tron non è disponibile',
    'Tron wallet not available': 'Portafoglio Tron non disponibile',
    'Try Again': 'Riprova',
    'Unable to edit image': 'Impossibile modificare l\'immagine',
    'Unable to load voice note': 'Impossibile caricare la nota vocale',
    'Unable to open link': 'Impossibile aprire il link',
    'Unable to remove recipient': 'Impossibile rimuovere il destinatario',
    'Unable to retry': 'Impossibile riprovare',
    'Unable to send': 'Impossibile inviare',
    'Unblock': 'Sblocca',
    'Unblock {{displayName}}? They will be able to send you messages again.':
      'Sbloccare {{displayName}}? Questa persona potrà inviarti di nuovo messaggi.',
    'Undo': 'Annulla',
    'Unlock the wallet that will pay for this membership and try again.':
      'Sblocca il portafoglio che pagherà questa iscrizione e riprova.',
    'Unsupported attachment': 'Allegato non supportato',
    'Unsupported {{type}} attachment': 'Allegato {{type}} non supportato',
    'Upgrade to Spectre to create one diffusion channel.':
      'Passa a Spectre per creare un canale di diffusione.',
    'Use Biometric': 'Usa biometria',
    'Use original': 'Usa l\'originale',
    'Use the original offline backup you created during onboarding if you need the phrase again. If it is lost, create a newly backed up wallet and migrate to it. The device cannot reveal the old phrase.':
      'Usa il backup offline originale creato durante la configurazione iniziale se ti serve di nuovo la frase. Se è stato perso, crea un nuovo portafoglio con backup ed effettua la migrazione. Il dispositivo non può rivelare la vecchia frase.',
    'Use {{word}} for recovery word {{number}}':
      'Usa {{word}} come parola di recupero {{number}}',
    'V1 supports Mozaga native EXO only. The company fee is {{fee}}.':
      'V1 supporta solo EXO nativo di Mozaga. La commissione aziendale è {{fee}}.',
    'Voice note unavailable': 'Nota vocale non disponibile',
    'Volume': 'Volume',
    'Wallets': 'Portafogli',
    'You requested': 'Hai richiesto',
    'You\'ll enter the {{network}} address in the next step':
      'Inserirai l\'indirizzo {{network}} nel passaggio successivo',
    'Your payment was submitted but is still waiting for confirmation. Reopen this invite in a moment to finish joining.':
      'Il tuo pagamento è stato inviato ma è ancora in attesa di conferma. Riapri questo invito tra poco per completare l\'accesso.',
    'Your {{network}} Address': 'Il tuo indirizzo {{network}}',
    'via {{account}}': 'tramite {{account}}',
    '{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}':
      'Caricati {{bridgeCount}} bridge {{transport}}. {{routeMessage}}',
    '{{count}} attachment_one': '{{count}} allegato',
    '{{count}} attachment_other': '{{count}} allegati',
    '{{count}} groups in common': '{{count}} gruppi in comune',
    '{{count}} slots available': '{{count}} posti disponibili',
    '{{error}} This request used the normal network while Tor was disabled.':
      '{{error}} Questa richiesta ha usato la rete normale mentre Tor era disattivato.',
    '{{network}} Wallet': 'Portafoglio {{network}}',
    '{{network}} address': 'Indirizzo {{network}}',
    '{{senderName}} requested': '{{senderName}} ha richiesto',

    'Account Name (Optional)': 'Nome account (facoltativo)',
    'Account ready': 'Account pronto',
    'Archive Exported': 'Archivio esportato',
    'Archive Passphrase': 'Passphrase dell\'archivio',
    'Archive Passphrase Required': 'Passphrase dell\'archivio richiesta',
    'Archives unavailable': 'Archivi non disponibili',
    'At least 16 characters': 'Almeno 16 caratteri',
    'Chat bundle is still missing from the server.':
      'Il bundle della chat non è ancora presente sul server.',
    'Chat identity did not finish switching. Try reconnecting.':
      'Il cambio dell\'identità della chat non è stato completato. Prova a riconnetterti.',
    'Chat identity is not ready for this EXO account.':
      'L\'identità della chat non è pronta per questo account EXO.',
    'Close': 'Chiudi',
    'Confirm that you backed up the recovery phrase before using this EXO account.':
      'Conferma di aver eseguito il backup della frase di recupero prima di usare questo account EXO.',
    'Connecting securely...': 'Connessione sicura...',
    'Connection problem': 'Problema di connessione',
    'Contact Archive': 'Archivio contatti',
    'Contact archives are unavailable for Spectre accounts.':
      'Gli archivi dei contatti non sono disponibili per gli account Spectre.',
    'Contact archives are unavailable while Spectre Mode is active.':
      'Gli archivi dei contatti non sono disponibili mentre la modalità Spectre è attiva.',
    'Contacts: {{contacts}}': 'Contatti: {{contacts}}',
    'Could not link this chat identity to the server.':
      'Impossibile collegare questa identità della chat al server.',
    'Could not prepare this EXO account.': 'Impossibile preparare questo account EXO.',
    'Could not publish chat bundle.': 'Impossibile pubblicare il bundle della chat.',
    'Could not switch EXO account': 'Impossibile cambiare account EXO',
    'Could not switch back to the root EXO account.':
      'Impossibile tornare all\'account EXO principale.',
    'Could not verify the server session for this EXO account.':
      'Impossibile verificare la sessione del server per questo account EXO.',
    'Create EXO Account': 'Crea account EXO',
    'Create a new transparent EXO account for work, friends, or another chat identity.':
      'Crea un nuovo account EXO trasparente per lavoro, amici o un\'altra identità di chat.',
    'EXO Account {{number}}': 'Account EXO {{number}}',
    'Each recovery phrase restores up to 5 transparent EXO accounts.':
      'Ogni frase di recupero ripristina fino a 5 account EXO trasparenti.',
    'Encrypted contact archive': 'Archivio contatti crittografato',
    'Erasing...': 'Cancellazione...',
    'Export Failed': 'Esportazione non riuscita',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Esporta un file crittografato che controlli, quindi importalo in seguito per conservare i contatti salvati.',
    'Export file': 'Esporta file',
    'Failed to generate account': 'Impossibile generare l\'account',
    'Failed to import account': 'Impossibile importare l\'account',
    'Failed to save EXO account': 'Impossibile salvare l\'account EXO',
    'Generating secure keys...': 'Generazione delle chiavi sicure...',
    'I backed up this recovery phrase offline.':
      'Ho eseguito il backup offline di questa frase di recupero.',
    'I understand': 'Ho capito',
    'Import': 'Importa',
    'Import Complete': 'Importazione completata',
    'Import EXO Account': 'Importa account EXO',
    'Import Failed': 'Importazione non riuscita',
    'Import a transparent EXO recovery phrase into this unlocked root vault.':
      'Importa una frase di recupero EXO trasparente in questo vault principale sbloccato.',
    'Import and Use Account': 'Importa e usa account',
    'Import contact archive?': 'Importare l\'archivio dei contatti?',
    'Import file': 'Importa file',
    'Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.':
      'I contatti importati vengono uniti ai contatti già presenti su questo dispositivo. Chat, messaggi, sessioni, chiavi di gruppo e media non vengono mai importati.',
    'Importing...': 'Importazione...',
    'Invalid recovery phrase': 'Frase di recupero non valida',
    'Make sure no one is watching your screen':
      'Assicurati che nessuno stia guardando il tuo schermo',
    'Never share your recovery phrase': 'Non condividere mai la tua frase di recupero',
    'New EXO Account': 'Nuovo account EXO',
    'No active wallet is available.': 'Nessun portafoglio attivo disponibile.',
    'Only import a recovery phrase you control. Imported accounts can send and receive chats independently.':
      'Importa solo una frase di recupero che controlli. Gli account importati possono inviare e ricevere messaggi in modo indipendente.',
    'Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.':
      'Sono inclusi solo i contatti salvati e le relative etichette. I contatti esistenti vengono mantenuti e quelli ripristinati diventano disponibili subito dopo l\'importazione.',
    'Publishing chat bundle...': 'Pubblicazione del bundle della chat...',
    'Refresh': 'Aggiorna',
    'Regenerate': 'Rigenera',
    'Root account': 'Account principale',
    'Root account required': 'Account principale richiesto',
    'Save and Use Account': 'Salva e usa account',
    'Save encrypted contact archive': 'Salva archivio contatti crittografato',
    'Snowflake bootstrap privacy notice': 'Avviso sulla privacy del bootstrap Snowflake',
    'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.':
      'Snowflake usa un\'infrastruttura di bootstrap WebRTC, inclusi broker, STUN e servizi proxy volontari. Questi servizi possono osservare l\'indirizzo IP del dispositivo e la tempistica della connessione. Tor protegge il traffico dopo la creazione di un circuito, ma non può nascondere questa connessione di bootstrap.',
    'Switch to your root EXO account to create transparent EXO accounts.':
      'Passa al tuo account EXO principale per creare account EXO trasparenti.',
    'Switch to your root EXO account to import transparent EXO accounts.':
      'Passa al tuo account EXO principale per importare account EXO trasparenti.',
    'Switching EXO account...': 'Cambio dell\'account EXO...',
    'Switching...': 'Cambio in corso...',
    'Tap to reveal your recovery phrase': 'Tocca per mostrare la frase di recupero',
    'The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.':
      'L\'archivio viene crittografato su questo dispositivo prima della condivisione. Non viene mai caricato su Spectra. Conserva separatamente il file e la passphrase; Spectra non può recuperare nessuno dei due.',
    'This EXO account already exists on this device.':
      'Questo account EXO esiste già su questo dispositivo.',
    'This recovery phrase is shown only now. Store it offline before saving the new EXO account.':
      'Questa frase di recupero viene mostrata solo ora. Conservala offline prima di salvare il nuovo account EXO.',
    'Transparent EXO accounts are restored from your recovery phrase.':
      'Gli account EXO trasparenti vengono ripristinati dalla tua frase di recupero.',
    'Unable to switch EXO account': 'Impossibile cambiare account EXO',
    'Unlock your vault before managing a contact archive.':
      'Sblocca il tuo vault prima di gestire un archivio contatti.',
    'Use': 'Usa',
    'Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.':
      'Usa una passphrase univoca di almeno 16 caratteri, incluse lettere, numeri e simboli. Spectra non può recuperarla.',
    'Work, Friends, Personal...': 'Lavoro, amici, personale...',
    'You can import up to 5 transparent EXO accounts from one recovery phrase.':
      'Puoi importare fino a 5 account EXO trasparenti da una frase di recupero.',

    'Spectra logo': 'Logo Spectra',
    '{{width}} px': '{{width}} px',
    'External links unavailable': 'Link esterni non disponibili',
    'External links are unavailable while Spectre Mode is active.':
      'I link esterni non sono disponibili mentre la modalità Spectre è attiva.',
    'New encrypted message': 'Nuovo messaggio crittografato',
    'New message': 'Nuovo messaggio',
    'New group message': 'Nuovo messaggio di gruppo',
    'Default': 'Predefinito',
    'Messages': 'Messaggi',
    'Calls': 'Chiamate',
    'Transfers': 'Trasferimenti',
    'New message notifications': 'Notifiche per nuovi messaggi',
    'Secure call notifications': 'Notifiche per chiamate sicure',
    'Wallet transfer notifications': 'Notifiche per trasferimenti del portafoglio',
    'Secure call': 'Chiamata sicura',
    'A newer version of Spectra is available. Update to get the latest features and fixes.':
      'È disponibile una versione più recente di Spectra. Aggiorna per ottenere le funzionalità e le correzioni più recenti.',
    'This version of Spectra is no longer supported. Update to continue using secure services.':
      'Questa versione di Spectra non è più supportata. Aggiorna l’app per continuare a usare i servizi sicuri.',
    'Update available': 'Aggiornamento disponibile',
    'Update required': 'Aggiornamento richiesto',
    'Update Spectra': 'Aggiorna Spectra',
  },
  auth: {
    'Account import progress': 'Avanzamento dell\'importazione dell\'account',
    'Authenticate to upgrade biometric unlock':
      'Autenticati per aggiornare lo sblocco biometrico',
    'Choose a Public Name': 'Scegli un nome pubblico',
    'Deriving wallets...': 'Derivazione dei portafogli...',
    'Finishing previous account deletion...':
      'Completamento della precedente eliminazione dell\'account...',
    'Go back': 'Indietro',
    'Important': 'Importante',
    'Importing Account': 'Importazione dell\'account',
    'Optional public name for chats': 'Nome pubblico facoltativo per le chat',
    'Public Name': 'Nome pubblico',
    'Public name contains invalid text.': 'Il nome pubblico contiene testo non valido.',
    'Public name contains unsupported characters':
      'Il nome pubblico contiene caratteri non supportati.',
    'Public name contains unsupported control characters.':
      'Il nome pubblico contiene caratteri di controllo non supportati.',
    'Public name contains unsupported direction controls.':
      'Il nome pubblico contiene controlli di direzione non supportati.',
    'Public name is too large': 'Il nome pubblico è troppo lungo',
    'Public name is too large when encoded.':
      'Il nome pubblico è troppo lungo una volta codificato.',
    'Public name must be 80 characters or fewer.':
      'Il nome pubblico deve contenere al massimo 80 caratteri.',
    'Public name must be {{max}} characters or fewer':
      'Il nome pubblico deve contenere al massimo {{max}} caratteri.',
    'This optional name helps people recognize you in chats and contacts. You can change or remove it later.':
      'Questo nome facoltativo aiuta le persone a riconoscerti nelle chat e nei contatti. Puoi modificarlo o rimuoverlo in seguito.',
    'Unable to use this public name': 'Impossibile usare questo nome pubblico',
    'Unlock Spectra to connect your secure call':
      'Sblocca Spectra per connettere la chiamata sicura.',
    'Your public name is shared as chat-directory metadata. It is not included in your recovery phrase and does not affect account security.':
      'Il tuo nome pubblico viene condiviso come metadato della directory delle chat. Non è incluso nella frase di recupero e non influisce sulla sicurezza dell\'account.',
    '{{count}} characters maximum.': 'Massimo {{count}} caratteri.',

    'PIN input': 'Inserimento PIN',
    'Mnemonic must be 12 or 24 words': 'La frase mnemonica deve contenere 12 o 24 parole',
    'Invalid word: "{{word}}"': 'Parola non valida: "{{word}}"',
    'Invalid mnemonic checksum': 'Checksum della frase mnemonica non valido',
  },
  chat: {
    'Add attachment': 'Aggiungi allegato',
    'Add by invitation': 'Aggiungi tramite invito',
    'Cancel reply': 'Annulla risposta',
    'Choose a contact or use a secure invitation':
      'Scegli un contatto o usa un invito sicuro',
    'Edit image': 'Modifica immagine',
    'Load more': 'Carica altro',
    'No conversations yet': 'Ancora nessuna conversazione',
    'Paste a secure invitation or scan its QR code':
      'Incolla un invito sicuro o scansiona il suo codice QR',
    'Paste a secure invitation or scan its QR code to start.':
      'Incolla un invito sicuro o scansiona il suo codice QR per iniziare.',
    'Record voice note': 'Registra nota vocale',
    'Remove attachment': 'Rimuovi allegato',
    'Send message': 'Invia messaggio',
    'Toggle one-time message': 'Attiva/disattiva messaggio monouso',
    'Updated {{time}}': 'Aggiornato {{time}}',
    'You took a screenshot': 'Hai acquisito uno screenshot',
    '{{count}} messages': '{{count}} messaggi',
    '{{name}} took a screenshot': '{{name}} ha acquisito uno screenshot',

    'Add a contact and open a private chat':
      'Aggiungi un contatto e apri una chat privata',
    'Add by address': 'Aggiungi tramite indirizzo',
    'Add someone by address or scan their QR code to start.':
      'Aggiungi qualcuno tramite indirizzo o scansiona il suo codice QR per iniziare.',
    'Choose a contact or start with an address':
      'Scegli un contatto o inizia con un indirizzo',
    'No saved contacts yet': 'Ancora nessun contatto salvato',
    'Scan, add, and start a private chat':
      'Scansiona, aggiungi e avvia una chat privata',
    'Select from contacts': 'Seleziona dai contatti',
    'Start Chat': 'Avvia chat',
    'Start Secret Chat': 'Avvia chat segreta',
    'Starting chat...': 'Avvio della chat...',
    'Starting from {{account}}': 'Avvio da {{account}}',
    'Unable to start chat': 'Impossibile avviare la chat',

    'Nearby': 'Nelle vicinanze',
    'Cancel voice note': 'Annulla nota vocale',
    'Send voice note': 'Invia nota vocale',
    'Play voice note': 'Riproduci nota vocale',
    'Pause voice note': 'Metti in pausa la nota vocale',
    'Text overlay': 'Sovrapposizione di testo',
    'Crop frame': 'Riquadro di ritaglio',
    'Crop top-left handle': 'Maniglia di ritaglio in alto a sinistra',
    'Crop top-right handle': 'Maniglia di ritaglio in alto a destra',
    'Crop bottom-left handle': 'Maniglia di ritaglio in basso a sinistra',
    'Crop bottom-right handle': 'Maniglia di ritaglio in basso a destra',
    '#Tag': '#Tag',
    'Sending attachment': 'Invio dell\'allegato',
    'Preparing message': 'Preparazione del messaggio',
    'Sending message': 'Invio del messaggio',
    'Caching locally': 'Salvataggio locale nella cache',
    'Complete': 'Completato',
    'Encrypting and uploading {{completed}}/{{total}}':
      'Crittografia e caricamento {{completed}}/{{total}}',
    'Sending nearby': 'Invio nelle vicinanze',
    'Queued nearby': 'In coda nelle vicinanze',
    'Nearby delivery expired': 'Consegna nelle vicinanze scaduta',
    'Nearby retry limit reached': 'Limite di tentativi nelle vicinanze raggiunto',
    'Nearby queue full': 'Coda delle consegne nelle vicinanze piena',
    'Nearby delivery interrupted': 'Consegna nelle vicinanze interrotta',
    'Nearby receipt timed out': 'Tempo di attesa della conferma di consegna nelle vicinanze scaduto',
    'Nearby transmission failed': 'Trasmissione nelle vicinanze non riuscita',
    'Nearby delivery failed': 'Consegna nelle vicinanze non riuscita',
  },
  contacts: {
    'Add by secure contact invitation': 'Aggiungi tramite invito sicuro per contatti',
    'Invalid contact invitation': 'Invito per contatti non valido',
    'Invalid secure contact invitation': 'Invito sicuro per contatti non valido',
    'Paste a secure contact invitation or scan a contact QR code':
      'Incolla un invito sicuro per contatti o scansiona il codice QR di un contatto',
    'Paste a secure contact invitation or scan its QR code.':
      'Incolla un invito sicuro per contatti o scansiona il suo codice QR.',
    'Paste a valid secure contact invitation.':
      'Incolla un invito sicuro per contatti valido.',
    'Please wait until the EXO account switch finishes.':
      'Attendi il completamento del cambio dell\'account EXO.',
    'Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.':
      'Scansiona il codice QR di un contatto o incolla l\'invito sicuro per contatti condiviso dalla persona che vuoi aggiungere.',
    'Scan a secure Spectra contact QR code shared by the person you want to add.':
      'Scansiona un codice QR sicuro di un contatto Spectra condiviso dalla persona che vuoi aggiungere.',
    'Secure Contact Invitation': 'Invito sicuro per contatti',
    'Secure invitation ready': 'Invito sicuro pronto',

    'Adding to': 'Aggiunta a',
    'EXO Account': 'Account EXO',
    'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.':
      'Inserisci l\'indirizzo post-quantistico della persona che vuoi aggiungere. Deve aver condiviso il suo indirizzo con te.',
    'Selected': 'Selezionato',
    'Switching...': 'Cambio in corso...',
    'This contact will be saved under this EXO account on this device.':
      'Questo contatto verrà salvato sotto questo account EXO su questo dispositivo.',
    'via {{account}}': 'tramite {{account}}',
  },
  crypto: {
    '+ gas in': '+ gas in',
    'Ether': 'Ether',

    '~{{fee}} {{symbol}}': '~{{fee}} {{symbol}}',
    '{{symbol}} logo': 'Logo {{symbol}}',
    'USDT logo': 'Logo USDT',
  },
  markets: {
    '0 (unlimited)': '0 (illimitato)',
    'Amount exceeds remaining allowance': 'L\'importo supera l\'autorizzazione residua',
    'Cannot contribute': 'Impossibile contribuire',
    'Connect wallet to create a campaign':
      'Collega il portafoglio per creare una campagna',
    'Connect wallet to create an escrow order':
      'Collega il portafoglio per creare un ordine di escrow',
    'Connect wallet to view your campaigns':
      'Collega il portafoglio per visualizzare le tue campagne',
    'Connect wallet to view your escrow orders':
      'Collega il portafoglio per visualizzare i tuoi ordini di escrow',
    'Describe the condition for release...': 'Descrivi la condizione per il rilascio...',
    'Enter a valid market ID': 'Inserisci un ID mercato valido',
    'Enter a valid sale ID': 'Inserisci un ID vendita valido',
    'Fiat price must be greater than zero':
      'Il prezzo in valuta fiat deve essere maggiore di zero',
    'Filled': 'Eseguito',
    'Invalid campaign ID': 'ID campagna non valido',
    'Invalid order ID': 'ID ordine non valido',
    'Invalid sale ID': 'ID vendita non valido',
    'No escrow orders found': 'Nessun ordine di escrow trovato',
    'Partially Filled': 'Eseguito parzialmente',
    'Yes': 'Sì',
    'You are not eligible to contribute': 'Non sei idoneo a contribuire',

    'Hot Predictions': 'Previsioni in evidenza',
    'Live Campaigns': 'Campagne attive',
    'No description': 'Nessuna descrizione',
    'No order activity yet': 'Ancora nessuna attività sugli ordini',
    'See all': 'Vedi tutto',
    'Trending Markets': 'Mercati di tendenza',
    'Untitled campaign': 'Campagna senza titolo',
    'Vol': 'Vol.',
    'of': 'di',
    '{{count}} backers': '{{count}} sostenitori',
    '{{count}}d left': '{{count}} g rimanenti',
    '{{count}}h left': '{{count}} h rimanenti',
    '{{count}}m left': '{{count}} min rimanenti',
  },
  profile: {
    'Show VDF progress': 'Mostra avanzamento VDF',
    'Proofs still run in the background when this is off.':
      'Le prove continuano in background quando questa opzione è disattivata.',
    'Account Label': 'Etichetta account',
    'Change Photo': 'Cambia foto',
    'Chat bundle not on server — others cannot find you':
      'Il bundle della chat non è sul server — gli altri non possono trovarti',
    'Chat bundle registered on server': 'Bundle della chat registrato sul server',
    'Chat identity not available. Please restart the app.':
      'Identità della chat non disponibile. Riavvia l\'app.',
    'Checking chat bundle...': 'Verifica del bundle della chat...',
    'Checking identity link...': 'Verifica del collegamento dell\'identità...',
    'Could not link identity. Please try again.':
      'Impossibile collegare l\'identità. Riprova.',
    'Could not refresh session. Check your connection.':
      'Impossibile aggiornare la sessione. Controlla la connessione.',
    'Edit Profile': 'Modifica profilo',
    'Identity linked to server': 'Identità collegata al server',
    'Identity not linked — messaging is disabled':
      'Identità non collegata — la messaggistica è disattivata',
    'Member since {{date}}': 'Membro dal {{date}}',
    'Name this account': 'Assegna un nome a questo account',
    'Optional public name for chats': 'Nome pubblico facoltativo per le chat',
    'Photo disabled in Spectre Mode': 'Foto disattivata in modalità Spectre',
    'Preparing secure contact invitation…':
      'Preparazione dell\'invito sicuro per contatti…',
    'Preparing secure contact card…': 'Preparazione della scheda contatto sicura…',
    'Preparing secure share…': 'Preparazione della condivisione sicura…',
    'Create a one-time card to show your QR code.':
      'Crea una scheda monouso per mostrare il tuo codice QR.',
    'Create one-time contact card': 'Crea scheda contatto monouso',
    'Publish for 5 minutes': 'Pubblica per 5 minuti',
    'Your account is discoverable for 5 minutes.':
      'Il tuo account è individuabile per 5 minuti.',
    'Your account is already discoverable.': 'Il tuo account è già individuabile.',
    'Your one-time contact card is still active.':
      'La tua scheda contatto monouso è ancora attiva.',
    'Open one-time contact card': 'Apri scheda contatto monouso',
    'One-time contact card ready': 'Scheda contatto monouso pronta',
    'Expires in {{minutes}} min': 'Scade tra {{minutes}} min',
    'One-time contact card': 'Scheda contatto monouso',
    'Share this QR code before it expires.':
      'Condividi questo codice QR prima che scada.',
    'A one-time contact card expires after one hour and can be used once.':
      'Una scheda contatto monouso scade dopo un\'ora e può essere usata una sola volta.',
    'Chat identity is not ready yet.': 'L\'identità chat non è ancora pronta.',
    'Profile photos cannot be changed while Spectre Mode is active.':
      'Le foto del profilo non possono essere modificate mentre la modalità Spectre è attiva.',
    'Public Name': 'Nome pubblico',
    'Public name contains invalid text.': 'Il nome pubblico contiene testo non valido.',
    'Public name contains unsupported characters':
      'Il nome pubblico contiene caratteri non supportati.',
    'Public name contains unsupported control characters.':
      'Il nome pubblico contiene caratteri di controllo non supportati.',
    'Public name contains unsupported direction controls.':
      'Il nome pubblico contiene controlli di direzione non supportati.',
    'Public name is too large': 'Il nome pubblico è troppo lungo',
    'Public name is too large when encoded.':
      'Il nome pubblico è troppo lungo una volta codificato.',
    'Public name must be 80 characters or fewer.':
      'Il nome pubblico deve contenere al massimo 80 caratteri.',
    'Public name must be {{max}} characters or fewer':
      'Il nome pubblico deve contenere al massimo {{max}} caratteri.',
    'Public profile metadata is read-only while Spectre Mode is active.':
      'I metadati del profilo pubblico sono in sola lettura mentre la modalità Spectre è attiva.',
    'Public profile names cannot be edited while Spectre Mode is active.':
      'I nomi del profilo pubblico non possono essere modificati mentre la modalità Spectre è attiva.',
    'Publication needs attention. Retry when you are online.':
      'La pubblicazione richiede attenzione. Riprova quando sei online.',
    'Published': 'Pubblicato',
    'Publishing public name...': 'Pubblicazione del nome pubblico...',
    'Retry Publication': 'Riprova pubblicazione',
    'Save Public Name': 'Salva nome pubblico',
    'Security Status': 'Stato della sicurezza',
    'Server session active': 'Sessione del server attiva',
    'Server session expired — features may not work':
      'Sessione del server scaduta — alcune funzioni potrebbero non funzionare',
    'This is a local label to help you identify this account. It is not your public chat name.':
      'Questa è un\'etichetta locale che ti aiuta a identificare questo account. Non è il tuo nome pubblico per le chat.',
    'This name is visible to your contacts': 'Questo nome è visibile ai tuoi contatti',
    'This public name is saved on this device and will publish when your chat identity is linked.':
      'Questo nome pubblico è salvato su questo dispositivo e verrà pubblicato quando la tua identità della chat sarà collegata.',
    'This repeatable name is public chat-directory metadata. People who have not saved you under another name can see it in chats and contacts. It appears in notifications only when both sides enable that privacy trade-off.':
      'Questo nome riutilizzabile è un metadato pubblico della directory delle chat. Le persone che non ti hanno salvato con un altro nome possono vederlo nelle chat e nei contatti. Compare nelle notifiche solo quando entrambe le parti attivano questo compromesso sulla privacy.',
    'Unable to use this public name': 'Impossibile usare questo nome pubblico',
    'Unknown error': 'Errore sconosciuto',
    'Waiting for chat readiness. Automatic retries are scheduled.':
      'In attesa che la chat sia pronta. Sono previsti nuovi tentativi automatici.',
  },
  settings: {
    'Activating secure online access': 'Attivazione dell’accesso online sicuro',
    'Publishing secure discovery': 'Pubblicazione della scoperta sicura',
    'Keeping you findable': 'Restare trovabile',
    'Starting a secure chat': 'Avvio di una chat sicura',
    'Creating one-time contact card': 'Creazione di una scheda contatto monouso',
    'Computing VDF proof': 'Calcolo della prova VDF',
    'Solving a sequential proof that helps prevent automated account creation.':
      'Risoluzione di una prova sequenziale che aiuta a impedire la creazione automatizzata di account.',
    'Generating VDF proof': 'Generazione della prova VDF',
    'Preparing the compact proof the server can verify efficiently.':
      'Preparazione della prova compatta che il server può verificare in modo efficiente.',
    'Waiting for server verification': 'In attesa della verifica del server',
    'Retrying server verification': 'Nuovo tentativo di verifica del server',
    'Proof ready. The server enforces a minimum delay before it accepts it.':
      'La prova è pronta. Il server impone un ritardo minimo prima di accettarla.',
    'Verifying VDF proof': 'Verifica della prova VDF',
    'Sending the proof for secure verification.':
      'Invio della prova per una verifica sicura.',
    'Secure online access is ready': 'L’accesso online sicuro è pronto',
    'Your secure online access is active.': 'Il tuo accesso online sicuro è attivo.',
    'VDF work was cancelled': 'Il calcolo VDF è stato annullato',
    'No proof was submitted.': 'Non è stata inviata alcuna prova.',
    'Secure access needs attention': 'L’accesso sicuro richiede attenzione',
    'This proof could not be completed. Check your connection and try again.':
      'Non è stato possibile completare questa prova. Controlla la connessione e riprova.',
    '{{percent}}% complete': '{{percent}}% completato',
    'VDFs completed {{completed}}/{{total}}': 'VDF completate {{completed}}/{{total}}',
    '{{rate}} VDF iterations/s': '{{rate}} iterazioni VDF/s',
    'Measuring VDF rate…': 'Misurazione della velocità VDF…',
    '~{{count}}s remaining': '~{{count}} s rimanenti',
    'Cancel secure work': 'Annulla il calcolo sicuro',
    'Could not start this chat': 'Impossibile avviare questa chat',
    'Could not update discovery': 'Impossibile aggiornare l’individuazione',
    'Could not create contact card': 'Impossibile creare la carta di contatto',
    'Dismiss': 'Chiudi',
    'Keep Spectra open while the security proof is verified.':
      'Tieni Spectra aperto mentre viene verificata la prova di sicurezza.',
    'A verified backend session is required before deleting this account.':
      'Per eliminare questo account è richiesta una sessione backend verificata.',
    'Account Deletion': 'Eliminazione dell\'account',
    'Account Deletion Failed': 'Eliminazione dell\'account non riuscita',
    'Account deleted': 'Account eliminato',
    'Account deletion completed': 'Eliminazione dell\'account completata',
    'Account deletion failed. Try again after checking your connection.':
      'Eliminazione dell\'account non riuscita. Riprova dopo aver controllato la connessione.',
    'Account deletion needs attention': 'L\'eliminazione dell\'account richiede attenzione',
    'Applying Spectre protections': 'Applicazione delle protezioni Spectre',
    'Backend cleanup could not be checked. Retry when the private connection is available.':
      'Impossibile verificare la pulizia del backend. Riprova quando è disponibile la connessione privata.',
    'Backend cleanup is paused and will be retried safely. Try checking again.':
      'La pulizia del backend è in pausa e verrà ritentata in sicurezza. Prova a controllare di nuovo.',
    'Backend cleanup is still running. You can retry this status check safely.':
      'La pulizia del backend è ancora in corso. Puoi ripetere questa verifica dello stato in sicurezza.',
    'Backend deletion completed, but final device cleanup needs to be retried.':
      'L\'eliminazione del backend è stata completata, ma la pulizia finale del dispositivo deve essere ritentata.',
    'Backend deletion completed, but local key erasure could not be confirmed.':
      'L\'eliminazione del backend è stata completata, ma non è stato possibile confermare la cancellazione locale delle chiavi.',
    'Changes were rolled back': 'Le modifiche sono state annullate',
    'Checking private access': 'Verifica dell\'accesso privato',
    'Choose a new 6-digit PIN': 'Scegli un nuovo PIN di 6 cifre',
    'Cleanup could not be confirmed. You can retry safely.':
      'Non è stato possibile confermare la pulizia. Puoi riprovare in sicurezza.',
    'Cloud Session Required': 'Sessione cloud richiesta',
    'Confirm Account Deletion': 'Conferma eliminazione dell\'account',
    'Confirm New PIN': 'Conferma nuovo PIN',
    'Connecting your private route': 'Connessione al tuo percorso privato',
    'Deleting Account': 'Eliminazione dell\'account',
    'Deleting account records': 'Eliminazione dei record dell\'account',
    'Deleting chat relay data': 'Eliminazione dei dati di inoltro della chat',
    'Deleting encrypted objects': 'Eliminazione degli oggetti crittografati',
    'Deletion needs attention': 'L\'eliminazione richiede attenzione',
    'EXO can continue refreshing chats in the background once Spectre is ready.':
      'EXO può continuare ad aggiornare le chat in background quando Spectre è pronto.',
    'EXO has finished switching back from Spectre Mode.':
      'EXO ha completato il ritorno dalla modalità Spectre.',
    'EXO is validating your Spectre account and required protections before the private handoff starts.':
      'EXO sta convalidando il tuo account Spectre e le protezioni richieste prima dell\'inizio del passaggio privato.',
    'EXO is verifying the wallet session it uses for private network services.':
      'EXO sta verificando la sessione del portafoglio usata per i servizi di rete privata.',
    'EXO stopped the Spectre flow and restored the previous safe state where it could.':
      'EXO ha interrotto la procedura Spectre e ha ripristinato lo stato sicuro precedente dove possibile.',
    'Enter Current PIN': 'Inserisci il PIN attuale',
    'Enter New PIN': 'Inserisci il nuovo PIN',
    'Enter your PIN to continue to the final destructive confirmation.':
      'Inserisci il PIN per procedere alla conferma distruttiva finale.',
    'Enter your current PIN': 'Inserisci il PIN attuale',
    'Enter your current PIN before creating a duress PIN':
      'Inserisci il PIN attuale prima di creare un PIN di coercizione',
    'Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.':
      'L\'inserimento del PIN di coercizione tenterà di eliminare i dati dell\'account sul backend, cancellare questo dispositivo e disconnetterti immediatamente.',
    'Erase Account Permanently?': 'Eliminare definitivamente l\'account?',
    'Erase Everything': 'Cancella tutto',
    'Erasing local keys and data': 'Cancellazione delle chiavi e dei dati locali',
    'Failed to change PIN': 'Impossibile modificare il PIN',
    'Failed to disable Spectre Mode': 'Impossibile disattivare la modalità Spectre',
    'Failed to verify PIN': 'Impossibile verificare il PIN',
    'Finalizing Spectre shutdown': 'Completamento della disattivazione di Spectre',
    'Finalizing secure cleanup': 'Completamento della pulizia sicura',
    'Finishing the private handoff': 'Completamento del passaggio privato',
    'Getting Spectre ready': 'Preparazione di Spectre',
    'Keep Spectra open while each verified cleanup stage completes.':
      'Tieni Spectra aperto mentre si completa ogni fase verificata della pulizia.',
    'Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.':
      'Tieni aperta questa schermata mentre EXO applica le modifiche alla privacy necessarie per la modalità Spectre.',
    'Keep this screen open while EXO prepares the secure activation handoff.':
      'Tieni aperta questa schermata mentre EXO prepara il passaggio sicuro per l\'attivazione.',
    'Keep this screen open while EXO restores your regular wallet and security settings.':
      'Tieni aperta questa schermata mentre EXO ripristina il portafoglio normale e le impostazioni di sicurezza.',
    'Loading your Spectre setup': 'Caricamento della configurazione Spectre',
    'Local data and the accepted backend cleanup have finished.':
      'I dati locali e la pulizia del backend accettata sono stati completati.',
    'Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.':
      'I dati locali sono stati cancellati, ma non è stato possibile confermare la pulizia del backend. Riprova quando è disponibile la connessione privata.',
    'Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.':
      'I dati locali sono stati cancellati, ma il backend non ha accettato la richiesta di eliminazione. Reimporta l\'account per riprovare.',
    'New PIN must be different from current PIN':
      'Il nuovo PIN deve essere diverso dal PIN attuale',
    'PINs do not match': 'I PIN non corrispondono',
    'Preparing Spectre Mode': 'Preparazione della modalità Spectre',
    'Preparing secure deletion': 'Preparazione dell\'eliminazione sicura',
    'Preparing your Spectre account': 'Preparazione del tuo account Spectre',
    'Preparing your Spectre setup': 'Preparazione della configurazione Spectre',
    'Preparing your private workspace': 'Preparazione del tuo spazio di lavoro privato',
    'Re-enter your new PIN to confirm': 'Inserisci di nuovo il nuovo PIN per confermare',
    'Registering the private account': 'Registrazione dell\'account privato',
    'Reserving private activation': 'Prenotazione dell\'attivazione privata',
    'Restoring network and cleanup': 'Ripristino della rete e pulizia',
    'Restoring privacy protections': 'Ripristino delle protezioni della privacy',
    'Restoring your main profile': 'Ripristino del tuo profilo principale',
    'Retry account deletion cleanup': 'Riprova la pulizia dell\'eliminazione dell\'account',
    'Retry cleanup': 'Riprova la pulizia',
    'Review the failed step below before trying again.':
      'Esamina il passaggio non riuscito qui sotto prima di riprovare.',
    'Secure account deletion stopped unexpectedly. Try again when the private connection is available.':
      'L\'eliminazione sicura dell\'account si è interrotta in modo imprevisto. Riprova quando è disponibile la connessione privata.',
    'Secure deletion in progress': 'Eliminazione sicura in corso',
    'Spectre cannot finish until Tor is connected. Try bridges or a different network.':
      'Spectre non può completarsi finché Tor non è connesso. Prova i bridge o una rete diversa.',
    'Spectre chats and contacts are still refreshing in the background.':
      'Le chat e i contatti Spectre si stanno ancora aggiornando in background.',
    'Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.':
      'Spectre disattiva le chiamate e le azioni sulle criptovalute; rimuove i token push; impone Tor, PIN di coercizione, cancellazione in caso di errore, protezione dagli screenshot e privacy del selettore delle app; e imposta per impostazione predefinita timer brevi per la scomparsa dei nuovi messaggi.',
    'Spectre needs your attention': 'Spectre richiede la tua attenzione',
    'Spectre protections are active': 'Le protezioni Spectre sono attive',
    'Submitting the deletion request': 'Invio della richiesta di eliminazione',
    'Switching back to your main wallet': 'Ritorno al tuo portafoglio principale',
    'Switching to your Spectre identity': 'Passaggio alla tua identità Spectre',
    'The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.':
      'Il backend non riconosce più questo token di pulizia. Reimporta l\'account per verificare l\'eliminazione.',
    'The cleanup status token expired. Re-import the account to verify its status.':
      'Il token di stato della pulizia è scaduto. Reimporta l\'account per verificarne lo stato.',
    'There is no pending backend cleanup to retry.':
      'Non esiste alcuna pulizia del backend in sospeso da ritentare.',
    'This cannot be undone. Backend data and local sensitive data will be erased for this account.':
      'Questa azione non può essere annullata. I dati del backend e i dati locali sensibili verranno cancellati per questo account.',
    'This cannot be undone. Local sensitive data is erased before the backend deletion request starts.':
      'Questa azione non può essere annullata. I dati locali sensibili vengono cancellati prima dell\'avvio della richiesta di eliminazione sul backend.',
    'This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.':
      'Questa azione elimina prima le chiavi e i dati locali, poi invia la pulizia del backend tramite il trasporto privato corrente. Una schermata di avanzamento resta visibile finché la pulizia non viene confermata.',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'Questa azione rimuove questo account EXO dal dispositivo e libera uno spazio EXO trasparente per questa frase di recupero. I messaggi esistenti per questo account vengono cancellati localmente. Questa azione non può essere annullata.',
    'This screen updates automatically as each Spectre stage finishes.':
      'Questa schermata si aggiorna automaticamente al termine di ogni fase Spectre.',
    'This screen updates only when a cleanup stage is confirmed.':
      'Questa schermata si aggiorna solo quando viene confermata una fase di pulizia.',
    'Tor could not connect': 'Tor non è riuscito a connettersi',
    'Tor must be online before Spectre can switch identities and continue.':
      'Tor deve essere online prima che Spectre possa cambiare identità e continuare.',
    'Tor routing applies only inside Spectra. Device-wide network routing is unchanged.':
      'L\'instradamento Tor si applica solo all\'interno di Spectra. L\'instradamento di rete dell\'intero dispositivo non cambia.',
    'Unlock or reconnect to the backend before deleting the account.':
      'Sblocca o riconnettiti al backend prima di eliminare l\'account.',
    'Verify Primary PIN': 'Verifica il PIN principale',
    'Verify your identity to change PIN': 'Verifica la tua identità per modificare il PIN',
    'Verifying private access': 'Verifica dell\'accesso privato',
    'Your PIN has been changed successfully.': 'Il tuo PIN è stato modificato correttamente.',
    'Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.':
      'Il tuo portafoglio Spectre e il tunnel Tor sono pronti. Le chat e i contatti possono completare l\'aggiornamento in background.',
    'Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.':
      'Il tuo portafoglio Spectre è attivo. EXO sta cambiando l\'ambito di archiviazione e caricando i dati locali per questo profilo privato.',
    'Your main wallet is restored': 'Il tuo portafoglio principale è stato ripristinato',
    '{{count}}s elapsed': '{{count}} s trascorsi',
    '{{count}}s elapsed - this may take 30-240 seconds with bridges':
      '{{count}} s trascorsi - l\'operazione potrebbe richiedere 30-240 secondi con i bridge',

    'A verified Backend session is required for Spectre activation':
      'Per l\'attivazione di Spectre è richiesta una sessione Backend verificata.',
    'Backend is not configured for Spectre activation':
      'Il backend non è configurato per l\'attivazione di Spectre.',
    'Contact Archive': 'Archivio contatti',
    'Disabled by Spectre Mode': 'Disattivato dalla modalità Spectre',
    'Encrypted contact archive': 'Archivio contatti crittografato',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Esporta un file crittografato che controlli, quindi importalo in seguito per conservare i contatti salvati.',
    'Export and import encrypted contacts': 'Esporta e importa contatti crittografati',
    'Failed to disable an expired Spectre session':
      'Impossibile disattivare una sessione Spectre scaduta',
    'Failed to refresh Spectre access': 'Impossibile aggiornare l\'accesso Spectre',
    'One anonymous activation token can be requested every 24 hours.':
      'Può essere richiesto un token di attivazione anonimo ogni 24 ore.',
    'Root': 'Principale',
    'Standard': 'Standard',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Passa al tuo account EXO principale per creare o importare account EXO trasparenti.',
    'Unable to complete Spectre activation': 'Impossibile completare l\'attivazione di Spectre',
  },
  tor: {
    'Connected to Spectre': 'Connesso a Spectre',
  },
} satisfies LocaleTranslationOverrides

export default translations

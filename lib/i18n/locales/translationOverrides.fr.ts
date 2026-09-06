import type { LocaleTranslationOverrides } from './translationOverrideTypes'

const translations = {
  common: {
    'Creating your post-quantum identity...': 'Création de votre identité post-quantique...',
    'Encrypted group sender keys': 'Clés d’expéditeur de groupe chiffrées',
    'End-to-end encrypted': 'Chiffré de bout en bout',
    'End-to-end encryption available for supported chats':
      'Le chiffrement de bout en bout est disponible pour les discussions prises en charge',
    'Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.':
      'Les clés de groupe sont distribuées via vos sessions directes chiffrées existantes. La suppression d’un membre fait automatiquement tourner la clé de groupe active.',
    'Hybrid post-quantum messaging': 'Messagerie hybride post-quantique',
    'ML-DSA-65 post-quantum signatures': 'Signatures post-quantiques ML-DSA-65',
    'Post-quantum': 'Post-quantique',
    'Post-quantum identity keys ready': 'Clés d’identité post-quantiques prêtes',
    'Securing your encrypted vault...': 'Sécurisation de votre coffre chiffré...',
    'Supported direct messages are end-to-end encrypted.':
      'Les messages directs pris en charge sont chiffrés de bout en bout.',
    'Snowflake bootstrap privacy notice': 'Avis de confidentialité pour l’amorçage Snowflake',
    'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.':
      'Snowflake utilise une infrastructure d’amorçage WebRTC, notamment un courtier, STUN et des services de proxys bénévoles. Ces services peuvent observer l’adresse IP de votre appareil et l’heure de connexion. Tor protège le trafic après l’établissement d’un circuit, mais ne peut pas masquer cette connexion d’amorçage.',
    'I understand': 'Je comprends',
    'Switching...': 'Changement en cours...',
    Import: 'Importer',
    Use: 'Utiliser',
    'Erasing...': 'Effacement...',
    'Could not switch EXO account': 'Impossible de changer de compte EXO',
    'Unable to switch EXO account': 'Impossible de changer de compte EXO',
    'Switching EXO account...': 'Changement de compte EXO...',
    'Transparent EXO accounts are restored from your recovery phrase.':
      'Les comptes EXO transparents sont restaurés à partir de votre phrase de récupération.',
    'Failed to generate account': 'Échec de la génération du compte',
    'Confirm that you backed up the recovery phrase before using this EXO account.':
      'Confirmez que vous avez sauvegardé la phrase de récupération avant d’utiliser ce compte EXO.',
    'Failed to save EXO account': 'Échec de l’enregistrement du compte EXO',
    Regenerate: 'Régénérer',
    'Create EXO Account': 'Créer un compte EXO',
    'Create a new transparent EXO account for work, friends, or another chat identity.':
      'Créez un nouveau compte EXO transparent pour le travail, les amis ou une autre identité de discussion.',
    'Root account required': 'Compte racine requis',
    'Each recovery phrase restores up to 5 transparent EXO accounts.':
      'Chaque phrase de récupération restaure jusqu’à 5 comptes EXO transparents.',
    'Switch to your root EXO account to create transparent EXO accounts.':
      'Passez à votre compte EXO racine pour créer des comptes EXO transparents.',
    'Generating secure keys...': 'Génération des clés sécurisées...',
    'New EXO Account': 'Nouveau compte EXO',
    'Never share your recovery phrase': 'Ne partagez jamais votre phrase de récupération',
    'This recovery phrase is shown only now. Store it offline before saving the new EXO account.':
      'Cette phrase de récupération n’est affichée qu’une seule fois. Conservez-la hors ligne avant d’enregistrer le nouveau compte EXO.',
    'Tap to reveal your recovery phrase': 'Touchez pour afficher votre phrase de récupération',
    'Make sure no one is watching your screen': 'Assurez-vous que personne ne regarde votre écran',
    'I backed up this recovery phrase offline.': 'J’ai sauvegardé cette phrase de récupération hors ligne.',
    'Save and Use Account': 'Enregistrer et utiliser le compte',
    'Invalid recovery phrase': 'Phrase de récupération invalide',
    'This EXO account already exists on this device.': 'Ce compte EXO existe déjà sur cet appareil.',
    'Failed to import account': 'Échec de l’importation du compte',
    'Import EXO Account': 'Importer un compte EXO',
    'Import a transparent EXO recovery phrase into this unlocked root vault.':
      'Importez une phrase de récupération EXO transparente dans ce coffre racine déverrouillé.',
    'You can import up to 5 transparent EXO accounts from one recovery phrase.':
      'Vous pouvez importer jusqu’à 5 comptes EXO transparents à partir d’une même phrase de récupération.',
    'Switch to your root EXO account to import transparent EXO accounts.':
      'Passez à votre compte EXO racine pour importer des comptes EXO transparents.',
    'Only import a recovery phrase you control. Imported accounts can send and receive chats independently.':
      'N’importez qu’une phrase de récupération que vous contrôlez. Les comptes importés peuvent envoyer et recevoir des messages de manière indépendante.',
    'Account Name (Optional)': 'Nom du compte (facultatif)',
    'Work, Friends, Personal...': 'Travail, Amis, Personnel...',
    'Importing...': 'Importation...',
    'Import and Use Account': 'Importer et utiliser le compte',
    'Account ready': 'Compte prêt',
    'Connection problem': 'Problème de connexion',
    'Connecting securely...': 'Connexion sécurisée...',
    'Root account': 'Compte racine',
    'EXO Account {{number}}': 'Compte EXO {{number}}',
    'Chat identity did not finish switching. Try reconnecting.':
      'Le changement d’identité de discussion ne s’est pas terminé. Essayez de vous reconnecter.',
    'Chat identity is not ready for this EXO account.':
      'L’identité de discussion n’est pas prête pour ce compte EXO.',
    'Could not verify the server session for this EXO account.':
      'Impossible de vérifier la session serveur pour ce compte EXO.',
    'Publishing chat bundle...': 'Publication du lot de discussion...',
    'Could not publish chat bundle.': 'Impossible de publier le lot de discussion.',
    'Chat bundle is still missing from the server.': 'Le lot de discussion est toujours absent du serveur.',
    'Could not link this chat identity to the server.':
      'Impossible de lier cette identité de discussion au serveur.',
    'Could not prepare this EXO account.': 'Impossible de préparer ce compte EXO.',
    'Could not switch back to the root EXO account.': 'Impossible de revenir au compte EXO racine.',
    Close: 'Fermer',
    Refresh: 'Actualiser',
    'At least 16 characters': 'Au moins 16 caractères',
    'Contacts: {{contacts}}': 'Contacts : {{contacts}}',
    'Contact Archive': 'Archive de contacts',
    'Encrypted contact archive': 'Archive de contacts chiffrée',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Exportez un fichier chiffré que vous contrôlez, puis importez-le plus tard pour conserver vos contacts enregistrés.',
    'Archive Passphrase Required': 'Phrase secrète de l’archive requise',
    'Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.':
      'Utilisez une phrase secrète unique d’au moins 16 caractères, comprenant des lettres, des chiffres et des symboles. Spectra ne peut pas la récupérer.',
    'Save encrypted contact archive': 'Enregistrer l’archive de contacts chiffrée',
    'Archive Exported': 'Archive exportée',
    'Export Failed': 'Échec de l’exportation',
    'Import Complete': 'Importation terminée',
    'Import Failed': 'Échec de l’importation',
    'Import contact archive?': 'Importer l’archive de contacts ?',
    'Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.':
      'Les contacts importés sont fusionnés avec ceux déjà présents sur cet appareil. Les discussions, messages, sessions, clés de groupe et médias ne sont jamais importés.',
    'Contact archives are unavailable while Spectre Mode is active.':
      'Les archives de contacts ne sont pas disponibles lorsque le mode Spectre est actif.',
    'No active wallet is available.': 'Aucun portefeuille actif n’est disponible.',
    'Unlock your vault before managing a contact archive.':
      'Déverrouillez votre coffre avant de gérer une archive de contacts.',
    'Contact archives are unavailable for Spectre accounts.':
      'Les archives de contacts ne sont pas disponibles pour les comptes Spectre.',
    'Archives unavailable': 'Archives indisponibles',
    'The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.':
      'L’archive est chiffrée sur cet appareil avant son partage. Elle n’est jamais envoyée à Spectra. Conservez le fichier et la phrase secrète séparément ; Spectra ne peut récupérer ni l’un ni l’autre.',
    'Archive Passphrase': 'Phrase secrète de l’archive',
    'Export file': 'Exporter le fichier',
    'Import file': 'Importer le fichier',
    'Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.':
      'Seuls les contacts enregistrés et leurs libellés sont inclus. Les contacts existants sont conservés, et les contacts restaurés sont disponibles dès l’importation.',
    'BIP39 word suggestions': 'Suggestions de mots BIP39',
    Next: 'Suivant',
    'Paste recovery phrase': 'Coller la phrase de récupération',
    Previous: 'Précédent',
    'Recovery word {{number}}': 'Mot de récupération {{number}}',
    'Use {{word}} for recovery word {{number}}': 'Utiliser {{word}} pour le mot de récupération {{number}}',
    '{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}':
      '{{bridgeCount}} ponts {{transport}} chargés. {{routeMessage}}',
    '{{error}} This request used the normal network while Tor was disabled.':
      '{{error}} Cette requête a utilisé le réseau normal alors que Tor était désactivé.',
    'Applying bridge configuration…': 'Application de la configuration des ponts…',
    'Applying direct Tor…': 'Activation du mode Tor direct…',
    'Bridge Update Failed': 'Échec de la mise à jour des ponts',
    'Fetched over the normal network while Tor was disabled.':
      'Récupéré via le réseau normal alors que Tor était désactivé.',
    'Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}':
      'Ni la configuration demandée ni les ponts précédents n’ont pu se connecter. Tor reste activé et le trafic vers le backend demeure bloqué. {{error}}',
    'Previous Bridges Restored': 'Ponts précédents restaurés',
    'This fetch used the normal network while Tor was disabled.':
      'Cette récupération a utilisé le réseau normal alors que Tor était désactivé.',
    'Tor Connection Failed': 'Échec de la connexion Tor',
    'Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}':
      'Tor n’a pas pu se connecter avec la configuration demandée ; les derniers ponts fonctionnels ont donc été restaurés. {{error}}',
    'Tor is disabled, so bridge requests will use the normal network.':
      'Tor est désactivé ; les demandes de ponts utiliseront le réseau normal.',
    'Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.':
      'Tor est activé mais non connecté. Désactivez Tor avant de récupérer des ponts d’amorçage via le réseau normal.',
    'Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.':
      'Tor se connecte toujours. Les demandes de ponts restent bloquées jusqu’à ce qu’un circuit Tor soit disponible.',
    '{{count}} groups in common': '{{count}} groupes en commun',
    '{{network}} address': 'Adresse {{network}}',
    'Add ETH before sending this token.': 'Ajoutez de l’ETH avant d’envoyer ce jeton.',
    Available: 'Disponible',
    Back: 'Retour',
    Block: 'Bloquer',
    'Block {{displayName}}? You will no longer receive messages from them.':
      'Bloquer {{displayName}} ? Vous ne recevrez plus de messages de cette personne.',
    Buy: 'Acheter',
    'Calculated by network': 'Calculé par le réseau',
    'Cancel Spectre Mode': 'Annuler le mode Spectre',
    'Canceling Spectre Mode...': 'Annulation du mode Spectre...',
    'Calls are only supported in direct chats.':
      'Les appels ne sont pris en charge que dans les discussions directes.',
    'Calls unavailable': 'Appels indisponibles',
    'Chat unavailable': 'Discussion indisponible',
    Chats: 'Discussions',
    'Choose how long messages remain visible after they are read.':
      'Choisissez combien de temps les messages restent visibles après leur lecture.',
    'Claim Refund': 'Réclamer le remboursement',
    'Clear chat': 'Effacer la discussion',
    'Close media preview': 'Fermer l’aperçu du média',
    'Close poll failed': 'Échec de la fermeture du sondage',
    'Confirm & Send': 'Confirmer et envoyer',
    'Confirm Payment': 'Confirmer le paiement',
    'Confirm Transaction': 'Confirmer la transaction',
    'Connecting...': 'Connexion...',
    'Connection failed': 'Échec de la connexion',
    'Copy TX': 'Copier la transaction',
    'Could not open this chat': 'Impossible d’ouvrir cette discussion',
    'Could not open this chat.': 'Impossible d’ouvrir cette discussion.',
    Creator: 'Créateur',
    'Disappearing messages': 'Messages éphémères',
    Edit: 'Modifier',
    'Enter a valid amount': 'Saisissez un montant valide',
    'Enter a valid EXO price greater than zero.': 'Saisissez un prix EXO valide supérieur à zéro.',
    'ERC-20 on Ethereum Mainnet': 'ERC-20 sur Ethereum Mainnet',
    'ERC-20 Tokens': 'Jetons ERC-20',
    Euro: 'Euro',
    'Est. gas: {{amount}} {{symbol}}': 'Gaz estimé : {{amount}} {{symbol}}',
    'Estimated fee': 'Frais estimés',
    'EXO account creation is disabled while Spectre Mode is active.':
      'La création de comptes EXO est désactivée lorsque le mode Spectre est actif.',
    'Failed to claim refund': 'Échec de la réclamation du remboursement',
    'Failed to complete the paid join flow': 'Impossible de terminer le processus d’adhésion payant',
    'Failed to create poll': 'Échec de la création du sondage',
    'Failed to create poll message': 'Échec de la création du message de sondage',
    'Failed to create request': 'Échec de la création de la demande',
    'Failed to Load': 'Échec du chargement',
    'Failed to load market': 'Échec du chargement du marché',
    'Failed to save membership access settings':
      'Échec de l’enregistrement des paramètres d’accès des membres',
    'Failed to switch EXO account': 'Échec du changement de compte EXO',
    'Failed to verify the payment confirmation.': 'Impossible de vérifier la confirmation du paiement.',
    'Hide {{displayName}} from your Contacts tab on this device? Chats and encryption keys will stay intact.':
      'Masquer {{displayName}} dans l’onglet Contacts de cet appareil ? Les discussions et clés de chiffrement resteront intactes.',
    'Incorrect PIN': 'PIN incorrect',
    'Invalid {{network}} address': 'Adresse {{network}} invalide',
    'Invalid amount': 'Montant invalide',
    'Invalid market ID': 'ID de marché invalide',
    'Invalid recipient address': 'Adresse du destinataire invalide',
    'Loading pool data...': 'Chargement des données du pool...',
    'Loading voice note...': 'Chargement de la note vocale...',
    Max: 'Maximum',
    'Media, links and docs': 'Médias, liens et documents',
    Muted: 'En sourdine',
    'My {{network}} Address': 'Mon adresse {{network}}',
    Network: 'Réseau',
    'Network Fee': 'Frais de réseau',
    'Network State': 'État du réseau',
    'Network: Mozaga native EXO': 'Réseau : EXO natif Mozaga',
    'No documents shared yet': 'Aucun document partagé pour le moment',
    'No address for this network': 'Aucune adresse pour ce réseau',
    'No links shared yet': 'Aucun lien partagé pour le moment',
    'No tokens found': 'Aucun jeton trouvé',
    Notifications: 'Notifications',
    On: 'Activé',
    'Opening...': 'Ouverture...',
    'Paid access setup incomplete': 'Configuration de l’accès payant incomplète',
    'Paid in {{symbol}}': 'Payé en {{symbol}}',
    'Paid by {{payerName}}': 'Payé par {{payerName}}',
    'Pay request': 'Payer la demande de paiement',
    'Pay {{amount}}': 'Payer {{amount}}',
    'Payment already submitted': 'Paiement déjà envoyé',
    'Payment failed': 'Échec du paiement',
    'Payment message received': 'Message de paiement reçu',
    'Payment Pending': 'Paiement en attente',
    'Payment paid': 'Paiement effectué',
    'Payment recorded': 'Paiement enregistré',
    'Payment request: {{amount}} {{symbol}}': 'Demande de paiement : {{amount}} {{symbol}}',
    'Payment Required': 'Paiement requis',
    'Payment submitted': 'Paiement envoyé',
    'Payment submitted: {{amount}} {{symbol}}': 'Paiement envoyé : {{amount}} {{symbol}}',
    'Platform fee: {{fee}}': 'Frais de plateforme : {{fee}}',
    'Please allow access to your photo library to change the group photo.':
      'Autorisez l’accès à votre photothèque pour modifier la photo du groupe.',
    'Preparing voice note...': 'Préparation de la note vocale...',
    'Post request': 'Publier la demande',
    'Recipient {{network}} Address': 'Adresse {{network}} du destinataire',
    Recipient: 'Destinataire',
    'Receive Crypto': 'Recevoir des cryptomonnaies',
    'Receive address': 'Adresse de réception',
    'Reconnecting...': 'Reconnexion...',
    'Request a payment in this chat': 'Demander un paiement dans cette discussion',
    'Requested asset is not available in this wallet':
      'L’actif demandé n’est pas disponible dans ce portefeuille',
    'Review Send': 'Vérifier l’envoi',
    'Search contacts...': 'Rechercher des contacts...',
    'Securing chat...': 'Sécurisation de la discussion...',
    'Preparing secure channel...': 'Sécurisation de la discussion...',
    'Select Blockchain': 'Sélectionner la blockchain',
    Sell: 'Vendre',
    'Send {{symbol}}': 'Envoyer {{symbol}}',
    'Send {{symbol}} to my {{network}} address:\n{{address}}':
      'Envoyez {{symbol}} à mon adresse {{network}} :\n{{address}}',
    'Sending as {{account}}': 'Envoi avec {{account}}',
    'Sending transaction...': 'Envoi de la transaction...',
    'Share {{network}} Address': 'Partager l’adresse {{network}}',
    'Share contact': 'Partager le contact',
    'Show {{displayName}} in your Contacts tab again?':
      'Afficher à nouveau {{displayName}} dans l’onglet Contacts ?',
    'Solana private key is not available': 'La clé privée Solana n’est pas disponible',
    'Solana wallet not available': 'Le portefeuille Solana n’est pas disponible',
    'Something went wrong. Please try again.': 'Une erreur s’est produite. Veuillez réessayer.',
    'SPL Tokens': 'Jetons SPL',
    'SPL tokens on Solana': 'Jetons SPL sur Solana',
    'Tap to load voice note': 'Touchez pour charger la note vocale',
    'Tap to view shared links and documents': 'Touchez pour voir les liens et documents partagés',
    'The payment transaction failed on-chain.': 'La transaction de paiement a échoué sur la chaîne.',
    'This file is not available on this device yet.': 'Ce fichier n’est pas encore disponible sur cet appareil.',
    'This message was deleted': 'Ce message a été supprimé',
    'This request has already been marked as paid.': 'Cette demande a déjà été marquée comme payée.',
    'This voice note could not be loaded right now.':
      'Cette note vocale ne peut pas être chargée pour le moment.',
    'This wallet does not have an account for {{network}}.':
      'Ce portefeuille ne possède pas de compte pour {{network}}.',
    To: 'À',
    'Tor Bridges': 'Ponts Tor',
    'Transaction failed on-chain': 'Échec de la transaction sur la chaîne',
    'TRC-20 on Tron': 'TRC-20 sur Tron',
    'TRC-20 Tokens': 'Jetons TRC-20',
    'Tron private key is not available': 'La clé privée Tron n’est pas disponible',
    'Tron wallet not available': 'Le portefeuille Tron n’est pas disponible',
    'Try Again': 'Réessayer',
    'Unable to load voice note': 'Impossible de charger la note vocale',
    'Unable to open link': 'Impossible d’ouvrir le lien',
    'Unable to remove recipient': 'Impossible de retirer le destinataire',
    Unblock: 'Débloquer',
    'Unblock {{displayName}}? They will be able to send you messages again.':
      'Débloquer {{displayName}} ? Cette personne pourra de nouveau vous envoyer des messages.',
    'Unlock the wallet that will pay for this membership and try again.':
      'Déverrouillez le portefeuille qui paiera cet abonnement et réessayez.',
    'Unsupported {{type}} attachment': 'Pièce jointe {{type}} non prise en charge',
    'Unsupported attachment': 'Pièce jointe non prise en charge',
    'Use Biometric': 'Utiliser la biométrie',
    'Use the original offline backup you created during onboarding if you need the phrase again. If it is lost, create a newly backed up wallet and migrate to it. The device cannot reveal the old phrase.':
      'Utilisez la sauvegarde hors ligne d’origine créée lors de l’intégration si vous avez de nouveau besoin de la phrase. Si elle est perdue, créez un nouveau portefeuille sauvegardé et migrez-y. L’appareil ne peut pas révéler l’ancienne phrase.',
    'V1 supports Mozaga native EXO only. The company fee is {{fee}}.':
      'V1 ne prend en charge que l’EXO natif de Mozaga. Les frais de l’entreprise sont de {{fee}}.',
    'via {{account}}': 'via {{account}}',
    'Voice note unavailable': 'Note vocale indisponible',
    Volume: 'Volume',
    Wallets: 'Portefeuilles',
    'You requested': 'Vous avez demandé',
    "You'll enter the {{network}} address in the next step":
      'Vous saisirez l’adresse {{network}} à l’étape suivante',
    'Your payment was submitted but is still waiting for confirmation. Reopen this invite in a moment to finish joining.':
      'Votre paiement a été envoyé mais attend toujours une confirmation. Rouvrez cette invitation dans un instant pour terminer l’adhésion.',
    '{{senderName}} requested': '{{senderName}} a demandé',
    'Diffusion channels require Spectre access.': 'Les canaux de diffusion nécessitent un accès Spectre.',
    'Upgrade to Spectre to create one diffusion channel.':
      'Passez à Spectre pour créer un canal de diffusion.',
    'Please wait until this chat is ready.': 'Veuillez attendre que cette discussion soit prête.',
    'Please retry the chat setup first.': 'Veuillez d’abord réessayer de configurer la discussion.',
    'Edit and resend': 'Modifier et renvoyer',
    'Could not update notifications': 'Impossible de mettre à jour les notifications',
    'Public name in notifications': 'Nom public dans les notifications',
    "Hide this contact's public name in your push notifications.":
      'Masquer le nom public de ce contact dans vos notifications push.',
    Hidden: 'Masqué',
    Allowed: 'Autorisé',
    'Send ETH': 'Envoyer de l’ETH',
    'Could not add members': 'Impossible d’ajouter des membres',
    'Add {{count}}': 'Ajouter {{count}}',
    Media: 'Médias',
    'Add user': 'Ajouter un utilisateur',
    '{{count}} slots available': '{{count}} emplacements disponibles',
    'Group members': 'Membres du groupe',
    Created: 'Créé',
    'Could not save your public name. Please try again.':
      'Impossible d’enregistrer votre nom public. Veuillez réessayer.',
    'Text or link': 'Texte ou lien',
    ' +{{count}} more': ' +{{count}} de plus',
    'Shared content is missing. Please share it again.':
      'Le contenu partagé est introuvable. Veuillez le partager de nouveau.',
    'Unable to send': 'Impossible d’envoyer',
    'Share to Spectra': 'Partager avec Spectra',
    'Private handoff': 'Transfert privé',
    'Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.':
      'Les destinataires ne sont visibles qu’à l’intérieur de Spectra. iOS ne voit que la destination de l’app Spectra.',
    'Loading shared content...': 'Chargement du contenu partagé...',
    'Could not import shared content': 'Impossible d’importer le contenu partagé',
    '{{count}} attachment_one': '{{count}} pièce jointe',
    '{{count}} attachment_other': '{{count}} pièces jointes',
    'No Spectra chats are available for sharing yet.':
      'Aucune discussion Spectra n’est encore disponible pour le partage.',
    'Connecting encrypted chat...': 'Connexion à la discussion chiffrée...',
    'Recovering secure call...': 'Récupération de l’appel sécurisé...',
    'Establishing secure call...': 'Établissement de l’appel sécurisé...',
    'Secure call waiting': 'Appel sécurisé en attente',
    'Minimize call': 'Réduire l’appel',
    'Edit image': 'Modifier l’image',
    'Toggle media controls': 'Afficher ou masquer les commandes multimédias',
    '+ gas in': '+ gaz en',
    Payment: 'Paiement',
    'Tap to review and pay': 'Touchez pour vérifier et payer',
    'Unable to edit image': 'Impossible de modifier l’image',
    'This image could not be edited right now.': 'Cette image ne peut pas être modifiée pour le moment.',
    'Message unavailable': 'Message indisponible',
    'Could not update this image. Please try again.':
      'Impossible de mettre à jour cette image. Veuillez réessayer.',
    'Could not save the edited image. Please try again.':
      'Impossible d’enregistrer l’image modifiée. Veuillez réessayer.',
    'Add text': 'Ajouter du texte',
    'Drag text on the image to reposition it.':
      'Faites glisser le texte sur l’image pour le repositionner.',
    'Drag the crop frame or its corners, then apply.':
      'Faites glisser le cadre de recadrage ou ses coins, puis appliquez.',
    'Apply crop': 'Appliquer le recadrage',
    Color: 'Couleur',
    'Select drawing color': 'Sélectionner la couleur de dessin',
    Stroke: 'Trait',
    Crop: 'Recadrer',
    Rotate: 'Pivoter',
    Draw: 'Dessiner',
    Text: 'Texte',
    Undo: 'Annuler',
    Reset: 'Réinitialiser',
    'Use original': 'Utiliser l’original',
    'Retry failed': 'Nouvelle tentative échouée',
    'Unable to retry': 'Impossible de réessayer',
    'This secure chat is not ready yet. Please try again in a moment.':
      'Cette discussion sécurisée n’est pas encore prête. Veuillez réessayer dans un instant.',
    'Load this image before editing it.': 'Chargez cette image avant de la modifier.',
    'Spectre access includes one diffusion channel.': 'L’accès Spectre inclut un canal de diffusion.',
    'Spectra logo': 'Logo Spectra',
    '{{width}} px': '{{width}} px',
    'External links unavailable': 'Liens externes indisponibles',
    'External links are unavailable while Spectre Mode is active.':
      'Les liens externes ne sont pas disponibles lorsque le mode Spectre est actif.',
    'New encrypted message': 'Nouveau message chiffré',
    'New message': 'Nouveau message',
    'New group message': 'Nouveau message de groupe',
    Default: 'Par défaut',
    Messages: 'Messages',
    Calls: 'Appels',
    Transfers: 'Transferts',
    'New message notifications': 'Notifications de nouveaux messages',
    'Secure call notifications': 'Notifications d’appels sécurisés',
    'Wallet transfer notifications': 'Notifications de transferts de portefeuille',
    'Secure call': 'Appel sécurisé',
    'A newer version of Spectra is available. Update to get the latest features and fixes.':
      'Une version plus récente de Spectra est disponible. Mettez l’application à jour pour obtenir les dernières fonctionnalités et corrections.',
    'This version of Spectra is no longer supported. Update to continue using secure services.':
      'Cette version de Spectra n’est plus prise en charge. Mettez l’application à jour pour continuer à utiliser les services sécurisés.',
    'Update available': 'Mise à jour disponible',
    'Update required': 'Mise à jour requise',
    'Update Spectra': 'Mettre à jour Spectra',
  },
  auth: {
    'Account import progress': 'Progression de l’importation du compte',
    'Deriving wallets...': 'Dérivation des portefeuilles...',
    'Finishing previous account deletion...': 'Finalisation de la suppression du compte précédent...',
    'Importing Account': 'Importation du compte',
    'Public name contains unsupported characters':
      'Le nom public contient des caractères non pris en charge',
    'Public name is too large': 'Le nom public est trop long',
    'Public name must be {{max}} characters or fewer':
      'Le nom public doit comporter au plus {{max}} caractères',
    'Unable to use this public name': 'Impossible d’utiliser ce nom public',
    'Authenticate to upgrade biometric unlock':
      'Authentifiez-vous pour mettre à niveau le déverrouillage biométrique',
    'Choose a Public Name': 'Choisissez un nom public',
    'Go back': 'Retour',
    Important: 'Important',
    'Optional public name for chats': 'Nom public facultatif pour les discussions',
    'Public Name': 'Nom public',
    'Public name contains invalid text.': 'Le nom public contient du texte non valide.',
    'Public name contains unsupported control characters.':
      'Le nom public contient des caractères de contrôle non pris en charge.',
    'Public name contains unsupported direction controls.':
      'Le nom public contient des contrôles directionnels non pris en charge.',
    'Public name is too large when encoded.': 'Le nom public est trop long une fois encodé.',
    'Public name must be 80 characters or fewer.':
      'Le nom public doit comporter au plus 80 caractères.',
    'This optional name helps people recognize you in chats and contacts. You can change or remove it later.':
      'Ce nom facultatif aide les personnes à vous reconnaître dans les discussions et les contacts. Vous pourrez le modifier ou le supprimer plus tard.',
    'Your public name is shared as chat-directory metadata. It is not included in your recovery phrase and does not affect account security.':
      'Votre nom public est partagé comme métadonnée d’annuaire de discussions. Il n’est pas inclus dans votre phrase de récupération et n’affecte pas la sécurité du compte.',
    '{{count}} characters maximum.': '{{count}} caractères maximum.',
    'Unlock Spectra to connect your secure call':
      'Déverrouillez Spectra pour connecter votre appel sécurisé.',
    'PIN input': 'Saisie du PIN',
    'Mnemonic must be 12 or 24 words': 'La phrase mnémonique doit comporter 12 ou 24 mots',
    'Invalid word: "{{word}}"': 'Mot invalide : « {{word}} »',
    'Invalid mnemonic checksum': 'Somme de contrôle de la phrase mnémonique invalide',
  },
  chat: {
    'Start Secret Chat': 'Démarrer une discussion secrète',
    'Choose a contact or start with an address':
      'Choisissez un contact ou commencez avec une adresse',
    'Starting from {{account}}': 'À partir de {{account}}',
    'Add by address': 'Ajouter par adresse',
    'Add a contact and open a private chat': 'Ajoutez un contact et ouvrez une discussion privée',
    'Start Chat': 'Démarrer la discussion',
    'Scan, add, and start a private chat': 'Scannez, ajoutez et démarrez une discussion privée',
    'Select from contacts': 'Sélectionner parmi les contacts',
    'No saved contacts yet': 'Aucun contact enregistré pour le moment',
    'Add someone by address or scan their QR code to start.':
      'Ajoutez une personne par adresse ou scannez son code QR pour commencer.',
    'Starting chat...': 'Démarrage de la discussion...',
    'Unable to start chat': 'Impossible de démarrer la discussion',
    '{{count}} messages': '{{count}} messages',
    '{{name}} took a screenshot': '{{name}} a effectué une capture d’écran',
    'Add attachment': 'Ajouter une pièce jointe',
    'Cancel reply': 'Annuler la réponse',
    'Load more': 'Charger plus',
    'Record voice note': 'Enregistrer une note vocale',
    'Remove attachment': 'Retirer la pièce jointe',
    'Send message': 'Envoyer le message',
    'Toggle one-time message': 'Activer ou désactiver le message à usage unique',
    'Updated {{time}}': 'Mis à jour {{time}}',
    'You took a screenshot': 'Vous avez effectué une capture d’écran',
    'Edit image': 'Modifier l’image',
    'Choose a contact or use a secure invitation':
      'Choisissez un contact ou utilisez une invitation sécurisée',
    'Add by invitation': 'Ajouter par invitation',
    'Paste a secure invitation or scan its QR code':
      'Collez une invitation sécurisée ou scannez son code QR',
    'Paste a secure invitation or scan its QR code to start.':
      'Collez une invitation sécurisée ou scannez son code QR pour commencer.',
    Nearby: 'À proximité',
    'Cancel voice note': 'Annuler la note vocale',
    'Send voice note': 'Envoyer la note vocale',
    'Play voice note': 'Lire la note vocale',
    'Pause voice note': 'Mettre la note vocale en pause',
    'Text overlay': 'Superposition de texte',
    'Crop frame': 'Cadre de recadrage',
    'Crop top-left handle': 'Poignée de recadrage supérieure gauche',
    'Crop top-right handle': 'Poignée de recadrage supérieure droite',
    'Crop bottom-left handle': 'Poignée de recadrage inférieure gauche',
    'Crop bottom-right handle': 'Poignée de recadrage inférieure droite',
    '#Tag': '#Étiquette',
    'Sending attachment': 'Envoi de la pièce jointe',
    'Preparing message': 'Préparation du message',
    'Sending message': 'Envoi du message',
    'Caching locally': 'Mise en cache locale',
    Complete: 'Terminé',
    'Encrypting and uploading {{completed}}/{{total}}':
      'Chiffrement et envoi de {{completed}}/{{total}}',
    'Sending nearby': 'Envoi à proximité',
    'Queued nearby': 'En file d’attente à proximité',
    'Nearby delivery expired': 'Délai de livraison à proximité expiré',
    'Nearby retry limit reached': 'Limite de tentatives de proximité atteinte',
    'Nearby queue full': 'File d’attente à proximité pleine',
    'Nearby delivery interrupted': 'Livraison à proximité interrompue',
    'Nearby receipt timed out': 'Délai d’attente de l’accusé de réception à proximité dépassé',
    'Nearby transmission failed': 'Échec de la transmission à proximité',
    'Nearby delivery failed': 'Échec de la livraison à proximité',
  },
  contacts: {
    'EXO Account': 'Compte EXO',
    'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.':
      'Saisissez l’adresse post-quantique de la personne que vous souhaitez ajouter. Elle doit vous avoir communiqué son adresse.',
    'Adding to': 'Ajout à',
    'This contact will be saved under this EXO account on this device.':
      'Ce contact sera enregistré sous ce compte EXO sur cet appareil.',
    Selected: 'Sélectionné',
    'Switching...': 'Changement en cours...',
    'via {{account}}': 'via {{account}}',
    'Please wait until the EXO account switch finishes.':
      'Veuillez attendre la fin du changement de compte EXO.',
    'Paste a valid secure contact invitation.': 'Collez une invitation de contact sécurisée valide.',
    'Paste a secure contact invitation or scan a contact QR code':
      'Collez une invitation de contact sécurisée ou scannez un code QR de contact',
    'Invalid secure contact invitation': 'Invitation de contact sécurisée invalide',
    'Add by secure contact invitation': 'Ajouter par invitation de contact sécurisée',
    'Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.':
      'Scannez un code QR de contact ou collez l’invitation de contact sécurisée partagée par la personne que vous souhaitez ajouter.',
    'Secure Contact Invitation': 'Invitation de contact sécurisée',
    'Secure invitation ready': 'Invitation sécurisée prête',
    'Invalid contact invitation': 'Invitation de contact invalide',
    'Scan a secure Spectra contact QR code shared by the person you want to add.':
      'Scannez un code QR de contact Spectra sécurisé partagé par la personne que vous souhaitez ajouter.',
    'Paste a secure contact invitation or scan its QR code.':
      'Collez une invitation de contact sécurisée ou scannez son code QR.',
  },
  crypto: {
    Total: 'Total',
    Contribution: 'Contribution',
    '~{{fee}} {{symbol}}': '~{{fee}} {{symbol}}',
    '{{symbol}} logo': 'Logo {{symbol}}',
    'USDT logo': 'Logo USDT',
  },
  markets: {
    'Trending Markets': 'Marchés tendance',
    'Live Campaigns': 'Campagnes en cours',
    'Hot Predictions': 'Prédictions populaires',
    'See all': 'Voir tout',
    Pools: 'Pools',
    Vol: 'Vol.',
    of: 'sur',
    '{{count}}m left': '{{count}} min restantes',
    '{{count}}h left': '{{count}} h restantes',
    '{{count}}d left': '{{count}} j restants',
    'No description': 'Aucune description',
    'No order activity yet': 'Aucune activité d’ordre pour le moment',
    'Untitled campaign': 'Campagne sans titre',
    '{{count}} backers': '{{count}} contributeurs',
    '0 (unlimited)': '0 (illimité)',
    'Amount exceeds remaining allowance': 'Le montant dépasse le plafond restant',
    'Cannot contribute': 'Impossible de contribuer',
    'Connect wallet to create a campaign': 'Connectez un portefeuille pour créer une campagne',
    'Connect wallet to create an escrow order':
      'Connectez un portefeuille pour créer un ordre séquestre',
    'Connect wallet to view your campaigns': 'Connectez un portefeuille pour voir vos campagnes',
    'Connect wallet to view your escrow orders':
      'Connectez un portefeuille pour voir vos ordres séquestres',
    'Describe the condition for release...': 'Décrivez la condition de libération...',
    'Enter a valid market ID': 'Saisissez un ID de marché valide',
    'Enter a valid sale ID': 'Saisissez un ID de vente valide',
    'Fiat price must be greater than zero': 'Le prix fiduciaire doit être supérieur à zéro',
    Filled: 'Exécuté',
    'Invalid campaign ID': 'ID de campagne invalide',
    'Invalid order ID': 'ID d’ordre invalide',
    'Invalid sale ID': 'ID de vente invalide',
    'No escrow orders found': 'Aucun ordre séquestre trouvé',
    'Partially Filled': 'Partiellement exécuté',
    Yes: 'Oui',
    'You are not eligible to contribute': 'Vous n’êtes pas admissible à contribuer',
  },
  settings: {
    'Activating secure online access': 'Activation de l’accès en ligne sécurisé',
    'Publishing secure discovery': 'Publication de la découverte sécurisée',
    'Keeping you findable': 'Vous restez trouvable',
    'Starting a secure chat': 'Démarrage d’une discussion sécurisée',
    'Creating one-time contact card': 'Création d’une carte de contact à usage unique',
    'Computing VDF proof': 'Calcul de la preuve VDF',
    'Solving a sequential proof that helps prevent automated account creation.':
      'Résolution d’une preuve séquentielle qui aide à empêcher la création automatisée de comptes.',
    'Generating VDF proof': 'Génération de la preuve VDF',
    'Preparing the compact proof the server can verify efficiently.':
      'Préparation de la preuve compacte que le serveur peut vérifier efficacement.',
    'Waiting for server verification': 'En attente de la vérification du serveur',
    'Retrying server verification': 'Nouvelle tentative de vérification du serveur',
    'Proof ready. The server enforces a minimum delay before it accepts it.':
      'La preuve est prête. Le serveur impose un délai minimal avant de l’accepter.',
    'Verifying VDF proof': 'Vérification de la preuve VDF',
    'Sending the proof for secure verification.':
      'Envoi de la preuve pour une vérification sécurisée.',
    'Secure online access is ready': 'L’accès en ligne sécurisé est prêt',
    'Your secure online access is active.': 'Votre accès en ligne sécurisé est actif.',
    'VDF work was cancelled': 'Le calcul VDF a été annulé',
    'No proof was submitted.': 'Aucune preuve n’a été envoyée.',
    'Secure access needs attention': 'L’accès sécurisé requiert votre attention',
    'This proof could not be completed. Check your connection and try again.':
      'Cette preuve n’a pas pu être terminée. Vérifiez votre connexion et réessayez.',
    '{{percent}}% complete': '{{percent}} % terminé',
    'VDFs completed {{completed}}/{{total}}': 'VDF terminées {{completed}}/{{total}}',
    '{{rate}} VDF iterations/s': '{{rate}} itérations VDF/s',
    'Measuring VDF rate…': 'Mesure de la vitesse VDF…',
    '~{{count}}s remaining': '~{{count}} s restantes',
    'Cancel secure work': 'Annuler le calcul sécurisé',
    'Could not start this chat': 'Impossible de démarrer cette discussion',
    'Could not update discovery': 'Impossible de mettre à jour la découverte',
    'Could not create contact card': 'Impossible de créer la carte de contact',
    'Dismiss': 'Fermer',
    'Keep Spectra open while the security proof is verified.':
      'Gardez Spectra ouvert pendant la vérification de la preuve de sécurité.',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'Cette action supprime ce compte EXO de cet appareil et libère un emplacement EXO transparent pour cette phrase de récupération. Les messages existants de ce compte sont effacés localement. Cette action est irréversible.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Passez à votre compte EXO racine pour créer ou importer des comptes EXO transparents.',
    'Failed to disable an expired Spectre session': 'Impossible de désactiver une session Spectre expirée',
    'Disabled by Spectre Mode': 'Désactivé par le mode Spectre',
    Standard: 'Standard',
    'Contact Archive': 'Archive de contacts',
    'Encrypted contact archive': 'Archive de contacts chiffrée',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Exportez un fichier chiffré que vous contrôlez, puis importez-le plus tard pour conserver vos contacts enregistrés.',
    'Export and import encrypted contacts': 'Exporter et importer des contacts chiffrés',
    'Unable to complete Spectre activation': 'Impossible de terminer l’activation Spectre',
    'One anonymous activation token can be requested every 24 hours.':
      'Un jeton d’activation anonyme peut être demandé toutes les 24 heures.',
    'Backend is not configured for Spectre activation':
      'Le backend n’est pas configuré pour l’activation Spectre',
    'A verified Backend session is required for Spectre activation':
      'Une session backend vérifiée est requise pour l’activation Spectre',
    'Failed to refresh Spectre access': 'Impossible d’actualiser l’accès Spectre',
    'Account deleted': 'Compte supprimé',
    'Account deletion completed': 'Suppression du compte terminée',
    'Account deletion needs attention': 'La suppression du compte requiert votre attention',
    'A verified backend session is required before deleting this account.':
      'Une session backend vérifiée est requise avant de supprimer ce compte.',
    'Backend cleanup is paused and will be retried safely. Try checking again.':
      'Le nettoyage du backend est en pause et sera réessayé sans risque. Réessayez la vérification.',
    'Backend cleanup is still running. You can retry this status check safely.':
      'Le nettoyage du backend est toujours en cours. Vous pouvez réessayer cette vérification sans risque.',
    'Backend cleanup could not be checked. Retry when the private connection is available.':
      'Impossible de vérifier le nettoyage du backend. Réessayez lorsque la connexion privée est disponible.',
    'Backend deletion completed, but final device cleanup needs to be retried.':
      'La suppression côté backend est terminée, mais le nettoyage final de l’appareil doit être réessayé.',
    'Backend deletion completed, but local key erasure could not be confirmed.':
      'La suppression côté backend est terminée, mais l’effacement des clés locales n’a pas pu être confirmé.',
    'Cleanup could not be confirmed. You can retry safely.':
      'Le nettoyage n’a pas pu être confirmé. Vous pouvez réessayer sans risque.',
    'Deleting Account': 'Suppression du compte',
    'Deleting account records': 'Suppression des enregistrements du compte',
    'Deleting chat relay data': 'Suppression des données du relais de discussion',
    'Deleting encrypted objects': 'Suppression des objets chiffrés',
    'Deletion needs attention': 'La suppression requiert votre attention',
    'Erasing local keys and data': 'Effacement des clés et données locales',
    'Finalizing secure cleanup': 'Finalisation du nettoyage sécurisé',
    'Keep Spectra open while each verified cleanup stage completes.':
      'Gardez Spectra ouvert pendant que chaque étape de nettoyage vérifiée se termine.',
    'Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.':
      'Les données locales sont effacées, mais le nettoyage du backend n’a pas pu être confirmé. Réessayez lorsque la connexion privée est disponible.',
    'Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.':
      'Les données locales ont été effacées, mais le backend n’a pas accepté la demande de suppression. Réimportez le compte pour réessayer.',
    'Local data and the accepted backend cleanup have finished.':
      'Les données locales et le nettoyage backend accepté sont terminés.',
    'Preparing secure deletion': 'Préparation de la suppression sécurisée',
    'Retry account deletion cleanup': 'Réessayer le nettoyage de suppression du compte',
    'Retry cleanup': 'Réessayer le nettoyage',
    'Secure account deletion stopped unexpectedly. Try again when the private connection is available.':
      'La suppression sécurisée s’est interrompue de façon inattendue. Réessayez lorsque la connexion privée est disponible.',
    'Secure deletion in progress': 'Suppression sécurisée en cours',
    'Submitting the deletion request': 'Envoi de la demande de suppression',
    'This cannot be undone. Local sensitive data is erased before the backend deletion request starts.':
      'Cette action est irréversible. Les données locales sensibles sont effacées avant le début de la demande de suppression au backend.',
    'This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.':
      'Cette action supprime d’abord les clés et données locales, puis soumet le nettoyage backend via votre transport privé actuel. Un écran de progression reste visible jusqu’à confirmation du nettoyage.',
    'This screen updates only when a cleanup stage is confirmed.':
      'Cet écran ne se met à jour que lorsqu’une étape de nettoyage est confirmée.',
    'The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.':
      'Le backend ne reconnaît plus ce jeton de nettoyage. Réimportez le compte pour vérifier la suppression.',
    'The cleanup status token expired. Re-import the account to verify its status.':
      'Le jeton d’état du nettoyage a expiré. Réimportez le compte pour vérifier son état.',
    'There is no pending backend cleanup to retry.': 'Aucun nettoyage backend en attente à réessayer.',
    '{{count}}s elapsed': '{{count}} s écoulées',
    'Applying Spectre protections': 'Application des protections Spectre',
    'Keep this screen open while EXO prepares the secure activation handoff.':
      'Gardez cet écran ouvert pendant qu’EXO prépare le transfert d’activation sécurisé.',
    'Preparing Spectre Mode': 'Préparation du mode Spectre',
    'Preparing your Spectre account': 'Préparation de votre compte Spectre',
    'Registering the private account': 'Enregistrement du compte privé',
    'Reserving private activation': 'Réservation de l’activation privée',
    'Changes were rolled back': 'Modifications annulées',
    'Checking private access': 'Vérification de l’accès privé',
    'Choose a new 6-digit PIN': 'Choisissez un nouveau PIN à 6 chiffres',
    'Confirm New PIN': 'Confirmer le nouveau PIN',
    'Connecting your private route': 'Connexion de votre route privée',
    'Enter Current PIN': 'Saisir le PIN actuel',
    'Enter New PIN': 'Saisir le nouveau PIN',
    'Enter your current PIN': 'Saisissez votre PIN actuel',
    'Enter your current PIN before creating a duress PIN':
      'Saisissez votre PIN actuel avant de créer un PIN de contrainte',
    'Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.':
      'La saisie du PIN de contrainte tentera de supprimer les données de compte du backend, d’effacer cet appareil et de vous déconnecter immédiatement.',
    'EXO can continue refreshing chats in the background once Spectre is ready.':
      'EXO peut continuer à actualiser les discussions en arrière-plan une fois Spectre prêt.',
    'EXO has finished switching back from Spectre Mode.':
      'EXO a terminé le retour depuis le mode Spectre.',
    'EXO is validating your Spectre account and required protections before the private handoff starts.':
      'EXO vérifie votre compte Spectre et les protections requises avant le début du transfert privé.',
    'EXO is verifying the wallet session it uses for private network services.':
      'EXO vérifie la session de portefeuille utilisée pour les services de réseau privé.',
    'EXO stopped the Spectre flow and restored the previous safe state where it could.':
      'EXO a interrompu le processus Spectre et a restauré l’état sécurisé précédent dans la mesure du possible.',
    'Failed to change PIN': 'Impossible de modifier le PIN',
    'Failed to disable Spectre Mode': 'Impossible de désactiver le mode Spectre',
    'Failed to verify PIN': 'Impossible de vérifier le PIN',
    'Finalizing Spectre shutdown': 'Finalisation de l’arrêt de Spectre',
    'Finishing the private handoff': 'Finalisation du transfert privé',
    'Getting Spectre ready': 'Préparation de Spectre',
    'Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.':
      'Gardez cet écran ouvert pendant qu’EXO applique les changements de confidentialité nécessaires au mode Spectre.',
    'Keep this screen open while EXO restores your regular wallet and security settings.':
      'Gardez cet écran ouvert pendant qu’EXO restaure votre portefeuille principal et vos paramètres de sécurité.',
    'Loading your Spectre setup': 'Chargement de votre configuration Spectre',
    'New PIN must be different from current PIN': 'Le nouveau PIN doit être différent du PIN actuel',
    'PINs do not match': 'Les PIN ne correspondent pas',
    'Preparing your private workspace': 'Préparation de votre espace privé',
    'Preparing your Spectre setup': 'Préparation de votre configuration Spectre',
    'Re-enter your new PIN to confirm': 'Saisissez de nouveau votre nouveau PIN pour confirmer',
    'Restoring network and cleanup': 'Restauration du réseau et nettoyage',
    'Restoring privacy protections': 'Restauration des protections de confidentialité',
    'Restoring your main profile': 'Restauration de votre profil principal',
    'Review the failed step below before trying again.':
      'Examinez l’étape ayant échoué ci-dessous avant de réessayer.',
    'Spectre cannot finish until Tor is connected. Try bridges or a different network.':
      'Spectre ne peut pas terminer tant que Tor n’est pas connecté. Essayez des ponts ou un autre réseau.',
    'Spectre chats and contacts are still refreshing in the background.':
      'Les discussions et contacts Spectre se mettent encore à jour en arrière-plan.',
    'Spectre needs your attention': 'Spectre requiert votre attention',
    'Spectre protections are active': 'Les protections Spectre sont actives',
    'Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.':
      'Spectre désactive les appels et les actions crypto ; supprime les jetons push ; impose Tor, le PIN de contrainte, l’effacement en cas d’échec, la protection des captures d’écran et la confidentialité du sélecteur d’apps ; et définit par défaut des minuteurs de disparition courts pour les nouveaux messages.',
    'Switching back to your main wallet': 'Retour à votre portefeuille principal',
    'Switching to your Spectre identity': 'Basculement vers votre identité Spectre',
    'This screen updates automatically as each Spectre stage finishes.':
      'Cet écran se met automatiquement à jour à la fin de chaque étape Spectre.',
    'Tor could not connect': 'Tor n’a pas pu se connecter',
    'Tor must be online before Spectre can switch identities and continue.':
      'Tor doit être en ligne avant que Spectre puisse changer d’identité et continuer.',
    'Tor routing applies only inside Spectra. Device-wide network routing is unchanged.':
      'Le routage Tor ne s’applique qu’à l’intérieur de Spectra. Le routage réseau à l’échelle de l’appareil reste inchangé.',
    'Verify Primary PIN': 'Vérifier le PIN principal',
    'Verify your identity to change PIN': 'Vérifiez votre identité pour modifier le PIN',
    'Verifying private access': 'Vérification de l’accès privé',
    'Your main wallet is restored': 'Votre portefeuille principal est restauré',
    'Your PIN has been changed successfully.': 'Votre PIN a été modifié avec succès.',
    'Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.':
      'Votre portefeuille Spectre et le tunnel Tor sont prêts. Les discussions et contacts peuvent finir de se mettre à jour en arrière-plan.',
    'Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.':
      'Votre portefeuille Spectre est actif. EXO change l’espace de stockage et charge les données locales pour ce profil privé.',
    'Erase Account Permanently?': 'Effacer définitivement le compte ?',
    'This cannot be undone. Backend data and local sensitive data will be erased for this account.':
      'Cette action est irréversible. Les données backend et les données locales sensibles de ce compte seront effacées.',
    'Erase Everything': 'Tout effacer',
    'Cloud Session Required': 'Session cloud requise',
    'Unlock or reconnect to the backend before deleting the account.':
      'Déverrouillez l’app ou reconnectez-vous au backend avant de supprimer le compte.',
    'Account deletion failed. Try again after checking your connection.':
      'La suppression du compte a échoué. Réessayez après avoir vérifié votre connexion.',
    'Account Deletion Failed': 'Échec de la suppression du compte',
    'Confirm Account Deletion': 'Confirmer la suppression du compte',
    'Enter your PIN to continue to the final destructive confirmation.':
      'Saisissez votre PIN pour passer à la confirmation finale irréversible.',
    'Account Deletion': 'Suppression du compte',
    '{{count}}s elapsed - this may take 30-240 seconds with bridges':
      '{{count}} s écoulées — cela peut prendre 30 à 240 secondes avec des ponts',
  },
  profile: {
    'Show VDF progress': 'Afficher la progression VDF',
    'Proofs still run in the background when this is off.':
      'Les preuves s’exécutent toujours en arrière-plan lorsque cette option est désactivée.',
    'Public name contains unsupported characters':
      'Le nom public contient des caractères non pris en charge',
    'Public name is too large': 'Le nom public est trop long',
    'Public name must be {{max}} characters or fewer':
      'Le nom public doit comporter au plus {{max}} caractères',
    'Unable to use this public name': 'Impossible d’utiliser ce nom public',
    'Change Photo': 'Modifier la photo',
    'Chat bundle not on server — others cannot find you':
      'Le lot de discussion n’est pas sur le serveur — les autres ne peuvent pas vous trouver',
    'Chat bundle registered on server': 'Lot de discussion enregistré sur le serveur',
    'Chat identity not available. Please restart the app.':
      'Identité de discussion indisponible. Veuillez redémarrer l’app.',
    'Checking chat bundle...': 'Vérification du lot de discussion...',
    'Checking identity link...': 'Vérification du lien d’identité...',
    'Could not link identity. Please try again.':
      'Impossible de lier l’identité. Veuillez réessayer.',
    'Could not refresh session. Check your connection.':
      'Impossible d’actualiser la session. Vérifiez votre connexion.',
    'Edit Profile': 'Modifier le profil',
    'Identity linked to server': 'Identité liée au serveur',
    'Identity not linked — messaging is disabled': 'Identité non liée — la messagerie est désactivée',
    'Member since {{date}}': 'Membre depuis {{date}}',
    'Security Status': 'État de sécurité',
    'Server session active': 'Session serveur active',
    'Server session expired — features may not work':
      'Session serveur expirée — certaines fonctionnalités peuvent ne pas fonctionner',
    'This name is visible to your contacts': 'Ce nom est visible par vos contacts',
    'Unknown error': 'Erreur inconnue',
    'Profile photos cannot be changed while Spectre Mode is active.':
      'Les photos de profil ne peuvent pas être modifiées lorsque le mode Spectre est actif.',
    'Photo disabled in Spectre Mode': 'Photo désactivée en mode Spectre',
    'Account Label': 'Libellé du compte',
    'Name this account': 'Nommez ce compte',
    'This is a local label to help you identify this account. It is not your public chat name.':
      'Ce libellé local vous aide à identifier ce compte. Ce n’est pas votre nom public de discussion.',
    'Public profile names cannot be edited while Spectre Mode is active.':
      'Les noms de profil publics ne peuvent pas être modifiés lorsque le mode Spectre est actif.',
    'Public Name': 'Nom public',
    'Public name contains invalid text.': 'Le nom public contient du texte non valide.',
    'Public name contains unsupported control characters.':
      'Le nom public contient des caractères de contrôle non pris en charge.',
    'Public name contains unsupported direction controls.':
      'Le nom public contient des contrôles directionnels non pris en charge.',
    'Public name is too large when encoded.': 'Le nom public est trop long une fois encodé.',
    'Public name must be 80 characters or fewer.':
      'Le nom public doit comporter au plus 80 caractères.',
    'Optional public name for chats': 'Nom public facultatif pour les discussions',
    'Publication needs attention. Retry when you are online.':
      'La publication requiert votre attention. Réessayez lorsque vous êtes en ligne.',
    Published: 'Publié',
    'Publishing public name...': 'Publication du nom public...',
    'Public profile metadata is read-only while Spectre Mode is active.':
      'Les métadonnées du profil public sont en lecture seule lorsque le mode Spectre est actif.',
    'Retry Publication': 'Réessayer la publication',
    'This repeatable name is public chat-directory metadata. People who have not saved you under another name can see it in chats and contacts. It appears in notifications only when both sides enable that privacy trade-off.':
      'Ce nom réutilisable est une métadonnée publique de l’annuaire de discussions. Les personnes qui ne vous ont pas enregistré sous un autre nom peuvent le voir dans les discussions et les contacts. Il apparaît dans les notifications uniquement lorsque les deux parties activent ce compromis de confidentialité.',
    'This public name is saved on this device and will publish when your chat identity is linked.':
      'Ce nom public est enregistré sur cet appareil et sera publié lorsque votre identité de discussion sera liée.',
    'Waiting for chat readiness. Automatic retries are scheduled.':
      'En attente de la disponibilité de la discussion. Des tentatives automatiques sont planifiées.',
    'Save Public Name': 'Enregistrer le nom public',
    'Preparing secure contact invitation…': 'Préparation de l’invitation de contact sécurisée…',
    'Preparing secure contact card…': 'Préparation de la carte de contact sécurisée…',
    'Preparing secure share…': 'Préparation du partage sécurisé…',
    'Create a one-time card to show your QR code.':
      'Créez une carte à usage unique pour afficher votre code QR.',
    'Create one-time contact card': 'Créer une carte de contact à usage unique',
    'Publish for 5 minutes': 'Publier pendant 5 minutes',
    'Your account is discoverable for 5 minutes.':
      'Votre compte est découvrable pendant 5 minutes.',
    'Your account is already discoverable.': 'Votre compte est déjà découvrable.',
    'Your one-time contact card is still active.':
      'Votre carte de contact à usage unique est encore active.',
    'Open one-time contact card': 'Ouvrir la carte de contact à usage unique',
    'One-time contact card ready': 'Carte de contact à usage unique prête',
    'Expires in {{minutes}} min': 'Expire dans {{minutes}} min',
    'One-time contact card': 'Carte de contact à usage unique',
    'Share this QR code before it expires.':
      'Partagez ce QR code avant son expiration.',
    'A one-time contact card expires after one hour and can be used once.':
      'Une carte de contact à usage unique expire après une heure et ne peut être utilisée qu’une fois.',
    'Chat identity is not ready yet.': 'L’identité de chat n’est pas encore prête.',
  },
  tor: {
    'Connected to Spectre': 'Connecté à Spectre',
  },
} satisfies LocaleTranslationOverrides

export default translations

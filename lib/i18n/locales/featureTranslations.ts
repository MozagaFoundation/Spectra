/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LanguageTranslations } from '../schema'
import { localProfileVdfTranslations } from './localProfileVdfTranslations'
import { walletIndexTranslations } from './walletIndexTranslations'

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

const en: FeatureNamespaceTranslations = {
  common: {
    'Snowflake bootstrap privacy notice': 'Snowflake bootstrap privacy notice',
    'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.':
      'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.',
    'I understand': 'I understand',
    'Please try again.': 'Please try again.',
    'Cancel': 'Cancel',
    'Active': 'Active',
    'Switching...': 'Switching...',
    'Create': 'Create',
    'Import': 'Import',
    'Use': 'Use',
    'Erasing...': 'Erasing...',
    'Could not switch EXO account': 'Could not switch EXO account',
    'Unable to switch EXO account': 'Unable to switch EXO account',
    'Switching EXO account...': 'Switching EXO account...',
    'Transparent EXO accounts are restored from your recovery phrase.':
      'Transparent EXO accounts are restored from your recovery phrase.',
    'Failed to generate account': 'Failed to generate account',
    'Confirm that you backed up the recovery phrase before using this EXO account.':
      'Confirm that you backed up the recovery phrase before using this EXO account.',
    'Failed to save EXO account': 'Failed to save EXO account',
    'Regenerate': 'Regenerate',
    'Create EXO Account': 'Create EXO Account',
    'Create a new transparent EXO account for work, friends, or another chat identity.':
      'Create a new transparent EXO account for work, friends, or another chat identity.',
    'Root account required': 'Root account required',
    'Each recovery phrase restores up to 5 transparent EXO accounts.':
      'Each recovery phrase restores up to 5 transparent EXO accounts.',
    'Switch to your root EXO account to create transparent EXO accounts.':
      'Switch to your root EXO account to create transparent EXO accounts.',
    'Generating secure keys...': 'Generating secure keys...',
    'New EXO Account': 'New EXO Account',
    'Never share your recovery phrase': 'Never share your recovery phrase',
    'This recovery phrase is shown only now. Store it offline before saving the new EXO account.':
      'This recovery phrase is shown only now. Store it offline before saving the new EXO account.',
    'Recovery Phrase': 'Recovery Phrase',
    'Hide': 'Hide',
    'Tap to reveal your recovery phrase': 'Tap to reveal your recovery phrase',
    'Make sure no one is watching your screen': 'Make sure no one is watching your screen',
    'I backed up this recovery phrase offline.': 'I backed up this recovery phrase offline.',
    'Save and Use Account': 'Save and Use Account',
    'Invalid recovery phrase': 'Invalid recovery phrase',
    'This EXO account already exists on this device.': 'This EXO account already exists on this device.',
    'Failed to import account': 'Failed to import account',
    'Import EXO Account': 'Import EXO Account',
    'Import a transparent EXO recovery phrase into this unlocked root vault.':
      'Import a transparent EXO recovery phrase into this unlocked root vault.',
    'You can import up to 5 transparent EXO accounts from one recovery phrase.':
      'You can import up to 5 transparent EXO accounts from one recovery phrase.',
    'Switch to your root EXO account to import transparent EXO accounts.':
      'Switch to your root EXO account to import transparent EXO accounts.',
    'Security Notice': 'Security Notice',
    'Only import a recovery phrase you control. Imported accounts can send and receive chats independently.':
      'Only import a recovery phrase you control. Imported accounts can send and receive messages independently.',
    'Account Name (Optional)': 'Account Name (Optional)',
    'Work, Friends, Personal...': 'Work, Friends, Personal...',
    'Importing...': 'Importing...',
    'Import and Use Account': 'Import and Use Account',
    'Account ready': 'Account ready',
    'Connection problem': 'Connection problem',
    'Connecting securely...': 'Connecting securely...',
    'Root account': 'Root account',
    'EXO Account {{number}}': 'EXO Account {{number}}',
    'Chat identity did not finish switching. Try reconnecting.':
      'Chat identity did not finish switching. Try reconnecting.',
    'Chat identity is not ready for this EXO account.':
      'Chat identity is not ready for this EXO account.',
    'Could not verify the server session for this EXO account.':
      'Could not verify the server session for this EXO account.',
    'Publishing chat bundle...': 'Publishing chat bundle...',
    'Could not publish chat bundle.': 'Could not publish chat bundle.',
    'Chat bundle is still missing from the server.': 'Chat bundle is still missing from the server.',
    'Could not link this chat identity to the server.':
      'Could not link this chat identity to the server.',
    'Could not prepare this EXO account.': 'Could not prepare this EXO account.',
    'Could not switch back to the root EXO account.':
      'Could not switch back to the root EXO account.',
  },
  crypto: {
    'Please try again.': 'Please try again.',
    'Enter a valid amount': 'Enter a valid amount',
    'Copied!': 'Copied!',
    'Network State': 'Network State',
    'Block': 'Block',
    'Amount': 'Amount',
    'Gas Fee (est.)': 'Gas Fee (est.)',
    'Network Fee': 'Network Fee',
    'Send': 'Send',
    '+ gas in': '+ gas in',
    '+ gas paid in': '+ gas paid in',
    'Total': 'Total',
    'Contribution': 'Contribution',
    'Contribution Treasury': 'Contribution Treasury',
    'Contribution Transaction Hash': 'Contribution Transaction Hash',
    'Contribution included': 'Contribution included',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      'A 0.1% contribution is included, capped at $10 equivalent.',
    'Wallet contribution notice': 'Wallet contribution notice',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'Contribution quote unavailable. Please refresh market prices and try again.',
    'Insufficient balance': 'Insufficient balance',
    'Insufficient balance for amount, contribution, and network fees.':
      'Insufficient balance for amount, contribution, and network fees.',
    'Mozaga': 'Mozaga',
    'Ether': 'Ether',
    'Copy': 'Copy',
    'Share': 'Share',
    'Etherscan': 'Etherscan',
  },
  settings: {
    'Settings': 'Settings',
    'Appearance': 'Appearance',
    'Security': 'Security',
    'Could not switch to root EXO account': 'Could not switch to root EXO account',
    'Erase EXO Account': 'Erase EXO Account',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'Erase',
    'Could not erase EXO account': 'Could not erase EXO account',
    'EXO Accounts': 'EXO Accounts',
    'Create, switch, or erase transparent EXO accounts.':
      'Create, switch, or erase transparent EXO accounts.',
    'Maximum of 5 transparent EXO accounts reached.':
      'Maximum of 5 transparent EXO accounts reached.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'Root',
    'Erase account': 'Erase account',
    'Show other accounts': 'Show other accounts',
    'Hide other accounts': 'Hide other accounts',
    'Tor routes supported Spectra network requests only; device-wide network routing is unchanged.\n\nWhile Tor is active, calls are unavailable, messaging polls for updates, supported requests and media uploads can be slower, push registration is disabled, and links opened in other apps are outside Spectra’s Tor boundary. When Spectre Mode is off, Tor stays active for up to one hour in the background before stopping.\n\nDo you want to enable Tor mode?':
      'Tor routes supported Spectra network requests only; device-wide network routing is unchanged.\n\nWhile Tor is active, calls are unavailable, messaging polls for updates, supported requests and media uploads can be slower, push registration is disabled, and links opened in other apps are outside Spectra’s Tor boundary. When Spectre Mode is off, Tor stays active for up to one hour in the background before stopping.\n\nDo you want to enable Tor mode?',
    'Calls are unavailable. Messages poll for updates. Supported requests can be slower.':
      'Calls are unavailable. Messages poll for updates. Supported requests can be slower.',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.',
    'Prepare an expendable Spectre account before continuing.':
      'Prepare an expendable Spectre account before continuing.',
    'Tor must be connected before preparing an expendable Spectre account.':
      'Tor must be connected before preparing an expendable Spectre account.',
    '24-hour limit reached. Try again in {{time}}.':
      '24-hour limit reached. Try again in {{time}}.',
    '24-hour limit reached. Resets {{date}}.':
      '24-hour limit reached. Resets {{date}}.',
    '24-hour limit reached.': '24-hour limit reached.',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.',
    'Available now': 'Available now',
    'This expendable Spectre wallet expires in {{time}} and will be removed from the server when the session closes or expires.':
      'This expendable Spectre wallet expires in {{time}} and will be removed from the server when the session closes or expires.',
    'Failed to disable an expired Spectre session':
      'Failed to disable an expired Spectre session',
    'Lock Account': 'Lock Account',
    'Log Out': 'Log Out',
  },
  contacts: {
    'EXO Account': 'EXO Account',
    'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.':
      'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.',
    'Adding to': 'Adding to',
    'This contact will be saved under this EXO account on this device.':
      'This contact will be saved under this EXO account on this device.',
    'Selected': 'Selected',
    'Switching...': 'Switching...',
    'via {{account}}': 'via {{account}}',
  },
  chat: {
    'Start Secret Chat': 'Start Secret Chat',
    'Choose a contact or start with an address': 'Choose a contact or start with an address',
    'Starting from {{account}}': 'Starting from {{account}}',
    'Add by address': 'Add by address',
    'Add a contact and open a private chat': 'Add a contact and open a private chat',
    'Start Chat': 'Start Chat',
    'Scan, add, and start a private chat': 'Scan, add, and start a private chat',
    'Select from contacts': 'Select from contacts',
    'No saved contacts yet': 'No saved contacts yet',
    'Add someone by address or scan their QR code to start.':
      'Add someone by address or scan their QR code to start.',
    'Starting chat...': 'Starting chat...',
    'Unable to start chat': 'Unable to start chat',
    'Checking for new messages': 'Checking for new messages',
    'Preparing secure chat': 'Preparing secure chat',
    'Loading your chats': 'Loading your chats',
    'Connecting': 'Connecting',
    'Checking the mailbox': 'Checking the mailbox',
    'Decrypting messages': 'Decrypting messages',
    'You\'re up to date': 'You\'re up to date',
  },
  markets: {
    'Mozaga Markets': 'Mozaga Markets',
    'Trade, predict, fund and provide liquidity': 'Trade, predict, fund and provide liquidity',
    'Protocol fees collected': 'Protocol fees collected',
    'Trending Markets': 'Trending Markets',
    'Live Campaigns': 'Live Campaigns',
    'Hot Predictions': 'Hot Predictions',
    'Explore': 'Explore',
    'See all': 'See all',
    'Sales': 'Sales',
    'Pools': 'Pools',
    'Vol': 'Vol',
    'of': 'of',
    '{{count}}m left': '{{count}}m left',
    '{{count}}h left': '{{count}}h left',
    '{{count}}d left': '{{count}}d left',
    'No description': 'No description',
    'No order activity yet': 'No order activity yet',
    'Untitled campaign': 'Untitled campaign',
    '{{count}} backers': '{{count}} backers',
  },
}

function completeFeatureTranslations(
  translations: FeatureNamespaceTranslations,
): FeatureNamespaceTranslations {
  return {
    common: { ...en.common, ...translations.common },
    chat: { ...en.chat, ...translations.chat },
    contacts: { ...en.contacts, ...translations.contacts },
    crypto: { ...en.crypto, ...translations.crypto },
    markets: { ...en.markets, ...translations.markets },
    settings: { ...en.settings, ...translations.settings },
  }
}

const es = completeFeatureTranslations({
  common: {
    'Please try again.': 'Inténtalo de nuevo.',
    'Blockchain': 'Blockchain',
    '{{network}} Wallet': 'Cartera {{network}}',
    'Your {{network}} Address': 'Tu dirección {{network}}',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      'Comparte este código QR o dirección para recibir {{symbol}} en {{network}}. Envía solo activos de esta red a esta dirección.',
    'Connected': 'Conectado',
    'Signature': 'Firma',
    'Tokens on Mozaga': 'Tokens en Mozaga',
    'Recent Transactions': 'Transacciones recientes',
    'Loading transactions...': 'Cargando transacciones...',
    'Create': 'Crear',
    'Import': 'Importar',
    'Use': 'Usar',
    'Erasing...': 'Borrando...',
    'Could not switch EXO account': 'No se pudo cambiar de cuenta EXO',
    'Unable to switch EXO account': 'No se puede cambiar de cuenta EXO',
    'Switching EXO account...': 'Cambiando de cuenta EXO...',
    'Transparent EXO accounts are restored from your recovery phrase.':
      'Transparent EXO accounts are restored from your recovery phrase.',
    'Failed to generate account': 'No se pudo generar la cuenta',
    'Confirm that you backed up the recovery phrase before using this EXO account.':
      'Confirma que guardaste una copia de la frase de recuperación antes de usar esta cuenta EXO.',
    'Failed to save EXO account': 'No se pudo guardar la cuenta EXO',
    'Regenerate': 'Generar de nuevo',
    'Create EXO Account': 'Crear cuenta EXO',
    'Create a new transparent EXO account for work, friends, or another chat identity.':
      'Crea una nueva cuenta EXO transparente para el trabajo, amistades u otra identidad de chat.',
    'Root account required': 'Root account required',
    'You can import up to 5 transparent EXO accounts from one recovery phrase.':
      'You can import up to 5 transparent EXO accounts from one recovery phrase.',
    'Switch to your root EXO account to create transparent EXO accounts.':
      'Switch to your root EXO account to create transparent EXO accounts.',
    'Generating secure keys...': 'Generando claves seguras...',
    'New EXO Account': 'Nueva cuenta EXO',
    'Never share your recovery phrase': 'Nunca compartas tu frase de recuperación',
    'This recovery phrase is shown only now. Store it offline before saving the new EXO account.':
      'Esta frase de recuperación se muestra solo ahora. Guárdala sin conexión antes de guardar la nueva cuenta EXO.',
    'Recovery Phrase': 'Frase de recuperación',
    'Hide': 'Ocultar',
    'Tap to reveal your recovery phrase': 'Toca para mostrar tu frase de recuperación',
    'Make sure no one is watching your screen': 'Asegúrate de que nadie esté mirando tu pantalla',
    'I backed up this recovery phrase offline.': 'Guardé esta frase de recuperación sin conexión.',
    'Save and Use Account': 'Guardar y usar cuenta',
    'Invalid recovery phrase': 'Frase de recuperación no válida',
    'This EXO account already exists on this device.': 'Esta cuenta EXO ya existe en este dispositivo.',
    'Failed to import account': 'No se pudo importar la cuenta',
    'Import EXO Account': 'Importar cuenta EXO',
    'Import a transparent EXO recovery phrase into this unlocked root vault.':
      'Import a transparent EXO recovery phrase into this unlocked root vault.',
    'Each recovery phrase restores up to 5 transparent EXO accounts.':
      'Each recovery phrase restores up to 5 transparent EXO accounts.',
    'Switch to your root EXO account to import transparent EXO accounts.':
      'Switch to your root EXO account to import transparent EXO accounts.',
    'Security Notice': 'Aviso de seguridad',
    'Only import a recovery phrase you control. Imported accounts can send and receive chats independently.':
      'Importa solo una frase de recuperación que controles. Las cuentas importadas pueden enviar y recibir chats de forma independiente.',
    'Account Name (Optional)': 'Nombre de cuenta (opcional)',
    'Work, Friends, Personal...': 'Trabajo, Amistades, Personal...',
    'Importing...': 'Importando...',
    'Import and Use Account': 'Importar y usar cuenta',
    'Account ready': 'Cuenta lista',
    'Connection problem': 'Problema de conexión',
    'Connecting securely...': 'Conectando de forma segura...',
    'Root account': 'Cuenta raíz',
    'EXO Account {{number}}': 'Cuenta EXO {{number}}',
    'Chat identity did not finish switching. Try reconnecting.':
      'La identidad de chat no terminó de cambiar. Intenta reconectar.',
    'Chat identity is not ready for this EXO account.':
      'La identidad de chat no está lista para esta cuenta EXO.',
    'Could not verify the server session for this EXO account.':
      'No se pudo verificar la sesión del servidor para esta cuenta EXO.',
    'Publishing chat bundle...': 'Publicando paquete de chat...',
    'Could not publish chat bundle.': 'No se pudo publicar el paquete de chat.',
    'Chat bundle is still missing from the server.': 'El paquete de chat sigue faltando en el servidor.',
    'Could not link this chat identity to the server.':
      'No se pudo vincular esta identidad de chat con el servidor.',
    'Could not prepare this EXO account.': 'No se pudo preparar esta cuenta EXO.',
    'Could not switch back to the root EXO account.':
      'No se pudo volver a la cuenta EXO raíz.',
  },
  crypto: {
    'Please try again.': 'Inténtalo de nuevo.',
    'Enter a valid amount': 'Ingresa un importe válido',
    'Copied!': 'Copiado',
    'Network State': 'Estado de la red',
    'Block': 'Bloque',
    'Amount': 'Importe',
    'Gas Fee (est.)': 'Comisión de gas (est.)',
    'Network Fee': 'Comisión de red',
    'Send': 'Enviar',
    '+ gas in': '+ gas en',
    '+ gas paid in': '+ gas pagado en',
    'Total': 'Total',
    'Contribution': 'Contribución',
    'Contribution Treasury': 'Tesorería de contribución',
    'Contribution Transaction Hash': 'Hash de transacción de contribución',
    'Contribution included': 'Contribución incluida',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      'Se incluye una contribución del 0,1 %, con tope equivalente a 10 USD.',
    'Wallet contribution notice': 'Aviso de contribución de carteras',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'Las transacciones salientes incluyen una contribución adicional del 0,1 %, con un tope de 10 USD por transacción. Esto ayuda a mantener los servidores y a mejorar la infraestructura o el software. Si no estás de acuerdo con esta donación, no uses Carteras.',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'No se pudo calcular la contribución. Actualiza los precios de mercado e inténtalo de nuevo.',
    'Insufficient balance': 'Saldo insuficiente',
    'Insufficient balance for amount, contribution, and network fees.':
      'Saldo insuficiente para el importe, la contribución y las comisiones de red.',
    'Mozaga': 'Mozaga',
    'Ether': 'Ether',
    'Copy': 'Copiar',
    'Share': 'Compartir',
    'Etherscan': 'Etherscan',
  },
  settings: {
    'Settings': 'Configuración',
    'Appearance': 'Apariencia',
    'Security': 'Seguridad',
    'Could not switch to root EXO account': 'No se pudo cambiar a la cuenta EXO raíz',
    'Erase EXO Account': 'Borrar cuenta EXO',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'Borrar',
    'Could not erase EXO account': 'No se pudo borrar la cuenta EXO',
    'EXO Accounts': 'Cuentas EXO',
    'Create, switch, or erase transparent EXO accounts.':
      'Crea, cambia o borra cuentas EXO transparentes.',
    'Maximum of 5 transparent EXO accounts reached.':
      'Se alcanzó el máximo de 5 cuentas EXO transparentes.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'Raíz',
    'Erase account': 'Borrar cuenta',
    'Show other accounts': 'Mostrar otras cuentas',
    'Hide other accounts': 'Ocultar otras cuentas',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'Se prepara ahora una cartera Spectre desechable nueva y un token de activación ciego. El canje espera hasta que Tor esté conectado.',
    'Prepare an expendable Spectre account before continuing.':
      'Prepara una cuenta Spectre desechable antes de continuar.',
    'Tor must be connected before preparing an expendable Spectre account.':
      'Tor debe estar conectado antes de preparar una cuenta Spectre desechable.',
    '24-hour limit reached. Try again in {{time}}.':
      'Límite de 24 horas alcanzado. Inténtalo de nuevo en {{time}}.',
    '24-hour limit reached. Resets {{date}}.':
      'Límite de 24 horas alcanzado. Se restablece el {{date}}.',
    '24-hour limit reached.': 'Límite de 24 horas alcanzado.',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{remaining}} de {{total}} activaciones Spectre desechables disponibles. Máx. 1 cada 24 horas.',
    'Available now': 'Disponible ahora',
    'This expendable Spectre wallet expires in {{time}} and will be removed from the server when the session closes or expires.':
      'Esta cartera Spectre desechable vence en {{time}} y se eliminará del servidor cuando la sesión se cierre o expire.',
    'Failed to disable an expired Spectre session':
      'No se pudo desactivar una sesión Spectre expirada',
    'Lock Account': 'Bloquear cuenta',
    'Log Out': 'Cerrar sesión',
  },
  contacts: {
    'EXO Account': 'Cuenta EXO',
    'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.':
      'Ingresa la dirección poscuántica de la persona que quieres agregar. Debe haber compartido su dirección contigo.',
    'Adding to': 'Agregando a',
    'This contact will be saved under this EXO account on this device.':
      'Este contacto se guardará bajo esta cuenta EXO en este dispositivo.',
    'Selected': 'Seleccionado',
    'Switching...': 'Cambiando...',
    'via {{account}}': 'vía {{account}}',
  },
  chat: {
    'Start Secret Chat': 'Iniciar chat secreto',
    'Choose a contact or start with an address': 'Elige un contacto o empieza con una dirección',
    'Starting from {{account}}': 'Iniciando desde {{account}}',
    'Add by address': 'Agregar por dirección',
    'Add a contact and open a private chat': 'Agrega un contacto y abre un chat privado',
    'Start Chat': 'Iniciar chat',
    'Scan, add, and start a private chat': 'Escanea, agrega e inicia un chat privado',
    'Select from contacts': 'Seleccionar de contactos',
    'No saved contacts yet': 'Aún no hay contactos guardados',
    'Add someone by address or scan their QR code to start.':
      'Agrega a alguien por dirección o escanea su código QR para empezar.',
    'Starting chat...': 'Iniciando chat...',
    'Unable to start chat': 'No se puede iniciar el chat',
  },
  markets: {
    'Mozaga Markets': 'Mercados Mozaga',
    'Trade, predict, fund and provide liquidity': 'Opera, predice, financia y aporta liquidez',
    'Protocol fees collected': 'Comisiones de protocolo recaudadas',
    'Trending Markets': 'Mercados en tendencia',
    'Live Campaigns': 'Campañas activas',
    'Hot Predictions': 'Predicciones destacadas',
    'Explore': 'Explorar',
    'Primary Market': 'Mercado primario',
    'Token Sales': 'Ventas de tokens',
    'Prediction': 'Predicción',
    'Bet on Outcomes': 'Apostar por resultados',
    'Escrow': 'Depósito en garantía',
    'P2P Trading': 'Comercio P2P',
    'Campaigns': 'Campañas',
    'Crowdfunding': 'Financiación colectiva',
    'AMM Pools': 'Pools AMM',
    'Swap & Liquidity': 'Intercambio y liquidez',
    'See all': 'Ver todo',
    'Sales': 'Ventas',
    'Pools': 'Pools',
    'Vol': 'Vol',
    'all': 'Todo',
    'politics': 'Política',
    'crypto': 'Cripto',
    'sports': 'Deportes',
    'finance': 'Finanzas',
    'science': 'Ciencia',
    'entertainment': 'Entretenimiento',
    'other': 'Otro',
    'Volume': 'Volumen',
    'Trades': 'Operaciones',
    'My Positions': 'Mis posiciones',
    'No markets found': 'No se encontraron mercados',
    'No active prediction markets yet': 'Aún no hay mercados de predicción activos',
    'No active markets in "{{category}}"': 'No hay mercados activos en "{{category}}"',
    'Loading markets...': 'Cargando mercados...',
    'of': 'de',
    '{{count}}m left': 'Quedan {{count}} min',
    '{{count}}h left': 'Quedan {{count}} h',
    '{{count}}d left': 'Quedan {{count}} d',
    'No description': 'Sin descripción',
    'No order activity yet': 'Aún no hay actividad de órdenes',
    'Untitled campaign': 'Campaña sin título',
    '{{count}} backers': '{{count}} patrocinadores',
  },
})

const ar = completeFeatureTranslations({
  common: {
    'Blockchain': 'البلوك تشين',
    '{{network}} Wallet': 'محفظة {{network}}',
    'Your {{network}} Address': 'عنوان {{network}} الخاص بك',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      'شارك رمز QR أو العنوان هذا لتلقي {{symbol}} على {{network}}. أرسل إلى هذا العنوان أصول هذه الشبكة فقط.',
    'Connected': 'متصل',
    'Signature': 'التوقيع',
    'Tokens on Mozaga': 'الرموز على Mozaga',
    'Recent Transactions': 'المعاملات الأخيرة',
    'Loading transactions...': 'جاري تحميل المعاملات...',
  },
  crypto: {
    'Please try again.': 'يرجى المحاولة مرة أخرى.',
    'Enter a valid amount': 'أدخل مبلغًا صالحًا',
    'Copied!': 'تم النسخ',
    'Network State': 'حالة الشبكة',
    'Block': 'الكتلة',
    'Amount': 'المبلغ',
    'Gas Fee (est.)': 'رسوم الغاز (تقديرية)',
    'Network Fee': 'رسوم الشبكة',
    'Send': 'إرسال',
    '+ gas in': '+ الغاز بعملة',
    '+ gas paid in': '+ الغاز مدفوع بعملة',
    'Total': 'الإجمالي',
    'Contribution': 'مساهمة',
    'Contribution Treasury': 'خزينة المساهمة',
    'Contribution Transaction Hash': 'تجزئة معاملة المساهمة',
    'Contribution included': 'تم تضمين المساهمة',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      'يتم تضمين مساهمة بنسبة 0.1%، بحد أقصى يعادل 10 دولارات.',
    'Wallet contribution notice': 'إشعار مساهمة المحافظ',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'تتضمن المعاملات الصادرة مساهمة إضافية بنسبة 0.1%، بحد أقصى 10 دولارات أمريكية لكل معاملة. يساعد ذلك في صيانة الخوادم وترقية البنية التحتية أو البرامج. إذا كنت لا توافق على هذا التبرع، فلا تستخدم المحافظ.',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'تعذر حساب المساهمة. حدّث أسعار السوق وحاول مرة أخرى.',
    'Insufficient balance': 'الرصيد غير كافٍ',
    'Insufficient balance for amount, contribution, and network fees.':
      'الرصيد غير كافٍ للمبلغ والمساهمة ورسوم الشبكة.',
    'Copy': 'نسخ',
    'Share': 'مشاركة',
  },
  settings: {
    'Could not switch to root EXO account': 'تعذر التبديل إلى حساب EXO الجذر',
    'Erase EXO Account': 'مسح حساب EXO',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'مسح',
    'Could not erase EXO account': 'تعذر مسح حساب EXO',
    'EXO Accounts': 'حسابات EXO',
    'Create, switch, or erase transparent EXO accounts.':
      'أنشئ حسابات EXO شفافة أو بدّل بينها أو امسحها.',
    'Maximum of 5 transparent EXO accounts reached.':
      'تم الوصول إلى الحد الأقصى وهو 5 حسابات EXO شفافة.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'الجذر',
    'Erase account': 'مسح الحساب',
    'Show other accounts': 'إظهار الحسابات الأخرى',
    'Hide other accounts': 'إخفاء الحسابات الأخرى',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'يتم الآن تجهيز محفظة Spectre قابلة للإزالة جديدة ورمز تفعيل أعمى. ينتظر الاسترداد حتى يتصل Tor.',
    'Prepare an expendable Spectre account before continuing.':
      'جهّز حساب Spectre قابلًا للإزالة قبل المتابعة.',
    'Tor must be connected before preparing an expendable Spectre account.':
      'يجب أن يكون Tor متصلًا قبل تجهيز حساب Spectre قابل للإزالة.',
    '24-hour limit reached. Try again in {{time}}.':
      'تم بلوغ حد 24 ساعة. حاول مرة أخرى خلال {{time}}.',
    '24-hour limit reached. Resets {{date}}.':
      'تم بلوغ حد 24 ساعة. تتم إعادة التعيين في {{date}}.',
    '24-hour limit reached.': 'تم بلوغ حد 24 ساعة.',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{remaining}} من {{total}} من عمليات تفعيل Spectre القابلة للإزالة متاحة. الحد الأقصى 1 كل 24 ساعة.',
  },
  markets: {
    'Mozaga Markets': 'أسواق Mozaga',
    'Trade, predict, fund and provide liquidity': 'تداول وتنبأ وموّل ووفّر السيولة',
    'Protocol fees collected': 'رسوم البروتوكول المحصلة',
    'Explore': 'استكشف',
    'Primary Market': 'السوق الأولية',
    'Token Sales': 'مبيعات الرموز',
    'Prediction': 'التوقعات',
    'Bet on Outcomes': 'راهن على النتائج',
    'Escrow': 'الضمان',
    'P2P Trading': 'تداول P2P',
    'Campaigns': 'الحملات',
    'Crowdfunding': 'التمويل الجماعي',
    'AMM Pools': 'مجمعات AMM',
    'Swap & Liquidity': 'التبادل والسيولة',
    'Active': 'نشط',
    'Sales': 'المبيعات',
    'Pools': 'المجمعات',
    'all': 'الكل',
    'politics': 'السياسة',
    'crypto': 'العملات المشفرة',
    'sports': 'الرياضة',
    'finance': 'المال',
    'science': 'العلوم',
    'entertainment': 'الترفيه',
    'other': 'أخرى',
    'Volume': 'الحجم',
    'Trades': 'الصفقات',
    'My Positions': 'مراكزي',
    'No markets found': 'لم يتم العثور على أسواق',
    'No active prediction markets yet': 'لا توجد أسواق توقعات نشطة بعد',
    'No active markets in "{{category}}"': 'لا توجد أسواق نشطة في "{{category}}"',
    'Loading markets...': 'جاري تحميل الأسواق...',
  },
})

const bn = completeFeatureTranslations({
  common: {
    'Blockchain': 'ব্লকচেইন',
    '{{network}} Wallet': '{{network}} ওয়ালেট',
    'Your {{network}} Address': 'আপনার {{network}} ঠিকানা',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      '{{network}}-এ {{symbol}} পেতে এই QR কোড বা ঠিকানা শেয়ার করুন। এই ঠিকানায় শুধুমাত্র এই নেটওয়ার্কের সম্পদ পাঠান।',
    'Connected': 'সংযুক্ত',
    'Signature': 'স্বাক্ষর',
    'Tokens on Mozaga': 'Mozaga-তে টোকেন',
    'Recent Transactions': 'সাম্প্রতিক লেনদেন',
    'Loading transactions...': 'লেনদেন লোড হচ্ছে...',
  },
  crypto: {
    'Please try again.': 'আবার চেষ্টা করুন।',
    'Enter a valid amount': 'একটি বৈধ পরিমাণ লিখুন',
    'Copied!': 'কপি হয়েছে',
    'Network State': 'নেটওয়ার্ক অবস্থা',
    'Block': 'ব্লক',
    'Amount': 'পরিমাণ',
    'Gas Fee (est.)': 'গ্যাস ফি (আনুমানিক)',
    'Network Fee': 'নেটওয়ার্ক ফি',
    'Send': 'পাঠান',
    '+ gas in': '+ গ্যাস',
    '+ gas paid in': '+ গ্যাস পরিশোধ',
    'Total': 'মোট',
    'Contribution': 'অবদান',
    'Contribution Treasury': 'অবদান তহবিল',
    'Contribution Transaction Hash': 'অবদান লেনদেনের হ্যাশ',
    'Contribution included': 'অবদান অন্তর্ভুক্ত',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      '০.১% অবদান অন্তর্ভুক্ত, সর্বোচ্চ ১০ USD সমমূল্য।',
    'Wallet contribution notice': 'ওয়ালেট অবদান বিজ্ঞপ্তি',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'বহির্গামী লেনদেনে অতিরিক্ত ০.১% অবদান থাকে, প্রতি লেনদেনে সর্বোচ্চ ১০ মার্কিন ডলার। এটি সার্ভার রক্ষণাবেক্ষণ এবং অবকাঠামো বা সফটওয়্যার উন্নয়নে সহায়তা করে। আপনি যদি এই অনুদানের সাথে একমত না হন, তাহলে ওয়ালেট ব্যবহার করবেন না।',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'অবদান হিসাব করা যাচ্ছে না। বাজারদর রিফ্রেশ করে আবার চেষ্টা করুন।',
    'Insufficient balance': 'অপর্যাপ্ত ব্যালেন্স',
    'Insufficient balance for amount, contribution, and network fees.':
      'পরিমাণ, অবদান ও নেটওয়ার্ক ফি দেওয়ার জন্য ব্যালেন্স অপর্যাপ্ত।',
    'Copy': 'কপি',
    'Share': 'শেয়ার করুন',
  },
  settings: {
    'Could not switch to root EXO account': 'রুট EXO অ্যাকাউন্টে বদলানো যায়নি',
    'Erase EXO Account': 'EXO অ্যাকাউন্ট মুছুন',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'মুছুন',
    'Could not erase EXO account': 'EXO অ্যাকাউন্ট মুছতে পারেনি',
    'EXO Accounts': 'EXO অ্যাকাউন্ট',
    'Create, switch, or erase transparent EXO accounts.':
      'স্বচ্ছ EXO অ্যাকাউন্ট তৈরি, বদলানো বা মুছুন।',
    'Maximum of 5 transparent EXO accounts reached.':
      'সর্বোচ্চ ৫টি স্বচ্ছ EXO অ্যাকাউন্টে পৌঁছেছে।',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'রুট',
    'Erase account': 'অ্যাকাউন্ট মুছুন',
    'Show other accounts': 'অন্যান্য অ্যাকাউন্ট দেখান',
    'Hide other accounts': 'অন্যান্য অ্যাকাউন্ট লুকান',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'একটি নতুন ব্যবহারশেষে-মোছা যায় এমন Spectre ওয়ালেট এবং ব্লাইন্ডেড অ্যাক্টিভেশন টোকেন এখন প্রস্তুত করা হচ্ছে। রিডেম্পশন Tor সংযুক্ত হওয়া পর্যন্ত অপেক্ষা করে।',
    'Prepare an expendable Spectre account before continuing.':
      'চালিয়ে যাওয়ার আগে একটি ব্যবহারশেষে-মোছা যায় এমন Spectre অ্যাকাউন্ট প্রস্তুত করুন।',
    'Tor must be connected before preparing an expendable Spectre account.':
      'ব্যবহারশেষে-মোছা যায় এমন Spectre অ্যাকাউন্ট প্রস্তুত করার আগে Tor সংযুক্ত থাকতে হবে।',
    '24-hour limit reached. Try again in {{time}}.':
      '২৪-ঘন্টার সীমা পূর্ণ হয়েছে। {{time}} পরে আবার চেষ্টা করুন।',
    '24-hour limit reached. Resets {{date}}.':
      '২৪-ঘন্টার সীমা পূর্ণ হয়েছে। {{date}}-এ রিসেট হবে।',
    '24-hour limit reached.': '২৪-ঘন্টার সীমা পূর্ণ হয়েছে।',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{total}}টির মধ্যে {{remaining}}টি ব্যবহারশেষে-মোছা যায় এমন Spectre অ্যাক্টিভেশন উপলব্ধ। প্রতি ২৪ ঘন্টায় সর্বোচ্চ ১টি।',
  },
  markets: {
    'Mozaga Markets': 'Mozaga বাজার',
    'Trade, predict, fund and provide liquidity': 'ট্রেড করুন, পূর্বাভাস দিন, ফান্ড করুন এবং তারল্য দিন',
    'Protocol fees collected': 'সংগৃহীত প্রোটোকল ফি',
    'Explore': 'অন্বেষণ করুন',
    'Primary Market': 'প্রাথমিক বাজার',
    'Token Sales': 'টোকেন বিক্রয়',
    'Prediction': 'পূর্বাভাস',
    'Bet on Outcomes': 'ফলাফলে বাজি ধরুন',
    'Escrow': 'এসক্রো',
    'P2P Trading': 'P2P ট্রেডিং',
    'Campaigns': 'ক্যাম্পেইন',
    'Crowdfunding': 'ক্রাউডফান্ডিং',
    'AMM Pools': 'AMM পুল',
    'Swap & Liquidity': 'স্ব্যাপ ও তারল্য',
    'Active': 'সক্রিয়',
    'Sales': 'বিক্রয়',
    'Pools': 'পুল',
    'all': 'সব',
    'politics': 'রাজনীতি',
    'crypto': 'ক্রিপ্টো',
    'sports': 'খেলাধুলা',
    'finance': 'অর্থনীতি',
    'science': 'বিজ্ঞান',
    'entertainment': 'বিনোদন',
    'other': 'অন্যান্য',
    'Volume': 'ভলিউম',
    'Trades': 'ট্রেড',
    'My Positions': 'আমার পজিশন',
    'No markets found': 'কোনো বাজার পাওয়া যায়নি',
    'No active prediction markets yet': 'এখনও কোনো সক্রিয় পূর্বাভাস বাজার নেই',
    'No active markets in "{{category}}"': '"{{category}}" বিভাগে কোনো সক্রিয় বাজার নেই',
    'Loading markets...': 'বাজার লোড হচ্ছে...',
  },
})

const de = completeFeatureTranslations({
  common: {
    'Blockchain': 'Blockchain',
    '{{network}} Wallet': '{{network}}-Wallet',
    'Your {{network}} Address': 'Deine {{network}}-Adresse',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      'Teile diesen QR-Code oder diese Adresse, um {{symbol}} auf {{network}} zu empfangen. Sende nur Assets dieses Netzwerks an diese Adresse.',
    'Connected': 'Verbunden',
    'Signature': 'Signatur',
    'Tokens on Mozaga': 'Tokens auf Mozaga',
    'Recent Transactions': 'Letzte Transaktionen',
    'Loading transactions...': 'Transaktionen werden geladen...',
  },
  crypto: {
    'Please try again.': 'Bitte versuche es erneut.',
    'Enter a valid amount': 'Gib einen gültigen Betrag ein',
    'Copied!': 'Kopiert',
    'Network State': 'Netzwerkstatus',
    'Block': 'Block',
    'Amount': 'Betrag',
    'Gas Fee (est.)': 'Gasgebühr (geschätzt)',
    'Network Fee': 'Netzwerkgebühr',
    'Send': 'Senden',
    '+ gas in': '+ Gas in',
    '+ gas paid in': '+ Gas bezahlt in',
    'Total': 'Gesamt',
    'Contribution': 'Beitrag',
    'Contribution Treasury': 'Beitrags-Treasury',
    'Contribution Transaction Hash': 'Beitrags-Transaktionshash',
    'Contribution included': 'Beitrag enthalten',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      'Ein Beitrag von 0,1 % ist enthalten, begrenzt auf 10 USD Gegenwert.',
    'Wallet contribution notice': 'Hinweis zum Wallet-Beitrag',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'Ausgehende Transaktionen enthalten einen zusätzlichen Beitrag von 0,1 %, begrenzt auf 10 USD pro Transaktion. Damit werden Server betrieben und Infrastruktur oder Software verbessert. Wenn Sie mit dieser Spende nicht einverstanden sind, verwenden Sie Wallets nicht.',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'Der Beitrag konnte nicht berechnet werden. Aktualisiere die Marktpreise und versuche es erneut.',
    'Insufficient balance': 'Unzureichendes Guthaben',
    'Insufficient balance for amount, contribution, and network fees.':
      'Unzureichendes Guthaben für Betrag, Beitrag und Netzwerkgebühren.',
    'Copy': 'Kopieren',
    'Share': 'Teilen',
  },
  settings: {
    'Could not switch to root EXO account': 'Wechsel zum Root-EXO-Konto fehlgeschlagen',
    'Erase EXO Account': 'EXO-Konto löschen',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'Löschen',
    'Could not erase EXO account': 'EXO-Konto konnte nicht gelöscht werden',
    'EXO Accounts': 'EXO-Konten',
    'Create, switch, or erase transparent EXO accounts.':
      'Transparente EXO-Konten erstellen, wechseln oder löschen.',
    'Maximum of 5 transparent EXO accounts reached.':
      'Maximum von 5 transparenten EXO-Konten erreicht.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'Root',
    'Erase account': 'Konto löschen',
    'Show other accounts': 'Weitere Konten anzeigen',
    'Hide other accounts': 'Weitere Konten ausblenden',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'Eine neue kurzlebige Spectre-Wallet und ein verblindetes Aktivierungstoken werden jetzt vorbereitet. Die Einlösung wartet, bis Tor verbunden ist.',
    'Prepare an expendable Spectre account before continuing.':
      'Bereite ein kurzlebiges Spectre-Konto vor, bevor du fortfährst.',
    'Tor must be connected before preparing an expendable Spectre account.':
      'Tor muss verbunden sein, bevor ein kurzlebiges Spectre-Konto vorbereitet wird.',
    '24-hour limit reached. Try again in {{time}}.':
      'Das 24-Stunden-Limit ist erreicht. Versuche es in {{time}} erneut.',
    '24-hour limit reached. Resets {{date}}.':
      'Das 24-Stunden-Limit ist erreicht. Wird am {{date}} zurückgesetzt.',
    '24-hour limit reached.': 'Das 24-Stunden-Limit ist erreicht.',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{remaining}} von {{total}} kurzlebigen Spectre-Aktivierungen verfügbar. Max. 1 alle 24 Stunden.',
  },
  markets: {
    'Mozaga Markets': 'Mozaga-Märkte',
    'Trade, predict, fund and provide liquidity': 'Handeln, prognostizieren, finanzieren und Liquidität bereitstellen',
    'Protocol fees collected': 'Eingenommene Protokollgebühren',
    'Explore': 'Entdecken',
    'Primary Market': 'Primärmarkt',
    'Token Sales': 'Token-Verkäufe',
    'Prediction': 'Prognose',
    'Bet on Outcomes': 'Auf Ergebnisse wetten',
    'Escrow': 'Treuhand',
    'P2P Trading': 'P2P-Handel',
    'Campaigns': 'Kampagnen',
    'Crowdfunding': 'Crowdfunding',
    'AMM Pools': 'AMM-Pools',
    'Swap & Liquidity': 'Swap und Liquidität',
    'Active': 'Aktiv',
    'Sales': 'Verkäufe',
    'Pools': 'Pools',
    'all': 'Alle',
    'politics': 'Politik',
    'crypto': 'Krypto',
    'sports': 'Sport',
    'finance': 'Finanzen',
    'science': 'Wissenschaft',
    'entertainment': 'Unterhaltung',
    'other': 'Sonstiges',
    'Volume': 'Volumen',
    'Trades': 'Trades',
    'My Positions': 'Meine Positionen',
    'No markets found': 'Keine Märkte gefunden',
    'No active prediction markets yet': 'Noch keine aktiven Prognosemärkte',
    'No active markets in "{{category}}"': 'Keine aktiven Märkte in "{{category}}"',
    'Loading markets...': 'Märkte werden geladen...',
  },
})

const fr = completeFeatureTranslations({
  common: {
    'Blockchain': 'Blockchain',
    '{{network}} Wallet': 'Portefeuille {{network}}',
    'Your {{network}} Address': 'Votre adresse {{network}}',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      'Partagez ce QR code ou cette adresse pour recevoir {{symbol}} sur {{network}}. Envoyez uniquement des actifs de ce réseau à cette adresse.',
    'Connected': 'Connecté',
    'Signature': 'Signature',
    'Tokens on Mozaga': 'Tokens sur Mozaga',
    'Recent Transactions': 'Transactions récentes',
    'Loading transactions...': 'Chargement des transactions...',
  },
  crypto: {
    'Please try again.': 'Veuillez réessayer.',
    'Enter a valid amount': 'Saisissez un montant valide',
    'Copied!': 'Copié',
    'Network State': 'État du réseau',
    'Block': 'Bloc',
    'Amount': 'Montant',
    'Gas Fee (est.)': 'Frais de gaz (estim.)',
    'Network Fee': 'Frais réseau',
    'Send': 'Envoyer',
    '+ gas in': '+ gaz en',
    '+ gas paid in': '+ gaz payé en',
    'Total': 'Total',
    'Contribution': 'Contribution',
    'Contribution Treasury': 'Trésorerie de contribution',
    'Contribution Transaction Hash': 'Hash de transaction de contribution',
    'Contribution included': 'Contribution incluse',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      'Une contribution de 0,1 % est incluse, plafonnée à l’équivalent de 10 USD.',
    'Wallet contribution notice': 'Avis de contribution des portefeuilles',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'Les transactions sortantes incluent une contribution supplémentaire de 0,1 %, plafonnée à 10 USD par transaction. Cela aide à maintenir les serveurs et à améliorer l’infrastructure ou les logiciels. Si vous n’acceptez pas ce don, n’utilisez pas les portefeuilles.',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'Impossible de calculer la contribution. Actualisez les prix du marché puis réessayez.',
    'Insufficient balance': 'Solde insuffisant',
    'Insufficient balance for amount, contribution, and network fees.':
      'Solde insuffisant pour le montant, la contribution et les frais réseau.',
    'Copy': 'Copier',
    'Share': 'Partager',
  },
  settings: {
    'Could not switch to root EXO account': 'Impossible de passer au compte EXO racine',
    'Erase EXO Account': 'Effacer le compte EXO',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'Effacer',
    'Could not erase EXO account': 'Impossible d’effacer le compte EXO',
    'EXO Accounts': 'Comptes EXO',
    'Create, switch, or erase transparent EXO accounts.':
      'Créez, changez ou effacez des comptes EXO transparents.',
    'Maximum of 5 transparent EXO accounts reached.':
      'Maximum de 5 comptes EXO transparents atteint.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'Racine',
    'Erase account': 'Effacer le compte',
    'Show other accounts': 'Afficher les autres comptes',
    'Hide other accounts': 'Masquer les autres comptes',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'Un nouveau portefeuille Spectre jetable et un jeton d’activation aveugle sont préparés maintenant. L’activation attend que Tor soit connecté.',
    'Prepare an expendable Spectre account before continuing.':
      'Préparez un compte Spectre jetable avant de continuer.',
    'Tor must be connected before preparing an expendable Spectre account.':
      'Tor doit être connecté avant de préparer un compte Spectre jetable.',
    '24-hour limit reached. Try again in {{time}}.':
      'Limite de 24 heures atteinte. Réessayez dans {{time}}.',
    '24-hour limit reached. Resets {{date}}.':
      'Limite de 24 heures atteinte. Réinitialisation le {{date}}.',
    '24-hour limit reached.': 'Limite de 24 heures atteinte.',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{remaining}} activation(s) Spectre jetable(s) sur {{total}} disponible(s). Maximum 1 toutes les 24 heures.',
  },
  markets: {
    'Mozaga Markets': 'Marchés Mozaga',
    'Trade, predict, fund and provide liquidity': 'Tradez, prédisez, financez et fournissez de la liquidité',
    'Protocol fees collected': 'Frais de protocole collectés',
    'Explore': 'Explorer',
    'Primary Market': 'Marché primaire',
    'Token Sales': 'Ventes de tokens',
    'Prediction': 'Prédiction',
    'Bet on Outcomes': 'Parier sur les résultats',
    'Escrow': 'Séquestre',
    'P2P Trading': 'Trading P2P',
    'Campaigns': 'Campagnes',
    'Crowdfunding': 'Financement participatif',
    'AMM Pools': 'Pools AMM',
    'Swap & Liquidity': 'Swap et liquidité',
    'Active': 'Actif',
    'Sales': 'Ventes',
    'Pools': 'Pools',
    'all': 'Tout',
    'politics': 'Politique',
    'crypto': 'Crypto',
    'sports': 'Sport',
    'finance': 'Finance',
    'science': 'Science',
    'entertainment': 'Divertissement',
    'other': 'Autre',
    'Volume': 'Volume',
    'Trades': 'Trades',
    'My Positions': 'Mes positions',
    'No markets found': 'Aucun marché trouvé',
    'No active prediction markets yet': 'Aucun marché de prédiction actif pour le moment',
    'No active markets in "{{category}}"': 'Aucun marché actif dans "{{category}}"',
    'Loading markets...': 'Chargement des marchés...',
  },
})

const hi = completeFeatureTranslations({
  common: {
    'Blockchain': 'ब्लॉकचेन',
    '{{network}} Wallet': '{{network}} वॉलेट',
    'Your {{network}} Address': 'आपका {{network}} पता',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      '{{network}} पर {{symbol}} प्राप्त करने के लिए यह QR कोड या पता साझा करें। इस पते पर केवल इसी नेटवर्क की संपत्तियाँ भेजें।',
    'Connected': 'कनेक्टेड',
    'Signature': 'हस्ताक्षर',
    'Tokens on Mozaga': 'Mozaga पर टोकन',
    'Recent Transactions': 'हाल के लेन-देन',
    'Loading transactions...': 'लेन-देन लोड हो रहे हैं...',
  },
  crypto: {
    'Please try again.': 'कृपया फिर से प्रयास करें।',
    'Enter a valid amount': 'मान्य राशि दर्ज करें',
    'Copied!': 'कॉपी हो गया',
    'Network State': 'नेटवर्क स्थिति',
    'Block': 'ब्लॉक',
    'Amount': 'राशि',
    'Gas Fee (est.)': 'गैस शुल्क (अनुमानित)',
    'Network Fee': 'नेटवर्क शुल्क',
    'Send': 'भेजें',
    '+ gas in': '+ गैस',
    '+ gas paid in': '+ गैस भुगतान',
    'Total': 'कुल',
    'Contribution': 'योगदान',
    'Contribution Treasury': 'योगदान ट्रेजरी',
    'Contribution Transaction Hash': 'योगदान लेनदेन हैश',
    'Contribution included': 'योगदान शामिल है',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      '0.1% योगदान शामिल है, जिसकी सीमा 10 USD के बराबर है।',
    'Wallet contribution notice': 'वॉलेट योगदान सूचना',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'आउटबाउंड लेनदेन में 0.1% अतिरिक्त योगदान शामिल होता है, प्रति लेनदेन अधिकतम 10 अमेरिकी डॉलर। इससे सर्वर बनाए रखने और इंफ्रास्ट्रक्चर या सॉफ़्टवेयर को अपग्रेड करने में मदद मिलती है। यदि आप इस दान से सहमत नहीं हैं, तो वॉलेट का उपयोग न करें।',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'योगदान की गणना उपलब्ध नहीं है। बाज़ार कीमतें रीफ़्रेश करें और फिर प्रयास करें।',
    'Insufficient balance': 'अपर्याप्त शेष',
    'Insufficient balance for amount, contribution, and network fees.':
      'राशि, योगदान और नेटवर्क शुल्क के लिए शेष अपर्याप्त है।',
    'Copy': 'कॉपी करें',
    'Share': 'साझा करें',
  },
  settings: {
    'Could not switch to root EXO account': 'रूट EXO खाते पर स्विच नहीं किया जा सका',
    'Erase EXO Account': 'EXO खाता मिटाएँ',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'मिटाएँ',
    'Could not erase EXO account': 'EXO खाता मिटाया नहीं जा सका',
    'EXO Accounts': 'EXO खाते',
    'Create, switch, or erase transparent EXO accounts.':
      'पारदर्शी EXO खाते बनाएँ, बदलें या मिटाएँ।',
    'Maximum of 5 transparent EXO accounts reached.':
      'अधिकतम 5 पारदर्शी EXO खातों की सीमा पूरी हो गई है।',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'रूट',
    'Erase account': 'खाता मिटाएँ',
    'Show other accounts': 'अन्य खाते दिखाएँ',
    'Hide other accounts': 'अन्य खाते छिपाएँ',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'एक नया expendable Spectre वॉलेट और blinded activation token अभी तैयार किए जा रहे हैं। रिडेम्प्शन Tor कनेक्ट होने तक प्रतीक्षा करता है।',
    'Prepare an expendable Spectre account before continuing.':
      'जारी रखने से पहले एक expendable Spectre खाता तैयार करें।',
    'Tor must be connected before preparing an expendable Spectre account.':
      'expendable Spectre खाता तैयार करने से पहले Tor कनेक्ट होना चाहिए।',
    '24-hour limit reached. Try again in {{time}}.':
      '24 घंटे की सीमा पूरी हो गई है। {{time}} में फिर कोशिश करें।',
    '24-hour limit reached. Resets {{date}}.':
      '24 घंटे की सीमा पूरी हो गई है। {{date}} को रीसेट होगा।',
    '24-hour limit reached.': '24 घंटे की सीमा पूरी हो गई है।',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{total}} में से {{remaining}} expendable Spectre activation उपलब्ध हैं। हर 24 घंटे में अधिकतम 1।',
  },
  markets: {
    'Mozaga Markets': 'Mozaga बाज़ार',
    'Trade, predict, fund and provide liquidity': 'ट्रेड करें, पूर्वानुमान लगाएँ, फंड करें और तरलता दें',
    'Protocol fees collected': 'एकत्रित प्रोटोकॉल शुल्क',
    'Explore': 'खोजें',
    'Primary Market': 'प्राथमिक बाज़ार',
    'Token Sales': 'टोकन बिक्री',
    'Prediction': 'पूर्वानुमान',
    'Bet on Outcomes': 'परिणामों पर दांव लगाएँ',
    'Escrow': 'एस्क्रो',
    'P2P Trading': 'P2P ट्रेडिंग',
    'Campaigns': 'अभियान',
    'Crowdfunding': 'क्राउडफंडिंग',
    'AMM Pools': 'AMM पूल',
    'Swap & Liquidity': 'स्वैप और तरलता',
    'Active': 'सक्रिय',
    'Sales': 'बिक्री',
    'Pools': 'पूल',
    'all': 'सभी',
    'politics': 'राजनीति',
    'crypto': 'क्रिप्टो',
    'sports': 'खेल',
    'finance': 'वित्त',
    'science': 'विज्ञान',
    'entertainment': 'मनोरंजन',
    'other': 'अन्य',
    'Volume': 'वॉल्यूम',
    'Trades': 'ट्रेड',
    'My Positions': 'मेरी पोज़िशन',
    'No markets found': 'कोई बाज़ार नहीं मिला',
    'No active prediction markets yet': 'अभी कोई सक्रिय पूर्वानुमान बाज़ार नहीं है',
    'No active markets in "{{category}}"': '"{{category}}" में कोई सक्रिय बाज़ार नहीं है',
    'Loading markets...': 'बाज़ार लोड हो रहे हैं...',
  },
})

const id = completeFeatureTranslations({
  common: {
    'Blockchain': 'Blockchain',
    '{{network}} Wallet': 'Dompet {{network}}',
    'Your {{network}} Address': 'Alamat {{network}} Anda',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      'Bagikan kode QR atau alamat ini untuk menerima {{symbol}} di {{network}}. Hanya kirim aset untuk jaringan ini ke alamat ini.',
    'Connected': 'Terhubung',
    'Signature': 'Tanda tangan',
    'Tokens on Mozaga': 'Token di Mozaga',
    'Recent Transactions': 'Transaksi terbaru',
    'Loading transactions...': 'Memuat transaksi...',
  },
  crypto: {
    'Please try again.': 'Silakan coba lagi.',
    'Enter a valid amount': 'Masukkan jumlah yang valid',
    'Copied!': 'Disalin',
    'Network State': 'Status Jaringan',
    'Block': 'Blok',
    'Amount': 'Jumlah',
    'Gas Fee (est.)': 'Biaya gas (perk.)',
    'Network Fee': 'Biaya jaringan',
    'Send': 'Kirim',
    '+ gas in': '+ gas dalam',
    '+ gas paid in': '+ gas dibayar dalam',
    'Total': 'Total',
    'Contribution': 'Kontribusi',
    'Contribution Treasury': 'Kas Kontribusi',
    'Contribution Transaction Hash': 'Hash Transaksi Kontribusi',
    'Contribution included': 'Kontribusi disertakan',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      'Kontribusi 0,1% disertakan, dibatasi setara $10.',
    'Wallet contribution notice': 'Pemberitahuan kontribusi dompet',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'Transaksi keluar mencakup kontribusi tambahan 0,1%, dengan batas $10 USD per transaksi. Ini membantu memelihara server dan meningkatkan infrastruktur atau perangkat lunak. Jika Anda tidak setuju dengan donasi ini, jangan gunakan Dompet.',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'Perhitungan kontribusi tidak tersedia. Muat ulang harga pasar dan coba lagi.',
    'Insufficient balance': 'Saldo tidak cukup',
    'Insufficient balance for amount, contribution, and network fees.':
      'Saldo tidak cukup untuk jumlah, kontribusi, dan biaya jaringan.',
    'Copy': 'Salin',
    'Share': 'Bagikan',
  },
  settings: {
    'Could not switch to root EXO account': 'Tidak dapat beralih ke akun EXO root',
    'Erase EXO Account': 'Hapus Akun EXO',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'Hapus',
    'Could not erase EXO account': 'Tidak dapat menghapus akun EXO',
    'EXO Accounts': 'Akun EXO',
    'Create, switch, or erase transparent EXO accounts.':
      'Buat, alihkan, atau hapus akun EXO transparan.',
    'Maximum of 5 transparent EXO accounts reached.':
      'Maksimum 5 akun EXO transparan telah tercapai.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'Root',
    'Erase account': 'Hapus akun',
    'Show other accounts': 'Tampilkan akun lain',
    'Hide other accounts': 'Sembunyikan akun lain',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'Dompet Spectre sekali pakai baru dan token aktivasi blind sedang disiapkan sekarang. Penukaran menunggu hingga Tor terhubung.',
    'Prepare an expendable Spectre account before continuing.':
      'Siapkan akun Spectre sekali pakai sebelum melanjutkan.',
    'Tor must be connected before preparing an expendable Spectre account.':
      'Tor harus terhubung sebelum menyiapkan akun Spectre sekali pakai.',
    '24-hour limit reached. Try again in {{time}}.':
      'Batas 24 jam tercapai. Coba lagi dalam {{time}}.',
    '24-hour limit reached. Resets {{date}}.':
      'Batas 24 jam tercapai. Direset pada {{date}}.',
    '24-hour limit reached.': 'Batas 24 jam tercapai.',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{remaining}} dari {{total}} aktivasi Spectre sekali pakai tersedia. Maks. 1 setiap 24 jam.',
  },
  markets: {
    'Mozaga Markets': 'Pasar Mozaga',
    'Trade, predict, fund and provide liquidity': 'Trading, prediksi, danai, dan sediakan likuiditas',
    'Protocol fees collected': 'Biaya protokol terkumpul',
    'Explore': 'Jelajahi',
    'Primary Market': 'Pasar Primer',
    'Token Sales': 'Penjualan Token',
    'Prediction': 'Prediksi',
    'Bet on Outcomes': 'Taruhan pada hasil',
    'Escrow': 'Escrow',
    'P2P Trading': 'Trading P2P',
    'Campaigns': 'Kampanye',
    'Crowdfunding': 'Crowdfunding',
    'AMM Pools': 'Pool AMM',
    'Swap & Liquidity': 'Swap & Likuiditas',
    'Active': 'Aktif',
    'Sales': 'Penjualan',
    'Pools': 'Pool',
    'all': 'Semua',
    'politics': 'Politik',
    'crypto': 'Kripto',
    'sports': 'Olahraga',
    'finance': 'Keuangan',
    'science': 'Sains',
    'entertainment': 'Hiburan',
    'other': 'Lainnya',
    'Volume': 'Volume',
    'Trades': 'Trade',
    'My Positions': 'Posisi Saya',
    'No markets found': 'Pasar tidak ditemukan',
    'No active prediction markets yet': 'Belum ada pasar prediksi aktif',
    'No active markets in "{{category}}"': 'Tidak ada pasar aktif di "{{category}}"',
    'Loading markets...': 'Memuat pasar...',
  },
})

const it = completeFeatureTranslations({
  common: {
    'Blockchain': 'Blockchain',
    '{{network}} Wallet': 'Portafoglio {{network}}',
    'Your {{network}} Address': 'Il tuo indirizzo {{network}}',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      'Condividi questo codice QR o indirizzo per ricevere {{symbol}} su {{network}}. Invia a questo indirizzo solo asset di questa rete.',
    'Connected': 'Connesso',
    'Signature': 'Firma',
    'Tokens on Mozaga': 'Token su Mozaga',
    'Recent Transactions': 'Transazioni recenti',
    'Loading transactions...': 'Caricamento transazioni...',
  },
  crypto: {
    'Please try again.': 'Riprova.',
    'Enter a valid amount': 'Inserisci un importo valido',
    'Copied!': 'Copiato',
    'Network State': 'Stato della rete',
    'Block': 'Blocco',
    'Amount': 'Importo',
    'Gas Fee (est.)': 'Commissione gas (stim.)',
    'Network Fee': 'Commissione di rete',
    'Send': 'Invia',
    '+ gas in': '+ gas in',
    '+ gas paid in': '+ gas pagato in',
    'Total': 'Totale',
    'Contribution': 'Contributo',
    'Contribution Treasury': 'Tesoreria contributi',
    'Contribution Transaction Hash': 'Hash transazione contributo',
    'Contribution included': 'Contributo incluso',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      'È incluso un contributo dello 0,1%, con limite equivalente a 10 USD.',
    'Wallet contribution notice': 'Avviso sul contributo dei portafogli',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'Le transazioni in uscita includono un contributo aggiuntivo dello 0,1%, con un tetto di 10 USD per transazione. Questo aiuta a mantenere i server e ad aggiornare l’infrastruttura o il software. Se non sei d’accordo con questa donazione, non usare i portafogli.',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'Calcolo del contributo non disponibile. Aggiorna i prezzi di mercato e riprova.',
    'Insufficient balance': 'Saldo insufficiente',
    'Insufficient balance for amount, contribution, and network fees.':
      'Saldo insufficiente per importo, contributo e commissioni di rete.',
    'Copy': 'Copia',
    'Share': 'Condividi',
  },
  settings: {
    'Could not switch to root EXO account': 'Impossibile passare all’account EXO root',
    'Erase EXO Account': 'Cancella account EXO',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'Cancella',
    'Could not erase EXO account': 'Impossibile cancellare l’account EXO',
    'EXO Accounts': 'Account EXO',
    'Create, switch, or erase transparent EXO accounts.':
      'Crea, cambia o cancella account EXO trasparenti.',
    'Maximum of 5 transparent EXO accounts reached.':
      'Raggiunto il massimo di 5 account EXO trasparenti.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'Root',
    'Erase account': 'Cancella account',
    'Show other accounts': 'Mostra altri account',
    'Hide other accounts': 'Nascondi altri account',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'Un nuovo portafoglio Spectre usa e getta e un token di attivazione blind vengono preparati ora. Il riscatto attende che Tor sia connesso.',
    'Prepare an expendable Spectre account before continuing.':
      'Prepara un account Spectre usa e getta prima di continuare.',
    'Tor must be connected before preparing an expendable Spectre account.':
      'Tor deve essere connesso prima di preparare un account Spectre usa e getta.',
    '24-hour limit reached. Try again in {{time}}.':
      'Limite di 24 ore raggiunto. Riprova tra {{time}}.',
    '24-hour limit reached. Resets {{date}}.':
      'Limite di 24 ore raggiunto. Si reimposta il {{date}}.',
    '24-hour limit reached.': 'Limite di 24 ore raggiunto.',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{remaining}} di {{total}} attivazioni Spectre usa e getta disponibili. Max 1 ogni 24 ore.',
  },
  markets: {
    'Mozaga Markets': 'Mercati Mozaga',
    'Trade, predict, fund and provide liquidity': 'Fai trading, previsioni, finanziamenti e fornisci liquidità',
    'Protocol fees collected': 'Commissioni di protocollo raccolte',
    'Explore': 'Esplora',
    'Primary Market': 'Mercato primario',
    'Token Sales': 'Vendite token',
    'Prediction': 'Previsione',
    'Bet on Outcomes': 'Scommetti sugli esiti',
    'Escrow': 'Escrow',
    'P2P Trading': 'Trading P2P',
    'Campaigns': 'Campagne',
    'Crowdfunding': 'Crowdfunding',
    'AMM Pools': 'Pool AMM',
    'Swap & Liquidity': 'Swap e liquidità',
    'Active': 'Attivo',
    'Sales': 'Vendite',
    'Pools': 'Pool',
    'all': 'Tutto',
    'politics': 'Politica',
    'crypto': 'Crypto',
    'sports': 'Sport',
    'finance': 'Finanza',
    'science': 'Scienza',
    'entertainment': 'Intrattenimento',
    'other': 'Altro',
    'Volume': 'Volume',
    'Trades': 'Trade',
    'My Positions': 'Le mie posizioni',
    'No markets found': 'Nessun mercato trovato',
    'No active prediction markets yet': 'Ancora nessun mercato di previsione attivo',
    'No active markets in "{{category}}"': 'Nessun mercato attivo in "{{category}}"',
    'Loading markets...': 'Caricamento mercati...',
  },
})

const pt = completeFeatureTranslations({
  common: {
    'Blockchain': 'Blockchain',
    '{{network}} Wallet': 'Carteira {{network}}',
    'Your {{network}} Address': 'Seu endereço {{network}}',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      'Compartilhe este QR code ou endereço para receber {{symbol}} na {{network}}. Envie apenas ativos desta rede para este endereço.',
    'Connected': 'Conectado',
    'Signature': 'Assinatura',
    'Tokens on Mozaga': 'Tokens na Mozaga',
    'Recent Transactions': 'Transações recentes',
    'Loading transactions...': 'Carregando transações...',
  },
  crypto: {
    'Please try again.': 'Tente novamente.',
    'Enter a valid amount': 'Insira um valor válido',
    'Copied!': 'Copiado',
    'Network State': 'Estado da rede',
    'Block': 'Bloco',
    'Amount': 'Valor',
    'Gas Fee (est.)': 'Taxa de gás (est.)',
    'Network Fee': 'Taxa de rede',
    'Send': 'Enviar',
    '+ gas in': '+ gás em',
    '+ gas paid in': '+ gás pago em',
    'Total': 'Total',
    'Contribution': 'Contribuição',
    'Contribution Treasury': 'Tesouraria de contribuições',
    'Contribution Transaction Hash': 'Hash da transação de contribuição',
    'Contribution included': 'Contribuição incluída',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      'Uma contribuição de 0,1% está incluída, limitada ao equivalente a US$ 10.',
    'Wallet contribution notice': 'Aviso de contribuição das carteiras',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'As transações de saída incluem uma contribuição extra de 0,1%, limitada a US$ 10 por transação. Isso ajuda a manter os servidores e a melhorar a infraestrutura ou o software. Se você não concordar com esta doação, não use as Carteiras.',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'Não foi possível calcular a contribuição. Atualize os preços de mercado e tente novamente.',
    'Insufficient balance': 'Saldo insuficiente',
    'Insufficient balance for amount, contribution, and network fees.':
      'Saldo insuficiente para o valor, a contribuição e as taxas de rede.',
    'Copy': 'Copiar',
    'Share': 'Compartilhar',
  },
  settings: {
    'Could not switch to root EXO account': 'Não foi possível mudar para a conta EXO raiz',
    'Erase EXO Account': 'Apagar conta EXO',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'Apagar',
    'Could not erase EXO account': 'Não foi possível apagar a conta EXO',
    'EXO Accounts': 'Contas EXO',
    'Create, switch, or erase transparent EXO accounts.':
      'Crie, alterne ou apague contas EXO transparentes.',
    'Maximum of 5 transparent EXO accounts reached.':
      'Máximo de 5 contas EXO transparentes atingido.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'Raiz',
    'Erase account': 'Apagar conta',
    'Show other accounts': 'Mostrar outras contas',
    'Hide other accounts': 'Ocultar outras contas',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'Uma nova carteira Spectre descartável e um token de ativação cego estão sendo preparados agora. O resgate aguarda até o Tor estar conectado.',
    'Prepare an expendable Spectre account before continuing.':
      'Prepare uma conta Spectre descartável antes de continuar.',
    'Tor must be connected before preparing an expendable Spectre account.':
      'O Tor precisa estar conectado antes de preparar uma conta Spectre descartável.',
    '24-hour limit reached. Try again in {{time}}.':
      'Limite de 24 horas atingido. Tente novamente em {{time}}.',
    '24-hour limit reached. Resets {{date}}.':
      'Limite de 24 horas atingido. Redefine em {{date}}.',
    '24-hour limit reached.': 'Limite de 24 horas atingido.',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{remaining}} de {{total}} ativações Spectre descartáveis disponíveis. Máx. 1 a cada 24 horas.',
  },
  markets: {
    'Mozaga Markets': 'Mercados Mozaga',
    'Trade, predict, fund and provide liquidity': 'Negocie, preveja, financie e forneça liquidez',
    'Protocol fees collected': 'Taxas de protocolo coletadas',
    'Explore': 'Explorar',
    'Primary Market': 'Mercado primário',
    'Token Sales': 'Vendas de tokens',
    'Prediction': 'Previsão',
    'Bet on Outcomes': 'Aposte em resultados',
    'Escrow': 'Custódia',
    'P2P Trading': 'Negociação P2P',
    'Campaigns': 'Campanhas',
    'Crowdfunding': 'Financiamento coletivo',
    'AMM Pools': 'Pools AMM',
    'Swap & Liquidity': 'Swap e liquidez',
    'Active': 'Ativo',
    'Sales': 'Vendas',
    'Pools': 'Pools',
    'all': 'Tudo',
    'politics': 'Política',
    'crypto': 'Cripto',
    'sports': 'Esportes',
    'finance': 'Finanças',
    'science': 'Ciência',
    'entertainment': 'Entretenimento',
    'other': 'Outro',
    'Volume': 'Volume',
    'Trades': 'Negociações',
    'My Positions': 'Minhas posições',
    'No markets found': 'Nenhum mercado encontrado',
    'No active prediction markets yet': 'Ainda não há mercados de previsão ativos',
    'No active markets in "{{category}}"': 'Nenhum mercado ativo em "{{category}}"',
    'Loading markets...': 'Carregando mercados...',
  },
})

const ru = completeFeatureTranslations({
  common: {
    'Blockchain': 'Блокчейн',
    '{{network}} Wallet': 'Кошелёк {{network}}',
    'Your {{network}} Address': 'Ваш адрес {{network}}',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      'Поделитесь этим QR-кодом или адресом, чтобы получить {{symbol}} в сети {{network}}. Отправляйте на этот адрес только активы этой сети.',
    'Connected': 'Подключено',
    'Signature': 'Подпись',
    'Tokens on Mozaga': 'Токены в сети Mozaga',
    'Recent Transactions': 'Последние транзакции',
    'Loading transactions...': 'Загрузка транзакций...',
  },
  crypto: {
    'Please try again.': 'Попробуйте еще раз.',
    'Enter a valid amount': 'Введите корректную сумму',
    'Copied!': 'Скопировано',
    'Network State': 'Состояние сети',
    'Block': 'Блок',
    'Amount': 'Сумма',
    'Gas Fee (est.)': 'Комиссия газа (оценка)',
    'Network Fee': 'Комиссия сети',
    'Send': 'Отправить',
    '+ gas in': '+ газ в',
    '+ gas paid in': '+ газ оплачен в',
    'Total': 'Итого',
    'Contribution': 'Взнос',
    'Contribution Treasury': 'Казна взносов',
    'Contribution Transaction Hash': 'Хеш транзакции взноса',
    'Contribution included': 'Взнос включен',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      'Включен взнос 0,1%, не более эквивалента 10 USD.',
    'Wallet contribution notice': 'Уведомление о взносе кошельков',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'Исходящие транзакции включают дополнительный взнос 0,1% с максимумом 10 USD за транзакцию. Это помогает поддерживать серверы и обновлять инфраструктуру или ПО. Если вы не согласны с этим пожертвованием, не используйте кошельки.',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'Расчет взноса недоступен. Обновите рыночные цены и попробуйте снова.',
    'Insufficient balance': 'Недостаточный баланс',
    'Insufficient balance for amount, contribution, and network fees.':
      'Недостаточный баланс для суммы, взноса и сетевых комиссий.',
    'Copy': 'Копировать',
    'Share': 'Поделиться',
  },
  settings: {
    'Could not switch to root EXO account': 'Не удалось переключиться на корневой аккаунт EXO',
    'Erase EXO Account': 'Стереть аккаунт EXO',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'Стереть',
    'Could not erase EXO account': 'Не удалось стереть аккаунт EXO',
    'EXO Accounts': 'Аккаунты EXO',
    'Create, switch, or erase transparent EXO accounts.':
      'Создавайте, переключайте или стирайте прозрачные аккаунты EXO.',
    'Maximum of 5 transparent EXO accounts reached.':
      'Достигнут максимум в 5 прозрачных аккаунтов EXO.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'Корень',
    'Erase account': 'Стереть аккаунт',
    'Show other accounts': 'Показать другие аккаунты',
    'Hide other accounts': 'Скрыть другие аккаунты',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'Новый одноразовый кошелек Spectre и слепой токен активации подготавливаются сейчас. Активация дождется подключения Tor.',
    'Prepare an expendable Spectre account before continuing.':
      'Подготовьте одноразовый аккаунт Spectre перед продолжением.',
    'Tor must be connected before preparing an expendable Spectre account.':
      'Tor должен быть подключен перед подготовкой одноразового аккаунта Spectre.',
    '24-hour limit reached. Try again in {{time}}.':
      'Достигнут лимит на 24 часа. Повторите попытку через {{time}}.',
    '24-hour limit reached. Resets {{date}}.':
      'Достигнут лимит на 24 часа. Сброс {{date}}.',
    '24-hour limit reached.': 'Достигнут лимит на 24 часа.',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      'Доступно {{remaining}} из {{total}} одноразовых активаций Spectre. Максимум 1 раз в 24 часа.',
  },
  markets: {
    'Mozaga Markets': 'Рынки Mozaga',
    'Trade, predict, fund and provide liquidity': 'Торгуйте, прогнозируйте, финансируйте и предоставляйте ликвидность',
    'Protocol fees collected': 'Собранные комиссии протокола',
    'Explore': 'Обзор',
    'Primary Market': 'Первичный рынок',
    'Token Sales': 'Продажи токенов',
    'Prediction': 'Прогнозы',
    'Bet on Outcomes': 'Ставки на результат',
    'Escrow': 'Эскроу',
    'P2P Trading': 'P2P-торговля',
    'Campaigns': 'Кампании',
    'Crowdfunding': 'Краудфандинг',
    'AMM Pools': 'Пулы AMM',
    'Swap & Liquidity': 'Обмен и ликвидность',
    'Active': 'Активен',
    'Sales': 'Продажи',
    'Pools': 'Пулы',
    'all': 'Все',
    'politics': 'Политика',
    'crypto': 'Крипто',
    'sports': 'Спорт',
    'finance': 'Финансы',
    'science': 'Наука',
    'entertainment': 'Развлечения',
    'other': 'Другое',
    'Volume': 'Объем',
    'Trades': 'Сделки',
    'My Positions': 'Мои позиции',
    'No markets found': 'Рынки не найдены',
    'No active prediction markets yet': 'Активных рынков прогнозов пока нет',
    'No active markets in "{{category}}"': 'Нет активных рынков в категории "{{category}}"',
    'Loading markets...': 'Загрузка рынков...',
  },
})

const ur = completeFeatureTranslations({
  common: {
    'Blockchain': 'بلاک چین',
    '{{network}} Wallet': '{{network}} والٹ',
    'Your {{network}} Address': 'آپ کا {{network}} پتہ',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      '{{network}} پر {{symbol}} وصول کرنے کے لیے یہ QR کوڈ یا پتہ شیئر کریں۔ اس پتے پر صرف اسی نیٹ ورک کے اثاثے بھیجیں۔',
    'Connected': 'منسلک',
    'Signature': 'دستخط',
    'Tokens on Mozaga': 'Mozaga پر ٹوکنز',
    'Recent Transactions': 'حالیہ لین دین',
    'Loading transactions...': 'لین دین لوڈ ہو رہے ہیں...',
  },
  crypto: {
    'Please try again.': 'براہ کرم دوبارہ کوشش کریں۔',
    'Enter a valid amount': 'درست رقم درج کریں',
    'Copied!': 'کاپی ہو گیا',
    'Network State': 'نیٹ ورک کی حالت',
    'Block': 'بلاک',
    'Amount': 'رقم',
    'Gas Fee (est.)': 'گیس فیس (تخمینہ)',
    'Network Fee': 'نیٹ ورک فیس',
    'Send': 'بھیجیں',
    '+ gas in': '+ گیس',
    '+ gas paid in': '+ گیس ادا ہوئی',
    'Total': 'کل',
    'Contribution': 'شراکت',
    'Contribution Treasury': 'شراکت خزانہ',
    'Contribution Transaction Hash': 'شراکت ٹرانزیکشن ہیش',
    'Contribution included': 'شراکت شامل ہے',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      '0.1% شراکت شامل ہے، زیادہ سے زیادہ $10 کے برابر۔',
    'Wallet contribution notice': 'والیٹ شراکت نوٹس',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      'آؤٹ باؤنڈ لین دین میں اضافی 0.1% شراکت شامل ہوتی ہے، فی لین دین زیادہ سے زیادہ 10 امریکی ڈالر۔ اس سے سرورز کو چلانے اور انفراسٹرکچر یا سافٹ ویئر کو اپ گریڈ کرنے میں مدد ملتی ہے۔ اگر آپ اس عطیہ سے متفق نہیں ہیں تو والیٹس استعمال نہ کریں۔',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      'شراکت کا حساب دستیاب نہیں۔ مارکیٹ قیمتیں ریفریش کر کے دوبارہ کوشش کریں۔',
    'Insufficient balance': 'بیلنس ناکافی ہے',
    'Insufficient balance for amount, contribution, and network fees.':
      'رقم، شراکت اور نیٹ ورک فیس کے لیے بیلنس ناکافی ہے۔',
    'Copy': 'کاپی',
    'Share': 'شیئر کریں',
  },
  settings: {
    'Could not switch to root EXO account': 'روٹ EXO اکاؤنٹ پر سوئچ نہیں ہو سکا',
    'Erase EXO Account': 'EXO اکاؤنٹ مٹائیں',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': 'مٹائیں',
    'Could not erase EXO account': 'EXO اکاؤنٹ مٹایا نہیں جا سکا',
    'EXO Accounts': 'EXO اکاؤنٹس',
    'Create, switch, or erase transparent EXO accounts.':
      'شفاف EXO اکاؤنٹس بنائیں، سوئچ کریں یا مٹائیں۔',
    'Maximum of 5 transparent EXO accounts reached.':
      'زیادہ سے زیادہ 5 شفاف EXO اکاؤنٹس کی حد پوری ہو گئی ہے۔',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': 'روٹ',
    'Erase account': 'اکاؤنٹ مٹائیں',
    'Show other accounts': 'دیگر اکاؤنٹس دکھائیں',
    'Hide other accounts': 'دیگر اکاؤنٹس چھپائیں',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      'ایک نیا expendable Spectre والٹ اور blinded activation token ابھی تیار کیے جا رہے ہیں۔ Redemption Tor کے منسلک ہونے تک انتظار کرتی ہے۔',
    'Prepare an expendable Spectre account before continuing.':
      'جاری رکھنے سے پہلے ایک expendable Spectre اکاؤنٹ تیار کریں۔',
    'Tor must be connected before preparing an expendable Spectre account.':
      'expendable Spectre اکاؤنٹ تیار کرنے سے پہلے Tor منسلک ہونا چاہیے۔',
    '24-hour limit reached. Try again in {{time}}.':
      '24 گھنٹے کی حد پوری ہو گئی ہے۔ {{time}} میں دوبارہ کوشش کریں۔',
    '24-hour limit reached. Resets {{date}}.':
      '24 گھنٹے کی حد پوری ہو گئی ہے۔ {{date}} کو ری سیٹ ہو گی۔',
    '24-hour limit reached.': '24 گھنٹے کی حد پوری ہو گئی ہے۔',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{total}} میں سے {{remaining}} expendable Spectre activations دستیاب ہیں۔ ہر 24 گھنٹے میں زیادہ سے زیادہ 1۔',
  },
  markets: {
    'Mozaga Markets': 'Mozaga مارکیٹس',
    'Trade, predict, fund and provide liquidity': 'تجارت، پیش گوئی، فنڈنگ اور لیکویڈیٹی فراہم کریں',
    'Protocol fees collected': 'جمع شدہ پروٹوکول فیس',
    'Explore': 'دریافت کریں',
    'Primary Market': 'پرائمری مارکیٹ',
    'Token Sales': 'ٹوکن سیلز',
    'Prediction': 'پیش گوئی',
    'Bet on Outcomes': 'نتائج پر شرط لگائیں',
    'Escrow': 'ایسکرو',
    'P2P Trading': 'P2P ٹریڈنگ',
    'Campaigns': 'مہمات',
    'Crowdfunding': 'کراؤڈ فنڈنگ',
    'AMM Pools': 'AMM پولز',
    'Swap & Liquidity': 'سواپ اور لیکویڈیٹی',
    'Active': 'فعال',
    'Sales': 'سیلز',
    'Pools': 'پولز',
    'all': 'سب',
    'politics': 'سیاست',
    'crypto': 'کرپٹو',
    'sports': 'کھیل',
    'finance': 'مالیات',
    'science': 'سائنس',
    'entertainment': 'تفریح',
    'other': 'دیگر',
    'Volume': 'حجم',
    'Trades': 'ٹریڈز',
    'My Positions': 'میری پوزیشنز',
    'No markets found': 'کوئی مارکیٹ نہیں ملی',
    'No active prediction markets yet': 'ابھی کوئی فعال پیش گوئی مارکیٹ نہیں ہے',
    'No active markets in "{{category}}"': '"{{category}}" میں کوئی فعال مارکیٹ نہیں ہے',
    'Loading markets...': 'مارکیٹس لوڈ ہو رہی ہیں...',
  },
})

const zhHans = completeFeatureTranslations({
  common: {
    'Blockchain': '区块链',
    '{{network}} Wallet': '{{network}} 钱包',
    'Your {{network}} Address': '你的 {{network}} 地址',
    'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.':
      '分享此二维码或地址，以在 {{network}} 上接收 {{symbol}}。请只向此地址发送该网络的资产。',
    'Connected': '已连接',
    'Signature': '签名',
    'Tokens on Mozaga': 'Mozaga 上的代币',
    'Recent Transactions': '最近交易',
    'Loading transactions...': '正在加载交易...',
  },
  crypto: {
    'Please try again.': '请重试。',
    'Enter a valid amount': '请输入有效金额',
    'Copied!': '已复制',
    'Network State': '网络状态',
    'Block': '区块',
    'Amount': '金额',
    'Gas Fee (est.)': 'Gas 费（估算）',
    'Network Fee': '网络费用',
    'Send': '发送',
    '+ gas in': '+ Gas 使用',
    '+ gas paid in': '+ Gas 支付使用',
    'Total': '总计',
    'Contribution': '贡献',
    'Contribution Treasury': '贡献金库',
    'Contribution Transaction Hash': '贡献交易哈希',
    'Contribution included': '已包含贡献',
    'A 0.1% contribution is included, capped at $10 equivalent.':
      '已包含 0.1% 贡献，上限为等值 10 美元。',
    'Wallet contribution notice': '钱包贡献说明',
    'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.':
      '出站交易包含额外 0.1% 贡献，每笔交易上限为 10 美元。这用于维护服务器并升级基础设施或软件。如果您不同意此项捐助，请勿使用钱包。',
    'Contribution quote unavailable. Please refresh market prices and try again.':
      '无法计算贡献。请刷新市场价格后重试。',
    'Insufficient balance': '余额不足',
    'Insufficient balance for amount, contribution, and network fees.':
      '余额不足以支付金额、贡献和网络费用。',
    'Copy': '复制',
    'Share': '分享',
  },
  settings: {
    'Could not switch to root EXO account': '无法切换到根 EXO 账户',
    'Erase EXO Account': '擦除 EXO 账户',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.',
    'Erase': '擦除',
    'Could not erase EXO account': '无法擦除 EXO 账户',
    'EXO Accounts': 'EXO 账户',
    'Create, switch, or erase transparent EXO accounts.':
      '创建、切换或擦除透明 EXO 账户。',
    'Maximum of 5 transparent EXO accounts reached.':
      '已达到 5 个透明 EXO 账户的上限。',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Switch to your root EXO account to create or import transparent EXO accounts.',
    'Root': '根',
    'Erase account': '擦除账户',
    'Show other accounts': '显示其他账户',
    'Hide other accounts': '隐藏其他账户',
    'A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.':
      '正在准备一个新的可丢弃 Spectre 钱包和盲化激活令牌。兑换会等到 Tor 连接后进行。',
    'Prepare an expendable Spectre account before continuing.':
      '继续之前请先准备一个可丢弃 Spectre 账户。',
    'Tor must be connected before preparing an expendable Spectre account.':
      '准备可丢弃 Spectre 账户前必须先连接 Tor。',
    '24-hour limit reached. Try again in {{time}}.':
      '已达到 24 小时限制。请在 {{time}} 后重试。',
    '24-hour limit reached. Resets {{date}}.':
      '已达到 24 小时限制。将于 {{date}} 重置。',
    '24-hour limit reached.': '已达到 24 小时限制。',
    '{{remaining}} of {{total}} expendable Spectre activations available. Max 1 every 24 hours.':
      '{{total}} 次可丢弃 Spectre 激活中还有 {{remaining}} 次可用。每 24 小时最多 1 次。',
  },
  markets: {
    'Mozaga Markets': 'Mozaga 市场',
    'Trade, predict, fund and provide liquidity': '交易、预测、融资并提供流动性',
    'Protocol fees collected': '已收取的协议费用',
    'Explore': '探索',
    'Primary Market': '一级市场',
    'Token Sales': '代币销售',
    'Prediction': '预测',
    'Bet on Outcomes': '押注结果',
    'Escrow': '托管',
    'P2P Trading': 'P2P 交易',
    'Campaigns': '活动',
    'Crowdfunding': '众筹',
    'AMM Pools': 'AMM 池',
    'Swap & Liquidity': '兑换与流动性',
    'Active': '活跃',
    'Sales': '销售',
    'Pools': '池',
    'all': '全部',
    'politics': '政治',
    'crypto': '加密',
    'sports': '体育',
    'finance': '金融',
    'science': '科学',
    'entertainment': '娱乐',
    'other': '其他',
    'Volume': '成交量',
    'Trades': '交易',
    'My Positions': '我的持仓',
    'No markets found': '未找到市场',
    'No active prediction markets yet': '暂无活跃预测市场',
    'No active markets in "{{category}}"': '"{{category}}" 中没有活跃市场',
    'Loading markets...': '正在加载市场...',
  },
})

const spectreCommonTranslations: Record<
  FeatureLanguage,
  NonNullable<FeatureNamespaceTranslations['common']>
> = {
  en: {
    'Spectre Mode': 'Spectre Mode',
    'Unavailable in Spectre Mode': 'Unavailable in Spectre Mode',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.',
    'Transfers are disabled while Spectre Mode is active.':
      'Transfers are disabled while Spectre Mode is active.',
    'Tags are disabled while Spectre Mode is active.':
      'Tags are disabled while Spectre Mode is active.',
    'Media is hidden while Spectre Mode is active.':
      'Media is hidden while Spectre Mode is active.',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Crypto features are unavailable while Spectre Mode is active.',
  },
  es: {
    'Spectre Mode': 'Modo Spectre',
    'Unavailable in Spectre Mode': 'No disponible en modo Spectre',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'El modo Spectre solo permite mensajes de texto cifrados simples. Los medios, notas de voz, transferencias y etiquetas están desactivados.',
    'Transfers are disabled while Spectre Mode is active.':
      'Las transferencias están desactivadas mientras el modo Spectre está activo.',
    'Tags are disabled while Spectre Mode is active.':
      'Las etiquetas están desactivadas mientras el modo Spectre está activo.',
    'Media is hidden while Spectre Mode is active.':
      'Los medios están ocultos mientras el modo Spectre está activo.',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Las funciones criptográficas no están disponibles mientras el modo Spectre está activo.',
  },
  fr: {
    'Spectre Mode': 'Mode Spectre',
    'Unavailable in Spectre Mode': 'Indisponible en mode Spectre',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'Le mode Spectre autorise uniquement les messages texte chiffrés simples. Les médias, notes vocales, transferts et tags sont désactivés.',
    'Transfers are disabled while Spectre Mode is active.':
      'Les transferts sont désactivés lorsque le mode Spectre est actif.',
    'Tags are disabled while Spectre Mode is active.':
      'Les tags sont désactivés lorsque le mode Spectre est actif.',
    'Media is hidden while Spectre Mode is active.':
      'Les médias sont masqués lorsque le mode Spectre est actif.',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Les fonctionnalités crypto ne sont pas disponibles lorsque le mode Spectre est actif.',
  },
  de: {
    'Spectre Mode': 'Spectre-Modus',
    'Unavailable in Spectre Mode': 'Im Spectre-Modus nicht verfügbar',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'Der Spectre-Modus erlaubt nur einfache verschlüsselte Textnachrichten. Medien, Sprachnachrichten, Transfers und Tags sind deaktiviert.',
    'Transfers are disabled while Spectre Mode is active.':
      'Transfers sind deaktiviert, während der Spectre-Modus aktiv ist.',
    'Tags are disabled while Spectre Mode is active.':
      'Tags sind deaktiviert, während der Spectre-Modus aktiv ist.',
    'Media is hidden while Spectre Mode is active.':
      'Medien sind ausgeblendet, während der Spectre-Modus aktiv ist.',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Kryptofunktionen sind nicht verfügbar, während der Spectre-Modus aktiv ist.',
  },
  it: {
    'Spectre Mode': 'Modalità Spectre',
    'Unavailable in Spectre Mode': 'Non disponibile in modalità Spectre',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'La modalità Spectre consente solo messaggi di testo cifrati semplici. Media, note vocali, trasferimenti e tag sono disattivati.',
    'Transfers are disabled while Spectre Mode is active.':
      'I trasferimenti sono disattivati mentre la modalità Spectre è attiva.',
    'Tags are disabled while Spectre Mode is active.':
      'I tag sono disattivati mentre la modalità Spectre è attiva.',
    'Media is hidden while Spectre Mode is active.':
      'I media sono nascosti mentre la modalità Spectre è attiva.',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Le funzionalità crypto non sono disponibili mentre la modalità Spectre è attiva.',
  },
  pt: {
    'Spectre Mode': 'Modo Spectre',
    'Unavailable in Spectre Mode': 'Indisponível no modo Spectre',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'O modo Spectre permite apenas mensagens de texto criptografadas simples. Mídia, notas de voz, transferências e tags ficam desativadas.',
    'Transfers are disabled while Spectre Mode is active.':
      'Transferências ficam desativadas enquanto o modo Spectre está ativo.',
    'Tags are disabled while Spectre Mode is active.':
      'As tags ficam desativadas enquanto o modo Spectre está ativo.',
    'Media is hidden while Spectre Mode is active.':
      'A mídia fica oculta enquanto o modo Spectre está ativo.',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Os recursos de criptomoedas não estão disponíveis enquanto o modo Spectre está ativo.',
  },
  ru: {
    'Spectre Mode': 'Режим Spectre',
    'Unavailable in Spectre Mode': 'Недоступно в режиме Spectre',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'Режим Spectre разрешает только простые зашифрованные текстовые сообщения. Медиа, голосовые заметки, переводы и теги отключены.',
    'Transfers are disabled while Spectre Mode is active.':
      'Переводы отключены, пока режим Spectre активен.',
    'Tags are disabled while Spectre Mode is active.':
      'Теги отключены, пока режим Spectre активен.',
    'Media is hidden while Spectre Mode is active.':
      'Медиа скрыты, пока режим Spectre активен.',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Криптофункции недоступны, пока режим Spectre активен.',
  },
  'zh-Hans': {
    'Spectre Mode': 'Spectre 模式',
    'Unavailable in Spectre Mode': 'Spectre 模式下不可用',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'Spectre 模式只允许普通加密文本消息。媒体、语音消息、转账和标签均已禁用。',
    'Transfers are disabled while Spectre Mode is active.':
      'Spectre 模式启用时转账已禁用。',
    'Tags are disabled while Spectre Mode is active.':
      'Spectre 模式启用时标签已禁用。',
    'Media is hidden while Spectre Mode is active.':
      'Spectre 模式启用时媒体会被隐藏。',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Spectre 模式启用时加密功能不可用。',
  },
  hi: {
    'Spectre Mode': 'Spectre मोड',
    'Unavailable in Spectre Mode': 'Spectre मोड में उपलब्ध नहीं',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'Spectre मोड केवल साधारण encrypted text messages की अनुमति देता है. Media, voice notes, transfers और tags disabled हैं.',
    'Transfers are disabled while Spectre Mode is active.':
      'Spectre मोड active होने पर transfers disabled हैं.',
    'Tags are disabled while Spectre Mode is active.':
      'Spectre मोड active होने पर tags disabled हैं.',
    'Media is hidden while Spectre Mode is active.':
      'Spectre मोड active होने पर media hidden रहता है.',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Spectre मोड active होने पर crypto features उपलब्ध नहीं हैं.',
  },
  ar: {
    'Spectre Mode': 'وضع Spectre',
    'Unavailable in Spectre Mode': 'غير متاح في وضع Spectre',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'يسمح وضع Spectre برسائل نصية مشفرة بسيطة فقط. الوسائط والملاحظات الصوتية والتحويلات والوسوم معطلة.',
    'Transfers are disabled while Spectre Mode is active.':
      'التحويلات معطلة أثناء تفعيل وضع Spectre.',
    'Tags are disabled while Spectre Mode is active.':
      'الوسوم معطلة أثناء تفعيل وضع Spectre.',
    'Media is hidden while Spectre Mode is active.':
      'الوسائط مخفية أثناء تفعيل وضع Spectre.',
    'Crypto features are unavailable while Spectre Mode is active.':
      'ميزات التشفير غير متاحة أثناء تفعيل وضع Spectre.',
  },
  bn: {
    'Spectre Mode': 'Spectre মোড',
    'Unavailable in Spectre Mode': 'Spectre মোডে উপলভ্য নয়',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'Spectre মোড শুধু সাধারণ encrypted text message অনুমতি দেয়। Media, voice notes, transfers এবং tags নিষ্ক্রিয়।',
    'Transfers are disabled while Spectre Mode is active.':
      'Spectre মোড সক্রিয় থাকলে transfers নিষ্ক্রিয়।',
    'Tags are disabled while Spectre Mode is active.':
      'Spectre মোড সক্রিয় থাকলে tags নিষ্ক্রিয়।',
    'Media is hidden while Spectre Mode is active.':
      'Spectre মোড সক্রিয় থাকলে media লুকানো থাকে।',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Spectre মোড সক্রিয় থাকলে crypto features উপলভ্য নয়।',
  },
  ur: {
    'Spectre Mode': 'Spectre موڈ',
    'Unavailable in Spectre Mode': 'Spectre موڈ میں دستیاب نہیں',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'Spectre موڈ صرف سادہ encrypted text messages کی اجازت دیتا ہے۔ Media، voice notes، transfers، اور tags غیر فعال ہیں۔',
    'Transfers are disabled while Spectre Mode is active.':
      'Spectre موڈ فعال ہونے پر transfers غیر فعال ہیں۔',
    'Tags are disabled while Spectre Mode is active.':
      'Spectre موڈ فعال ہونے پر tags غیر فعال ہیں۔',
    'Media is hidden while Spectre Mode is active.':
      'Spectre موڈ فعال ہونے پر media پوشیدہ رہتا ہے۔',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Spectre موڈ فعال ہونے پر crypto features دستیاب نہیں ہیں۔',
  },
  id: {
    'Spectre Mode': 'Mode Spectre',
    'Unavailable in Spectre Mode': 'Tidak tersedia dalam mode Spectre',
    'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.':
      'Mode Spectre hanya mengizinkan pesan teks terenkripsi biasa. Media, catatan suara, transfer, dan tag dinonaktifkan.',
    'Transfers are disabled while Spectre Mode is active.':
      'Transfer dinonaktifkan saat mode Spectre aktif.',
    'Tags are disabled while Spectre Mode is active.':
      'Tag dinonaktifkan saat mode Spectre aktif.',
    'Media is hidden while Spectre Mode is active.':
      'Media disembunyikan saat mode Spectre aktif.',
    'Crypto features are unavailable while Spectre Mode is active.':
      'Fitur kripto tidak tersedia saat mode Spectre aktif.',
  },
}

const homeScreenTranslations: Record<FeatureLanguage, FeatureNamespaceTranslations> = {
  en: {
    common: {
      'New': 'New',
      'Create': 'Create',
      'EXO Account': 'EXO Account',
    },
    navigation: {
      'Chats': 'Chats',
    },
    chat: {
      'Private': 'Private',
      'No conversations yet': 'No conversations yet',
      'Sending as {{account}}': 'Sending as {{account}}',
      'Create a New Conversation': 'Create a New Conversation',
      'Select a conversation type': 'Select a conversation type',
    },
  },
  es: {
    common: {
      'New': 'Nuevo',
      'Create': 'Crear',
      'EXO Account': 'Cuenta EXO',
    },
    navigation: {
      'Chats': 'Chats',
    },
    chat: {
      'Private': 'Privados',
      'No conversations yet': 'Aún no hay conversaciones',
      'Sending as {{account}}': 'Enviando como {{account}}',
      'Create a New Conversation': 'Crear una nueva conversación',
      'Select a conversation type': 'Selecciona un tipo de conversación',
    },
  },
  fr: {
    common: {
      'New': 'Nouveau',
      'Create': 'Créer',
      'EXO Account': 'Compte EXO',
    },
    navigation: {
      'Chats': 'Discussions',
    },
    chat: {
      'Private': 'Privés',
      'No conversations yet': 'Aucune conversation pour le moment',
      'Sending as {{account}}': 'Envoi avec {{account}}',
      'Create a New Conversation': 'Créer une nouvelle conversation',
      'Select a conversation type': 'Sélectionnez un type de conversation',
    },
  },
  de: {
    common: {
      'New': 'Neu',
      'Create': 'Erstellen',
      'EXO Account': 'EXO-Konto',
    },
    navigation: {
      'Chats': 'Chats',
    },
    chat: {
      'Private': 'Privat',
      'No conversations yet': 'Noch keine Unterhaltungen',
      'Sending as {{account}}': 'Senden als {{account}}',
      'Create a New Conversation': 'Neue Unterhaltung erstellen',
      'Select a conversation type': 'Wählen Sie einen Unterhaltungstyp',
    },
  },
  it: {
    common: {
      'New': 'Nuovo',
      'Create': 'Crea',
      'EXO Account': 'Account EXO',
    },
    navigation: {
      'Chats': 'Chat',
    },
    chat: {
      'Private': 'Private',
      'No conversations yet': 'Ancora nessuna conversazione',
      'Sending as {{account}}': 'Invio come {{account}}',
      'Create a New Conversation': 'Crea una nuova conversazione',
      'Select a conversation type': 'Seleziona un tipo di conversazione',
    },
  },
  pt: {
    common: {
      'New': 'Novo',
      'Create': 'Criar',
      'EXO Account': 'Conta EXO',
    },
    navigation: {
      'Chats': 'Conversas',
    },
    chat: {
      'Private': 'Privadas',
      'No conversations yet': 'Ainda não há conversas',
      'Sending as {{account}}': 'Enviando como {{account}}',
      'Create a New Conversation': 'Criar uma nova conversa',
      'Select a conversation type': 'Selecione um tipo de conversa',
    },
  },
  ru: {
    common: {
      'New': 'Новое',
      'Create': 'Создать',
      'EXO Account': 'Аккаунт EXO',
    },
    navigation: {
      'Chats': 'Чаты',
    },
    chat: {
      'Private': 'Личные',
      'No conversations yet': 'Пока нет разговоров',
      'Sending as {{account}}': 'Отправка от {{account}}',
      'Create a New Conversation': 'Создать новый разговор',
      'Select a conversation type': 'Выберите тип разговора',
    },
  },
  'zh-Hans': {
    common: {
      'New': '新建',
      'Create': '创建',
      'EXO Account': 'EXO 账户',
    },
    navigation: {
      'Chats': '聊天',
    },
    chat: {
      'Private': '私聊',
      'No conversations yet': '还没有对话',
      'Sending as {{account}}': '以 {{account}} 发送',
      'Create a New Conversation': '创建新对话',
      'Select a conversation type': '选择对话类型',
    },
  },
  hi: {
    common: {
      'New': 'नया',
      'Create': 'बनाएं',
      'EXO Account': 'EXO खाता',
    },
    navigation: {
      'Chats': 'चैट',
    },
    chat: {
      'Private': 'निजी',
      'No conversations yet': 'अभी तक कोई बातचीत नहीं',
      'Sending as {{account}}': '{{account}} के रूप में भेज रहे हैं',
      'Create a New Conversation': 'नई बातचीत बनाएं',
      'Select a conversation type': 'बातचीत का प्रकार चुनें',
    },
  },
  ar: {
    common: {
      'New': 'جديد',
      'Create': 'إنشاء',
      'EXO Account': 'حساب EXO',
    },
    navigation: {
      'Chats': 'الدردشات',
    },
    chat: {
      'Private': 'خاص',
      'No conversations yet': 'لا توجد محادثات بعد',
      'Sending as {{account}}': 'الإرسال باسم {{account}}',
      'Create a New Conversation': 'إنشاء محادثة جديدة',
      'Select a conversation type': 'اختر نوع المحادثة',
    },
  },
  bn: {
    common: {
      'New': 'নতুন',
      'Create': 'তৈরি করুন',
      'EXO Account': 'EXO অ্যাকাউন্ট',
    },
    navigation: {
      'Chats': 'চ্যাট',
    },
    chat: {
      'Private': 'ব্যক্তিগত',
      'No conversations yet': 'এখনও কোনো কথোপকথন নেই',
      'Sending as {{account}}': '{{account}} হিসেবে পাঠানো হচ্ছে',
      'Create a New Conversation': 'নতুন কথোপকথন তৈরি করুন',
      'Select a conversation type': 'কথোপকথনের ধরন নির্বাচন করুন',
    },
  },
  ur: {
    common: {
      'New': 'نیا',
      'Create': 'بنائیں',
      'EXO Account': 'EXO اکاؤنٹ',
    },
    navigation: {
      'Chats': 'چیٹس',
    },
    chat: {
      'Private': 'نجی',
      'No conversations yet': 'ابھی تک کوئی گفتگو نہیں',
      'Sending as {{account}}': '{{account}} کے طور پر بھیج رہے ہیں',
      'Create a New Conversation': 'نئی گفتگو بنائیں',
      'Select a conversation type': 'گفتگو کی قسم منتخب کریں',
    },
  },
  id: {
    common: {
      'New': 'Baru',
      'Create': 'Buat',
      'EXO Account': 'Akun EXO',
    },
    navigation: {
      'Chats': 'Obrolan',
    },
    chat: {
      'Private': 'Pribadi',
      'No conversations yet': 'Belum ada percakapan',
      'Sending as {{account}}': 'Mengirim sebagai {{account}}',
      'Create a New Conversation': 'Buat percakapan baru',
      'Select a conversation type': 'Pilih jenis percakapan',
    },
  },
}

const chatStatusTranslations: Record<
  FeatureLanguage,
  NonNullable<FeatureNamespaceTranslations['chat']>
> = {
  en: {
    'Spectre Mode': 'Spectre Mode',
    'Queued': 'Queued',
    'Relaying': 'Relaying',
    'Sent': 'Sent',
    'Delivered': 'Delivered',
    'Read': 'Read',
    'Failed': 'Failed',
    'Waiting for poll': 'Waiting for poll',
    'Sending nearby': 'Sending nearby',
    'Sent nearby': 'Sent nearby',
    'BLE send failed': 'BLE send failed',
    'Uploading': 'Uploading',
    'Processing...': 'Processing...',
    'Incoming voice call': 'Incoming voice call',
    'Outgoing voice call': 'Outgoing voice call',
    'Incoming video call': 'Incoming video call',
    'Outgoing video call': 'Outgoing video call',
    'Checking for new messages': 'Checking for new messages',
    'Preparing secure chat': 'Preparing secure chat',
    'Loading your chats': 'Loading your chats',
    'Connecting': 'Connecting',
    'Checking the mailbox': 'Checking the mailbox',
    'Decrypting messages': 'Decrypting messages',
    'You\'re up to date': 'You\'re up to date',
  },
  es: {
    'Spectre Mode': 'Modo Spectre',
    'Queued': 'En cola',
    'Relaying': 'Reenviando',
    'Sent': 'Enviado',
    'Delivered': 'Entregado',
    'Read': 'Leído',
    'Failed': 'Falló',
    'Waiting for poll': 'Esperando sondeo',
    'Sending nearby': 'Enviando por cercanía',
    'Sent nearby': 'Enviado por cercanía',
    'BLE send failed': 'Falló el envío por BLE',
    'Uploading': 'Subiendo',
    'Processing...': 'Procesando...',
    'Incoming voice call': 'Llamada de voz entrante',
    'Outgoing voice call': 'Llamada de voz saliente',
    'Incoming video call': 'Videollamada entrante',
    'Outgoing video call': 'Videollamada saliente',
    'Checking for new messages': 'Buscando mensajes nuevos',
    'Preparing secure chat': 'Preparando el chat seguro',
    'Loading your chats': 'Cargando tus chats',
    'Connecting': 'Conectando',
    'Checking the mailbox': 'Revisando el buzón',
    'Decrypting messages': 'Descifrando mensajes',
    'You\'re up to date': 'Estás al día',
  },
  fr: {
    'Spectre Mode': 'Mode Spectre',
    'Queued': 'En file d’attente',
    'Relaying': 'Relais en cours',
    'Sent': 'Envoyé',
    'Delivered': 'Livré',
    'Read': 'Lu',
    'Failed': 'Échec',
    'Waiting for poll': 'En attente du sondage',
    'Sending nearby': 'Envoi à proximité',
    'Sent nearby': 'Envoyé à proximité',
    'BLE send failed': 'Échec de l’envoi BLE',
    'Uploading': 'Téléversement...',
    'Processing...': 'Traitement...',
    'Incoming voice call': 'Appel vocal entrant',
    'Outgoing voice call': 'Appel vocal sortant',
    'Incoming video call': 'Appel vidéo entrant',
    'Outgoing video call': 'Appel vidéo sortant',
    'Checking for new messages': 'Recherche de nouveaux messages',
    'Preparing secure chat': 'Préparation du chat sécurisé',
    'Loading your chats': 'Chargement de vos discussions',
    'Connecting': 'Connexion',
    'Checking the mailbox': 'Vérification de la boîte',
    'Decrypting messages': 'Déchiffrement des messages',
    'You\'re up to date': 'Vous êtes à jour',
  },
  de: {
    'Spectre Mode': 'Spectre-Modus',
    'Queued': 'In Warteschlange',
    'Relaying': 'Wird weitergeleitet',
    'Sent': 'Gesendet',
    'Delivered': 'Zugestellt',
    'Read': 'Gelesen',
    'Failed': 'Fehlgeschlagen',
    'Waiting for poll': 'Wartet auf Abfrage',
    'Sending nearby': 'Wird in der Nähe gesendet',
    'Sent nearby': 'In der Nähe gesendet',
    'BLE send failed': 'BLE-Senden fehlgeschlagen',
    'Uploading': 'Wird hochgeladen',
    'Processing...': 'Verarbeitung...',
    'Incoming voice call': 'Eingehender Sprachanruf',
    'Outgoing voice call': 'Ausgehender Sprachanruf',
    'Incoming video call': 'Eingehender Videoanruf',
    'Outgoing video call': 'Ausgehender Videoanruf',
    'Checking for new messages': 'Neue Nachrichten werden geprüft',
    'Preparing secure chat': 'Sicherer Chat wird vorbereitet',
    'Loading your chats': 'Chats werden geladen',
    'Connecting': 'Verbinden',
    'Checking the mailbox': 'Postfach wird geprüft',
    'Decrypting messages': 'Nachrichten werden entschlüsselt',
    'You\'re up to date': 'Du bist auf dem neuesten Stand',
  },
  it: {
    'Spectre Mode': 'Modalità Spectre',
    'Queued': 'In coda',
    'Relaying': 'In inoltro',
    'Sent': 'Inviato',
    'Delivered': 'Consegnato',
    'Read': 'Letto',
    'Failed': 'Non riuscito',
    'Waiting for poll': 'In attesa del polling',
    'Sending nearby': 'Invio nelle vicinanze',
    'Sent nearby': 'Inviato nelle vicinanze',
    'BLE send failed': 'Invio BLE non riuscito',
    'Uploading': 'Caricamento...',
    'Processing...': 'Elaborazione...',
    'Incoming voice call': 'Chiamata vocale in arrivo',
    'Outgoing voice call': 'Chiamata vocale in uscita',
    'Incoming video call': 'Videochiamata in arrivo',
    'Outgoing video call': 'Videochiamata in uscita',
    'Checking for new messages': 'Controllo nuovi messaggi',
    'Preparing secure chat': 'Preparazione chat sicura',
    'Loading your chats': 'Caricamento chat',
    'Connecting': 'Connessione',
    'Checking the mailbox': 'Controllo della casella',
    'Decrypting messages': 'Decifratura dei messaggi',
    'You\'re up to date': 'Sei aggiornato',
  },
  pt: {
    'Spectre Mode': 'Modo Spectre',
    'Queued': 'Na fila',
    'Relaying': 'Retransmitindo',
    'Sent': 'Enviado',
    'Delivered': 'Entregue',
    'Read': 'Lido',
    'Failed': 'Falha',
    'Waiting for poll': 'Aguardando sondagem',
    'Sending nearby': 'Enviando por proximidade',
    'Sent nearby': 'Enviado por proximidade',
    'BLE send failed': 'Falha ao enviar por BLE',
    'Uploading': 'Enviando...',
    'Processing...': 'Processando...',
    'Incoming voice call': 'Chamada de voz recebida',
    'Outgoing voice call': 'Chamada de voz enviada',
    'Incoming video call': 'Chamada de vídeo recebida',
    'Outgoing video call': 'Chamada de vídeo enviada',
    'Checking for new messages': 'Verificando novas mensagens',
    'Preparing secure chat': 'Preparando o chat seguro',
    'Loading your chats': 'Carregando suas conversas',
    'Connecting': 'Conectando',
    'Checking the mailbox': 'Verificando a caixa de correio',
    'Decrypting messages': 'Decifrando mensagens',
    'You\'re up to date': 'Tudo atualizado',
  },
  ru: {
    'Spectre Mode': 'Режим Spectre',
    'Queued': 'В очереди',
    'Relaying': 'Передается',
    'Sent': 'Отправлено',
    'Delivered': 'Доставлено',
    'Read': 'Прочитано',
    'Failed': 'Ошибка',
    'Waiting for poll': 'Ожидание опроса',
    'Sending nearby': 'Отправка поблизости',
    'Sent nearby': 'Отправлено поблизости',
    'BLE send failed': 'Не удалось отправить по BLE',
    'Uploading': 'Загрузка',
    'Processing...': 'Обработка...',
    'Incoming voice call': 'Входящий голосовой звонок',
    'Outgoing voice call': 'Исходящий голосовой звонок',
    'Incoming video call': 'Входящий видеозвонок',
    'Outgoing video call': 'Исходящий видеозвонок',
    'Checking for new messages': 'Проверка новых сообщений',
    'Preparing secure chat': 'Подготовка защищённого чата',
    'Loading your chats': 'Загрузка чатов',
    'Connecting': 'Подключение',
    'Checking the mailbox': 'Проверка почтового ящика',
    'Decrypting messages': 'Расшифровка сообщений',
    'You\'re up to date': 'Всё актуально',
  },
  'zh-Hans': {
    'Spectre Mode': 'Spectre 模式',
    'Queued': '已排队',
    'Relaying': '正在中继',
    'Sent': '已发送',
    'Delivered': '已送达',
    'Read': '已读',
    'Failed': '失败',
    'Waiting for poll': '等待轮询',
    'Sending nearby': '正在通过附近设备发送',
    'Sent nearby': '已通过附近设备发送',
    'BLE send failed': 'BLE 发送失败',
    'Uploading': '正在上传',
    'Processing...': '正在处理...',
    'Incoming voice call': '来电语音通话',
    'Outgoing voice call': '拨出语音通话',
    'Incoming video call': '来电视频通话',
    'Outgoing video call': '拨出视频通话',
    'Checking for new messages': '正在检查新消息',
    'Preparing secure chat': '正在准备安全聊天',
    'Loading your chats': '正在加载聊天',
    'Connecting': '正在连接',
    'Checking the mailbox': '正在检查邮箱',
    'Decrypting messages': '正在解密消息',
    'You\'re up to date': '已是最新',
  },
  hi: {
    'Spectre Mode': 'Spectre मोड',
    'Queued': 'कतार में',
    'Relaying': 'रिले हो रहा है',
    'Sent': 'भेजा गया',
    'Delivered': 'डिलीवर हुआ',
    'Read': 'पढ़ा गया',
    'Failed': 'विफल',
    'Waiting for poll': 'पोल की प्रतीक्षा',
    'Sending nearby': 'पास में भेजा जा रहा है',
    'Sent nearby': 'पास में भेजा गया',
    'BLE send failed': 'BLE भेजना विफल',
    'Uploading': 'अपलोड हो रहा है',
    'Processing...': 'प्रसंस्करण हो रहा है...',
    'Incoming voice call': 'आने वाली वॉयस कॉल',
    'Outgoing voice call': 'जाने वाली वॉयस कॉल',
    'Incoming video call': 'आने वाली वीडियो कॉल',
    'Outgoing video call': 'जाने वाली वीडियो कॉल',
    'Checking for new messages': 'नए संदेश जाँचे जा रहे हैं',
    'Preparing secure chat': 'सुरक्षित चैट तैयार की जा रही है',
    'Loading your chats': 'आपकी चैट लोड हो रही हैं',
    'Connecting': 'कनेक्ट किया जा रहा है',
    'Checking the mailbox': 'मेलबॉक्स जाँचा जा रहा है',
    'Decrypting messages': 'संदेश डिक्रिप्ट किए जा रहे हैं',
    'You\'re up to date': 'आप अपडेट हैं',
  },
  ar: {
    'Spectre Mode': 'وضع Spectre',
    'Queued': 'في قائمة الانتظار',
    'Relaying': 'جار الترحيل',
    'Sent': 'تم الإرسال',
    'Delivered': 'تم التسليم',
    'Read': 'تمت القراءة',
    'Failed': 'فشل',
    'Waiting for poll': 'بانتظار الاستقصاء',
    'Sending nearby': 'جار الإرسال عبر جهاز قريب',
    'Sent nearby': 'أُرسل عبر جهاز قريب',
    'BLE send failed': 'فشل الإرسال عبر BLE',
    'Uploading': 'جار الرفع',
    'Processing...': 'جار المعالجة...',
    'Incoming voice call': 'مكالمة صوتية واردة',
    'Outgoing voice call': 'مكالمة صوتية صادرة',
    'Incoming video call': 'مكالمة فيديو واردة',
    'Outgoing video call': 'مكالمة فيديو صادرة',
    'Checking for new messages': 'جارٍ التحقق من الرسائل الجديدة',
    'Preparing secure chat': 'جارٍ إعداد الدردشة الآمنة',
    'Loading your chats': 'جارٍ تحميل دردشاتك',
    'Connecting': 'جارٍ الاتصال',
    'Checking the mailbox': 'جارٍ فحص صندوق البريد',
    'Decrypting messages': 'جارٍ فك تشفير الرسائل',
    'You\'re up to date': 'أنت محدّث',
  },
  bn: {
    'Spectre Mode': 'Spectre মোড',
    'Queued': 'সারিতে আছে',
    'Relaying': 'রিলে হচ্ছে',
    'Sent': 'পাঠানো হয়েছে',
    'Delivered': 'পৌঁছেছে',
    'Read': 'পড়া হয়েছে',
    'Failed': 'ব্যর্থ',
    'Waiting for poll': 'পোলের অপেক্ষায়',
    'Sending nearby': 'কাছাকাছি পাঠানো হচ্ছে',
    'Sent nearby': 'কাছাকাছি পাঠানো হয়েছে',
    'BLE send failed': 'BLE পাঠানো ব্যর্থ হয়েছে',
    'Uploading': 'আপলোড হচ্ছে',
    'Processing...': 'প্রক্রিয়াকরণ হচ্ছে...',
    'Incoming voice call': 'ইনকামিং ভয়েস কল',
    'Outgoing voice call': 'আউটগোয়িং ভয়েস কল',
    'Incoming video call': 'ইনকামিং ভিডিও কল',
    'Outgoing video call': 'আউটগোয়িং ভিডিও কল',
    'Checking for new messages': 'নতুন বার্তা পরীক্ষা করা হচ্ছে',
    'Preparing secure chat': 'সুরক্ষিত চ্যাট প্রস্তুত করা হচ্ছে',
    'Loading your chats': 'আপনার চ্যাট লোড হচ্ছে',
    'Connecting': 'সংযোগ করা হচ্ছে',
    'Checking the mailbox': 'মেলবক্স পরীক্ষা করা হচ্ছে',
    'Decrypting messages': 'বার্তা ডিক্রিপ্ট করা হচ্ছে',
    'You\'re up to date': 'আপনি আপ টু ডেট',
  },
  ur: {
    'Spectre Mode': 'Spectre موڈ',
    'Queued': 'قطار میں',
    'Relaying': 'ریلے ہو رہا ہے',
    'Sent': 'بھیج دیا گیا',
    'Delivered': 'پہنچ گیا',
    'Read': 'پڑھ لیا گیا',
    'Failed': 'ناکام',
    'Waiting for poll': 'پول کا انتظار',
    'Sending nearby': 'قریب بھیجا جا رہا ہے',
    'Sent nearby': 'قریب ہی بھیج دیا گیا',
    'BLE send failed': 'BLE بھیجنا ناکام ہوا',
    'Uploading': 'اپ لوڈ ہو رہا ہے',
    'Processing...': 'پروسیسنگ ہو رہی ہے...',
    'Incoming voice call': 'آنے والی وائس کال',
    'Outgoing voice call': 'جانے والی وائس کال',
    'Incoming video call': 'آنے والی ویڈیو کال',
    'Outgoing video call': 'جانے والی ویڈیو کال',
    'Checking for new messages': 'نئے پیغامات چیک کیے جا رہے ہیں',
    'Preparing secure chat': 'محفوظ چیٹ تیار کی جا رہی ہے',
    'Loading your chats': 'آپ کی چیٹس لوڈ ہو رہی ہیں',
    'Connecting': 'کنیکٹ کیا جا رہا ہے',
    'Checking the mailbox': 'میل باکس چیک کیا جا رہا ہے',
    'Decrypting messages': 'پیغامات ڈکرپٹ کیے جا رہے ہیں',
    'You\'re up to date': 'آپ اپ ٹو ڈیٹ ہیں',
  },
  id: {
    'Spectre Mode': 'Mode Spectre',
    'Queued': 'Dalam antrean',
    'Relaying': 'Sedang meneruskan',
    'Sent': 'Terkirim',
    'Delivered': 'Tersampaikan',
    'Read': 'Dibaca',
    'Failed': 'Gagal',
    'Waiting for poll': 'Menunggu polling',
    'Sending nearby': 'Mengirim di sekitar',
    'Sent nearby': 'Terkirim di sekitar',
    'BLE send failed': 'Pengiriman BLE gagal',
    'Uploading': 'Mengunggah',
    'Processing...': 'Memproses...',
    'Incoming voice call': 'Panggilan suara masuk',
    'Outgoing voice call': 'Panggilan suara keluar',
    'Incoming video call': 'Panggilan video masuk',
    'Outgoing video call': 'Panggilan video keluar',
    'Checking for new messages': 'Memeriksa pesan baru',
    'Preparing secure chat': 'Menyiapkan chat aman',
    'Loading your chats': 'Memuat chat Anda',
    'Connecting': 'Menghubungkan',
    'Checking the mailbox': 'Memeriksa kotak surat',
    'Decrypting messages': 'Mendekripsi pesan',
    'You\'re up to date': 'Anda sudah terbaru',
  },
}

const securitySettingsTranslations: Record<
  FeatureLanguage,
  NonNullable<FeatureNamespaceTranslations['settings']>
> = {
  en: {
    'Disabled by Spectre Mode': 'Disabled by Spectre Mode',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      '{{biometricType}} unlock is disabled by Spectre Mode',
    'Always cleared by Spectre Mode': 'Always cleared by Spectre Mode',
    'Never Persist is enforced by Spectre Mode.':
      'Never Persist is enforced by Spectre Mode.',
    'Send delivery receipts when you receive messages.':
      'Send delivery receipts when you receive messages.',
    'Send read receipts when you open messages.':
      'Send read receipts when you open messages.',
    'Send Public Name in Notifications': 'Send Public Name in Notifications',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.',
    'Show Public Names in Notifications': 'Show Public Names in Notifications',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'Requires PIN. Allows sender public names to appear on this device when senders also opt in.',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.',
    'Clear Visual Media on Lock': 'Clear Visual Media on Lock',
    'Clear avatar and media preview caches when the app locks.':
      'Clear avatar and media preview caches when the app locks.',
    'Decrypted Message Cache': 'Decrypted Message Cache',
    'Controls the local plaintext cache used for faster chat loading.':
      'Controls the local plaintext cache used for faster chat loading.',
    'Standard': 'Standard',
    'Clear on Lock': 'Clear on Lock',
    'Never Persist': 'Never Persist',
    'Could not update cache privacy': 'Could not update cache privacy',
    'Could not update message cache privacy': 'Could not update message cache privacy',
    'Could not update notification privacy': 'Could not update notification privacy',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.',
    'Notification Name Privacy': 'Notification Name Privacy',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.',
    'Enable Sending Public Name': 'Enable Sending Public Name',
    'Enable Showing Public Names': 'Enable Showing Public Names',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.',
    'Continue': 'Continue',
  },
  es: {
    'Disabled by Spectre Mode': 'Desactivado por el modo Spectre',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      'El desbloqueo con {{biometricType}} está desactivado por el modo Spectre',
    'Always cleared by Spectre Mode': 'Siempre borrado por el modo Spectre',
    'Never Persist is enforced by Spectre Mode.':
      'El modo Spectre exige no persistir nunca.',
    'Send delivery receipts when you receive messages.':
      'Enviar confirmaciones de entrega cuando recibas mensajes.',
    'Send read receipts when you open messages.':
      'Enviar confirmaciones de lectura cuando abras mensajes.',
    'Send Public Name in Notifications': 'Enviar nombre publico en notificaciones',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'Requiere PIN. Permite que tu nombre publico aparezca en los metadatos de notificacion solo cuando los destinatarios lo permitan.',
    'Show Public Names in Notifications': 'Mostrar nombres publicos en notificaciones',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'Requiere PIN. Permite que los nombres publicos de remitentes aparezcan en este dispositivo cuando ellos tambien lo activen.',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'Los nombres publicos en notificaciones son visibles para proveedores push, el sistema operativo, pantallas de bloqueo, historial de notificaciones, personas cercanas, copias de seguridad del dispositivo y dispositivos destinatarios. El contenido del mensaje permanece oculto.',
    'Clear Visual Media on Lock': 'Borrar medios visuales al bloquear',
    'Clear avatar and media preview caches when the app locks.':
      'Borrar las caches de avatares y vistas previas multimedia cuando la app se bloquee.',
    'Decrypted Message Cache': 'Cache de mensajes descifrados',
    'Controls the local plaintext cache used for faster chat loading.':
      'Controla la cache local en texto claro usada para cargar chats mas rapido.',
    'Standard': 'Estandar',
    'Clear on Lock': 'Borrar al bloquear',
    'Never Persist': 'No persistir nunca',
    'Could not update cache privacy': 'No se pudo actualizar la privacidad de la cache',
    'Could not update message cache privacy': 'No se pudo actualizar la privacidad de la cache de mensajes',
    'Could not update notification privacy': 'No se pudo actualizar la privacidad de las notificaciones',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'Elige como gestiona Spectra la cache local de mensajes descifrados. Los registros cifrados de mensajes permanecen almacenados para sincronizacion y recuperacion.',
    'Notification Name Privacy': 'Privacidad de nombres en notificaciones',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'Tu nombre publico puede enviarse a Expo, Apple o Google, guardarse en el historial de notificaciones del sistema, mostrarse en pantallas de bloqueo, ser visto por personas cercanas y almacenarse en dispositivos destinatarios que permitan nombres publicos.',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'Los nombres publicos de remitentes pueden enviarse a Expo, Apple o Google, guardarse en el historial de notificaciones del sistema, mostrarse en tu pantalla de bloqueo, ser visibles para personas cercanas y almacenarse en copias de seguridad de este dispositivo.',
    'Enable Sending Public Name': 'Activar envio de nombre publico',
    'Enable Showing Public Names': 'Activar mostrar nombres publicos',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'Introduce tu PIN para confirmar que tu nombre publico puede aparecer en los metadatos de notificaciones cuando los destinatarios tambien lo permitan.',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'Introduce tu PIN para confirmar que los nombres publicos de remitentes pueden aparecer en los metadatos de notificaciones de este dispositivo.',
    'Continue': 'Continuar',
  },
  fr: {
    'Disabled by Spectre Mode': 'Desactive par le mode Spectre',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      'Le déverrouillage {{biometricType}} est désactivé par le mode Spectre',
    'Always cleared by Spectre Mode': 'Toujours efface par le mode Spectre',
    'Never Persist is enforced by Spectre Mode.':
      'Le mode Spectre impose de ne jamais conserver.',
    'Send delivery receipts when you receive messages.':
      'Envoyer des confirmations de livraison lorsque vous recevez des messages.',
    'Send read receipts when you open messages.':
      'Envoyer des accuses de lecture lorsque vous ouvrez des messages.',
    'Send Public Name in Notifications': 'Envoyer le nom public dans les notifications',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'Necessite le code PIN. Permet a votre nom public d apparaitre dans les metadonnees de notification uniquement si les destinataires l autorisent.',
    'Show Public Names in Notifications': 'Afficher les noms publics dans les notifications',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'Necessite le code PIN. Permet aux noms publics des expediteurs d apparaitre sur cet appareil lorsque les expediteurs l activent aussi.',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'Les noms publics dans les notifications sont visibles par les fournisseurs push, le systeme d exploitation, les ecrans verrouilles, l historique des notifications, les personnes proches, les sauvegardes de l appareil et les appareils destinataires. Le contenu des messages reste masque.',
    'Clear Visual Media on Lock': 'Effacer les medias visuels au verrouillage',
    'Clear avatar and media preview caches when the app locks.':
      'Effacer les caches d avatars et d apercus multimedia lorsque l app se verrouille.',
    'Decrypted Message Cache': 'Cache des messages dechiffres',
    'Controls the local plaintext cache used for faster chat loading.':
      'Controle le cache local en clair utilise pour charger les discussions plus rapidement.',
    'Standard': 'Standard',
    'Clear on Lock': 'Effacer au verrouillage',
    'Never Persist': 'Ne jamais conserver',
    'Could not update cache privacy': 'Impossible de mettre a jour la confidentialite du cache',
    'Could not update message cache privacy': 'Impossible de mettre a jour la confidentialite du cache des messages',
    'Could not update notification privacy': 'Impossible de mettre a jour la confidentialite des notifications',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'Choisissez comment Spectra gere le cache local des messages dechiffres. Les enregistrements chiffres des messages restent stockes pour la synchronisation et la recuperation.',
    'Notification Name Privacy': 'Confidentialite des noms dans les notifications',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'Votre nom public peut etre envoye a Expo, Apple ou Google, inscrit dans l historique des notifications du systeme, affiche sur les ecrans verrouilles, vu par des personnes proches et stocke sur les appareils destinataires qui autorisent les noms publics.',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'Les noms publics des expediteurs peuvent etre envoyes a Expo, Apple ou Google, inscrits dans l historique des notifications du systeme, affiches sur votre ecran verrouille, visibles par des personnes proches et stockes dans les sauvegardes de cet appareil.',
    'Enable Sending Public Name': 'Activer l envoi du nom public',
    'Enable Showing Public Names': 'Activer l affichage des noms publics',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'Saisissez votre code PIN pour confirmer que votre nom public peut apparaitre dans les metadonnees de notification lorsque les destinataires l autorisent aussi.',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'Saisissez votre code PIN pour confirmer que les noms publics des expediteurs peuvent apparaitre dans les metadonnees de notification sur cet appareil.',
    'Continue': 'Continuer',
  },
  de: {
    'Disabled by Spectre Mode': 'Durch den Spectre-Modus deaktiviert',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      '{{biometricType}}-Entsperrung ist durch den Spectre-Modus deaktiviert',
    'Always cleared by Spectre Mode': 'Wird vom Spectre-Modus immer geleert',
    'Never Persist is enforced by Spectre Mode.':
      'Nie speichern wird vom Spectre-Modus erzwungen.',
    'Send delivery receipts when you receive messages.':
      'Sendebestatigungen senden, wenn Sie Nachrichten erhalten.',
    'Send read receipts when you open messages.':
      'Lesebestatigungen senden, wenn Sie Nachrichten offnen.',
    'Send Public Name in Notifications': 'Offentlichen Namen in Benachrichtigungen senden',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'Erfordert PIN. Ihr offentlicher Name erscheint nur dann in Benachrichtigungsmetadaten, wenn Empfanger dies erlauben.',
    'Show Public Names in Notifications': 'Offentliche Namen in Benachrichtigungen anzeigen',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'Erfordert PIN. Offentliche Namen von Absendern konnen auf diesem Gerat erscheinen, wenn Absender ebenfalls zustimmen.',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'Offentliche Namen in Benachrichtigungen sind fur Push-Anbieter, Betriebssystem, Sperrbildschirme, Benachrichtigungsverlauf, Personen in der Nahe, Gerate-Backups und Empfangergerate sichtbar. Nachrichteninhalte bleiben verborgen.',
    'Clear Visual Media on Lock': 'Visuelle Medien beim Sperren loschen',
    'Clear avatar and media preview caches when the app locks.':
      'Avatar- und Medienvorschau-Caches loschen, wenn die App gesperrt wird.',
    'Decrypted Message Cache': 'Cache entschlusselter Nachrichten',
    'Controls the local plaintext cache used for faster chat loading.':
      'Steuert den lokalen Klartext-Cache, der Chats schneller ladt.',
    'Standard': 'Standard',
    'Clear on Lock': 'Beim Sperren loschen',
    'Never Persist': 'Nie speichern',
    'Could not update cache privacy': 'Cache-Datenschutz konnte nicht aktualisiert werden',
    'Could not update message cache privacy': 'Nachrichten-Cache-Datenschutz konnte nicht aktualisiert werden',
    'Could not update notification privacy': 'Benachrichtigungsdatenschutz konnte nicht aktualisiert werden',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'Wahlen Sie, wie Spectra den lokalen Cache entschlusselter Nachrichten behandelt. Verschlusselte Nachrichtendatensatze bleiben fur Synchronisierung und Wiederherstellung gespeichert.',
    'Notification Name Privacy': 'Namensschutz in Benachrichtigungen',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'Ihr offentlicher Name kann an Expo, Apple oder Google gesendet, im Benachrichtigungsverlauf des Systems gespeichert, auf Sperrbildschirmen angezeigt, von Personen in der Nahe gesehen und auf Empfangergeraten gespeichert werden, die offentliche Namen erlauben.',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'Offentliche Namen von Absendern konnen an Expo, Apple oder Google gesendet, im Benachrichtigungsverlauf Ihres Systems gespeichert, auf Ihrem Sperrbildschirm angezeigt, fur Personen in der Nahe sichtbar und in Backups dieses Gerats gespeichert werden.',
    'Enable Sending Public Name': 'Senden des offentlichen Namens aktivieren',
    'Enable Showing Public Names': 'Anzeigen offentlicher Namen aktivieren',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'Geben Sie Ihre PIN ein, um zu bestatigen, dass Ihr offentlicher Name in Benachrichtigungsmetadaten erscheinen darf, wenn Empfanger dies ebenfalls erlauben.',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'Geben Sie Ihre PIN ein, um zu bestatigen, dass offentliche Namen von Absendern in Benachrichtigungsmetadaten auf diesem Gerat erscheinen durfen.',
    'Continue': 'Weiter',
  },
  it: {
    'Disabled by Spectre Mode': 'Disattivato dalla modalita Spectre',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      'Lo sblocco con {{biometricType}} è disattivato dalla modalità Spectre',
    'Always cleared by Spectre Mode': 'Sempre cancellato dalla modalita Spectre',
    'Never Persist is enforced by Spectre Mode.':
      'La modalità Spectre impone Non conservare mai.',
    'Send delivery receipts when you receive messages.':
      'Invia conferme di consegna quando ricevi messaggi.',
    'Send read receipts when you open messages.':
      'Invia conferme di lettura quando apri i messaggi.',
    'Send Public Name in Notifications': 'Invia nome pubblico nelle notifiche',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'Richiede il PIN. Consente al tuo nome pubblico di apparire nei metadati delle notifiche solo quando i destinatari lo consentono.',
    'Show Public Names in Notifications': 'Mostra nomi pubblici nelle notifiche',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'Richiede il PIN. Consente ai nomi pubblici dei mittenti di apparire su questo dispositivo quando anche i mittenti lo attivano.',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'I nomi pubblici nelle notifiche sono visibili ai provider push, al sistema operativo, alle schermate di blocco, alla cronologia notifiche, alle persone vicine, ai backup del dispositivo e ai dispositivi destinatari. Il contenuto dei messaggi resta nascosto.',
    'Clear Visual Media on Lock': 'Cancella media visivi al blocco',
    'Clear avatar and media preview caches when the app locks.':
      'Cancella le cache di avatar e anteprime multimediali quando l app si blocca.',
    'Decrypted Message Cache': 'Cache dei messaggi decifrati',
    'Controls the local plaintext cache used for faster chat loading.':
      'Controlla la cache locale in chiaro usata per caricare le chat piu rapidamente.',
    'Standard': 'Standard',
    'Clear on Lock': 'Cancella al blocco',
    'Never Persist': 'Non conservare mai',
    'Could not update cache privacy': 'Impossibile aggiornare la privacy della cache',
    'Could not update message cache privacy': 'Impossibile aggiornare la privacy della cache dei messaggi',
    'Could not update notification privacy': 'Impossibile aggiornare la privacy delle notifiche',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'Scegli come Spectra gestisce la cache locale dei messaggi decifrati. I record dei messaggi cifrati restano archiviati per sincronizzazione e recupero.',
    'Notification Name Privacy': 'Privacy dei nomi nelle notifiche',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'Il tuo nome pubblico puo essere inviato a Expo, Apple o Google, scritto nella cronologia notifiche del sistema, mostrato sulle schermate di blocco, visto da persone vicine e memorizzato sui dispositivi destinatari che consentono i nomi pubblici.',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'I nomi pubblici dei mittenti possono essere inviati a Expo, Apple o Google, scritti nella cronologia notifiche del sistema, mostrati sulla schermata di blocco, visibili a persone vicine e memorizzati nei backup di questo dispositivo.',
    'Enable Sending Public Name': 'Attiva invio del nome pubblico',
    'Enable Showing Public Names': 'Attiva visualizzazione dei nomi pubblici',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'Inserisci il PIN per confermare che il tuo nome pubblico puo apparire nei metadati delle notifiche quando anche i destinatari lo consentono.',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'Inserisci il PIN per confermare che i nomi pubblici dei mittenti possono apparire nei metadati delle notifiche su questo dispositivo.',
    'Continue': 'Continua',
  },
  pt: {
    'Disabled by Spectre Mode': 'Desativado pelo modo Spectre',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      'O desbloqueio por {{biometricType}} está desativado pelo modo Spectre',
    'Always cleared by Spectre Mode': 'Sempre limpo pelo modo Spectre',
    'Never Persist is enforced by Spectre Mode.':
      'Nunca persistir é imposto pelo modo Spectre.',
    'Send delivery receipts when you receive messages.':
      'Enviar confirmacoes de entrega quando voce receber mensagens.',
    'Send read receipts when you open messages.':
      'Enviar confirmacoes de leitura quando voce abrir mensagens.',
    'Send Public Name in Notifications': 'Enviar nome publico nas notificacoes',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'Requer PIN. Permite que seu nome publico apareca nos metadados de notificacao somente quando os destinatarios permitirem.',
    'Show Public Names in Notifications': 'Mostrar nomes publicos nas notificacoes',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'Requer PIN. Permite que nomes publicos de remetentes aparecam neste dispositivo quando os remetentes tambem ativarem.',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'Nomes publicos nas notificacoes ficam visiveis para provedores push, sistema operacional, telas de bloqueio, historico de notificacoes, pessoas proximas, backups do dispositivo e dispositivos destinatarios. O conteudo da mensagem permanece oculto.',
    'Clear Visual Media on Lock': 'Limpar midia visual ao bloquear',
    'Clear avatar and media preview caches when the app locks.':
      'Limpar caches de avatar e pre-visualizacoes de midia quando o app bloquear.',
    'Decrypted Message Cache': 'Cache de mensagens descriptografadas',
    'Controls the local plaintext cache used for faster chat loading.':
      'Controla o cache local em texto claro usado para carregar conversas mais rapido.',
    'Standard': 'Padrao',
    'Clear on Lock': 'Limpar ao bloquear',
    'Never Persist': 'Nunca persistir',
    'Could not update cache privacy': 'Nao foi possivel atualizar a privacidade do cache',
    'Could not update message cache privacy': 'Nao foi possivel atualizar a privacidade do cache de mensagens',
    'Could not update notification privacy': 'Nao foi possivel atualizar a privacidade das notificacoes',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'Escolha como o Spectra lida com o cache local de mensagens descriptografadas. Registros de mensagens criptografadas continuam armazenados para sincronizacao e recuperacao.',
    'Notification Name Privacy': 'Privacidade de nomes nas notificacoes',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'Seu nome publico pode ser enviado para Expo, Apple ou Google, gravado no historico de notificacoes do sistema, exibido em telas de bloqueio, visto por pessoas proximas e armazenado em dispositivos destinatarios que permitem nomes publicos.',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'Nomes publicos de remetentes podem ser enviados para Expo, Apple ou Google, gravados no historico de notificacoes do sistema, exibidos na sua tela de bloqueio, visiveis para pessoas proximas e armazenados em backups deste dispositivo.',
    'Enable Sending Public Name': 'Ativar envio do nome publico',
    'Enable Showing Public Names': 'Ativar exibicao de nomes publicos',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'Digite seu PIN para confirmar que seu nome publico pode aparecer nos metadados de notificacao quando os destinatarios tambem permitirem.',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'Digite seu PIN para confirmar que nomes publicos de remetentes podem aparecer nos metadados de notificacao neste dispositivo.',
    'Continue': 'Continuar',
  },
  ru: {
    'Disabled by Spectre Mode': 'Отключено режимом Spectre',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      'Разблокировка {{biometricType}} отключена режимом Spectre',
    'Always cleared by Spectre Mode': 'Всегда очищается режимом Spectre',
    'Never Persist is enforced by Spectre Mode.':
      'Режим Spectre принудительно включает "Никогда не сохранять".',
    'Send delivery receipts when you receive messages.':
      'Отправлять подтверждения доставки при получении сообщений.',
    'Send read receipts when you open messages.':
      'Отправлять уведомления о прочтении при открытии сообщений.',
    'Send Public Name in Notifications': 'Отправлять публичное имя в уведомлениях',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'Требуется PIN. Ваше публичное имя появится в метаданных уведомлений только если получатели это разрешают.',
    'Show Public Names in Notifications': 'Показывать публичные имена в уведомлениях',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'Требуется PIN. Публичные имена отправителей могут появляться на этом устройстве, если отправители тоже включили эту опцию.',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'Публичные имена в уведомлениях видны push-провайдерам, операционной системе, экранам блокировки, истории уведомлений, людям рядом, резервным копиям устройства и устройствам получателей. Содержимое сообщений остается скрытым.',
    'Clear Visual Media on Lock': 'Очищать визуальные медиа при блокировке',
    'Clear avatar and media preview caches when the app locks.':
      'Очищать кэши аватаров и предпросмотра медиа при блокировке приложения.',
    'Decrypted Message Cache': 'Кэш расшифрованных сообщений',
    'Controls the local plaintext cache used for faster chat loading.':
      'Управляет локальным кэшем открытого текста для более быстрой загрузки чатов.',
    'Standard': 'Стандартно',
    'Clear on Lock': 'Очищать при блокировке',
    'Never Persist': 'Никогда не сохранять',
    'Could not update cache privacy': 'Не удалось обновить приватность кэша',
    'Could not update message cache privacy': 'Не удалось обновить приватность кэша сообщений',
    'Could not update notification privacy': 'Не удалось обновить приватность уведомлений',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'Выберите, как Spectra обрабатывает локальный кэш расшифрованных сообщений. Зашифрованные записи сообщений остаются сохраненными для синхронизации и восстановления.',
    'Notification Name Privacy': 'Приватность имен в уведомлениях',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'Ваше публичное имя может отправляться в Expo, Apple или Google, записываться в историю уведомлений ОС, показываться на экранах блокировки, быть видимым людям рядом и храниться на устройствах получателей, которые разрешают публичные имена.',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'Публичные имена отправителей могут отправляться в Expo, Apple или Google, записываться в историю уведомлений ОС, показываться на экране блокировки, быть видимыми людям рядом и храниться в резервных копиях этого устройства.',
    'Enable Sending Public Name': 'Включить отправку публичного имени',
    'Enable Showing Public Names': 'Включить показ публичных имен',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'Введите PIN, чтобы подтвердить, что ваше публичное имя может появляться в метаданных уведомлений, если получатели тоже это разрешают.',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'Введите PIN, чтобы подтвердить, что публичные имена отправителей могут появляться в метаданных уведомлений на этом устройстве.',
    'Continue': 'Продолжить',
  },
  'zh-Hans': {
    'Disabled by Spectre Mode': '已由 Spectre 模式停用',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      '{{biometricType}} 解锁已由 Spectre 模式停用',
    'Always cleared by Spectre Mode': '始终由 Spectre 模式清除',
    'Never Persist is enforced by Spectre Mode.':
      'Spectre 模式会强制永不保留。',
    'Send delivery receipts when you receive messages.':
      '收到消息时发送送达回执。',
    'Send read receipts when you open messages.':
      '打开消息时发送已读回执。',
    'Send Public Name in Notifications': '在通知中发送公开名称',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      '需要 PIN。仅当收件人允许时，才让你的公开名称显示在通知元数据中。',
    'Show Public Names in Notifications': '在通知中显示公开名称',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      '需要 PIN。当发送者也选择加入时，允许发送者的公开名称显示在此设备上。',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      '通知中的公开名称会对推送服务商、操作系统、锁屏、通知历史、附近的人、设备备份和收件人设备可见。消息内容仍会隐藏。',
    'Clear Visual Media on Lock': '锁定时清除视觉媒体',
    'Clear avatar and media preview caches when the app locks.':
      '应用锁定时清除头像和媒体预览缓存。',
    'Decrypted Message Cache': '已解密消息缓存',
    'Controls the local plaintext cache used for faster chat loading.':
      '控制用于更快加载聊天的本地明文缓存。',
    'Standard': '标准',
    'Clear on Lock': '锁定时清除',
    'Never Persist': '永不保留',
    'Could not update cache privacy': '无法更新缓存隐私',
    'Could not update message cache privacy': '无法更新消息缓存隐私',
    'Could not update notification privacy': '无法更新通知隐私',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      '选择 Spectra 如何处理本地已解密消息缓存。加密的消息记录仍会保留用于同步和恢复。',
    'Notification Name Privacy': '通知名称隐私',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      '你的公开名称可能会发送给 Expo、Apple 或 Google 推送服务，写入系统通知历史，显示在锁屏上，被附近的人看到，并存储在允许公开名称的收件人设备上。',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      '发送者的公开名称可能会发送给 Expo、Apple 或 Google 推送服务，写入你的系统通知历史，显示在你的锁屏上，被附近的人看到，并存储在此设备的备份中。',
    'Enable Sending Public Name': '启用发送公开名称',
    'Enable Showing Public Names': '启用显示公开名称',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      '输入 PIN 以确认当收件人也允许时，你的公开名称可以出现在通知元数据中。',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      '输入 PIN 以确认发送者的公开名称可以出现在此设备的通知元数据中。',
    'Continue': '继续',
  },
  hi: {
    'Disabled by Spectre Mode': 'Spectre मोड द्वारा अक्षम',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      '{{biometricType}} अनलॉक Spectre मोड द्वारा अक्षम है',
    'Always cleared by Spectre Mode': 'Spectre मोड द्वारा हमेशा साफ किया जाता है',
    'Never Persist is enforced by Spectre Mode.':
      'Spectre मोड में कभी सहेजें नहीं लागू है.',
    'Send delivery receipts when you receive messages.':
      'संदेश मिलने पर डिलीवरी पुष्टियां भेजें.',
    'Send read receipts when you open messages.':
      'संदेश खोलने पर पढ़ने की पुष्टियां भेजें.',
    'Send Public Name in Notifications': 'सूचनाओं में सार्वजनिक नाम भेजें',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'PIN आवश्यक है. आपका सार्वजनिक नाम सूचना मेटाडेटा में तभी दिखेगा जब प्राप्तकर्ता इसकी अनुमति दें.',
    'Show Public Names in Notifications': 'सूचनाओं में सार्वजनिक नाम दिखाएं',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'PIN आवश्यक है. जब प्रेषक भी इसे सक्षम करें, तो उनके सार्वजनिक नाम इस डिवाइस पर दिख सकते हैं.',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'सूचनाओं में सार्वजनिक नाम push प्रदाताओं, ऑपरेटिंग सिस्टम, लॉक स्क्रीन, सूचना इतिहास, आस-पास के लोगों, डिवाइस बैकअप और प्राप्तकर्ता डिवाइसों को दिख सकते हैं. संदेश सामग्री छिपी रहती है.',
    'Clear Visual Media on Lock': 'लॉक पर दृश्य मीडिया साफ करें',
    'Clear avatar and media preview caches when the app locks.':
      'ऐप लॉक होने पर अवतार और मीडिया पूर्वावलोकन कैश साफ करें.',
    'Decrypted Message Cache': 'डिक्रिप्टेड संदेश कैश',
    'Controls the local plaintext cache used for faster chat loading.':
      'तेज चैट लोडिंग के लिए उपयोग होने वाले स्थानीय plaintext कैश को नियंत्रित करता है.',
    'Standard': 'मानक',
    'Clear on Lock': 'लॉक पर साफ करें',
    'Never Persist': 'कभी सहेजें नहीं',
    'Could not update cache privacy': 'कैश गोपनीयता अपडेट नहीं हो सकी',
    'Could not update message cache privacy': 'संदेश कैश गोपनीयता अपडेट नहीं हो सकी',
    'Could not update notification privacy': 'सूचना गोपनीयता अपडेट नहीं हो सकी',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'चुनें कि Spectra स्थानीय डिक्रिप्टेड संदेश कैश को कैसे संभाले. एन्क्रिप्टेड संदेश रिकॉर्ड sync और recovery के लिए संग्रहित रहते हैं.',
    'Notification Name Privacy': 'सूचना नाम गोपनीयता',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'आपका सार्वजनिक नाम Expo, Apple या Google push सेवाओं को भेजा जा सकता है, OS सूचना इतिहास में लिखा जा सकता है, लॉक स्क्रीन पर दिख सकता है, आस-पास के लोगों को दिख सकता है और उन प्राप्तकर्ता डिवाइसों पर संग्रहीत हो सकता है जो सार्वजनिक नामों की अनुमति देते हैं.',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'प्रेषकों के सार्वजनिक नाम Expo, Apple या Google push सेवाओं को भेजे जा सकते हैं, आपके OS सूचना इतिहास में लिखे जा सकते हैं, आपकी लॉक स्क्रीन पर दिख सकते हैं, आस-पास के लोगों को दिख सकते हैं और इस डिवाइस के बैकअप में संग्रहीत हो सकते हैं.',
    'Enable Sending Public Name': 'सार्वजनिक नाम भेजना सक्षम करें',
    'Enable Showing Public Names': 'सार्वजनिक नाम दिखाना सक्षम करें',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'यह पुष्टि करने के लिए अपना PIN दर्ज करें कि प्राप्तकर्ताओं की अनुमति होने पर आपका सार्वजनिक नाम सूचना मेटाडेटा में दिख सकता है.',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'यह पुष्टि करने के लिए अपना PIN दर्ज करें कि प्रेषकों के सार्वजनिक नाम इस डिवाइस पर सूचना मेटाडेटा में दिख सकते हैं.',
    'Continue': 'जारी रखें',
  },
  ar: {
    'Disabled by Spectre Mode': 'معطل بواسطة وضع Spectre',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      'فتح القفل عبر {{biometricType}} معطل بواسطة وضع Spectre',
    'Always cleared by Spectre Mode': 'يمسحه وضع Spectre دائما',
    'Never Persist is enforced by Spectre Mode.':
      'يفرض وضع Spectre عدم الحفظ أبدا.',
    'Send delivery receipts when you receive messages.':
      'إرسال تأكيدات التسليم عند استلام الرسائل.',
    'Send read receipts when you open messages.':
      'إرسال إيصالات القراءة عند فتح الرسائل.',
    'Send Public Name in Notifications': 'إرسال الاسم العام في الإشعارات',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'يتطلب PIN. يسمح بظهور اسمك العام في بيانات الإشعار فقط عندما يسمح المستلمون بذلك.',
    'Show Public Names in Notifications': 'إظهار الأسماء العامة في الإشعارات',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'يتطلب PIN. يسمح بظهور الأسماء العامة للمرسلين على هذا الجهاز عندما يفعّل المرسلون ذلك أيضا.',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'الأسماء العامة في الإشعارات مرئية لمزودي الدفع، ونظام التشغيل، وشاشات القفل، وسجل الإشعارات، والأشخاص القريبين، ونسخ الجهاز الاحتياطية، وأجهزة المستلمين. يبقى محتوى الرسائل مخفيا.',
    'Clear Visual Media on Lock': 'مسح الوسائط المرئية عند القفل',
    'Clear avatar and media preview caches when the app locks.':
      'مسح ذاكرات التخزين المؤقت للصور الرمزية ومعاينات الوسائط عند قفل التطبيق.',
    'Decrypted Message Cache': 'ذاكرة الرسائل المفكوكة التشفير',
    'Controls the local plaintext cache used for faster chat loading.':
      'يتحكم في ذاكرة النص الواضح المحلية المستخدمة لتحميل المحادثات بشكل أسرع.',
    'Standard': 'قياسي',
    'Clear on Lock': 'امسح عند القفل',
    'Never Persist': 'لا تحفظ أبدا',
    'Could not update cache privacy': 'تعذر تحديث خصوصية الذاكرة المؤقتة',
    'Could not update message cache privacy': 'تعذر تحديث خصوصية ذاكرة الرسائل المؤقتة',
    'Could not update notification privacy': 'تعذر تحديث خصوصية الإشعارات',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'اختر كيف يتعامل Spectra مع ذاكرة الرسائل المفكوكة التشفير محليا. تبقى سجلات الرسائل المشفرة محفوظة للمزامنة والاسترداد.',
    'Notification Name Privacy': 'خصوصية الاسم في الإشعارات',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'قد يتم إرسال اسمك العام إلى خدمات Expo أو Apple أو Google للدفع، وتسجيله في سجل إشعارات النظام، وعرضه على شاشات القفل، ورؤيته من أشخاص قريبين، وتخزينه على أجهزة المستلمين التي تسمح بالأسماء العامة.',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'قد يتم إرسال الأسماء العامة للمرسلين إلى خدمات Expo أو Apple أو Google للدفع، وتسجيلها في سجل إشعارات النظام لديك، وعرضها على شاشة القفل، وظهورها للأشخاص القريبين، وتخزينها في نسخ هذا الجهاز الاحتياطية.',
    'Enable Sending Public Name': 'تفعيل إرسال الاسم العام',
    'Enable Showing Public Names': 'تفعيل إظهار الأسماء العامة',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'أدخل PIN لتأكيد أن اسمك العام قد يظهر في بيانات الإشعار عندما يسمح المستلمون بذلك أيضا.',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'أدخل PIN لتأكيد أن الأسماء العامة للمرسلين قد تظهر في بيانات الإشعار على هذا الجهاز.',
    'Continue': 'متابعة',
  },
  bn: {
    'Disabled by Spectre Mode': 'Spectre মোড দ্বারা নিষ্ক্রিয়',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      '{{biometricType}} আনলক Spectre মোড দ্বারা নিষ্ক্রিয়',
    'Always cleared by Spectre Mode': 'Spectre মোড সবসময় মুছে দেয়',
    'Never Persist is enforced by Spectre Mode.':
      'Spectre মোড কখনও সংরক্ষণ নয় প্রয়োগ করে।',
    'Send delivery receipts when you receive messages.':
      'বার্তা পেলে ডেলিভারি নিশ্চিতকরণ পাঠান।',
    'Send read receipts when you open messages.':
      'বার্তা খুললে পঠিত নিশ্চিতকরণ পাঠান।',
    'Send Public Name in Notifications': 'নোটিফিকেশনে পাবলিক নাম পাঠান',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'PIN প্রয়োজন। প্রাপকরা অনুমতি দিলে তবেই আপনার পাবলিক নাম নোটিফিকেশন মেটাডেটায় দেখা যাবে।',
    'Show Public Names in Notifications': 'নোটিফিকেশনে পাবলিক নাম দেখান',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'PIN প্রয়োজন। প্রেরকরাও চালু করলে তাদের পাবলিক নাম এই ডিভাইসে দেখা যেতে পারে।',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'নোটিফিকেশনের পাবলিক নাম push প্রদানকারী, অপারেটিং সিস্টেম, লক স্ক্রিন, নোটিফিকেশন ইতিহাস, কাছাকাছি মানুষ, ডিভাইস ব্যাকআপ এবং প্রাপকের ডিভাইসে দৃশ্যমান হতে পারে। বার্তার বিষয়বস্তু লুকানো থাকে।',
    'Clear Visual Media on Lock': 'লক হলে দৃশ্যমান মিডিয়া মুছুন',
    'Clear avatar and media preview caches when the app locks.':
      'অ্যাপ লক হলে অ্যাভাটার এবং মিডিয়া প্রিভিউ ক্যাশ মুছুন।',
    'Decrypted Message Cache': 'ডিক্রিপ্ট করা বার্তার ক্যাশ',
    'Controls the local plaintext cache used for faster chat loading.':
      'দ্রুত চ্যাট লোডের জন্য ব্যবহৃত স্থানীয় plaintext ক্যাশ নিয়ন্ত্রণ করে।',
    'Standard': 'স্ট্যান্ডার্ড',
    'Clear on Lock': 'লক হলে মুছুন',
    'Never Persist': 'কখনও সংরক্ষণ নয়',
    'Could not update cache privacy': 'ক্যাশ গোপনীয়তা আপডেট করা যায়নি',
    'Could not update message cache privacy': 'বার্তা ক্যাশ গোপনীয়তা আপডেট করা যায়নি',
    'Could not update notification privacy': 'নোটিফিকেশন গোপনীয়তা আপডেট করা যায়নি',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'Spectra কীভাবে স্থানীয় ডিক্রিপ্ট করা বার্তার ক্যাশ পরিচালনা করবে তা বেছে নিন। এনক্রিপ্টেড বার্তার রেকর্ড sync এবং recovery এর জন্য সংরক্ষিত থাকে।',
    'Notification Name Privacy': 'নোটিফিকেশন নামের গোপনীয়তা',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'আপনার পাবলিক নাম Expo, Apple বা Google push সেবায় পাঠানো হতে পারে, OS নোটিফিকেশন ইতিহাসে লেখা হতে পারে, লক স্ক্রিনে দেখা যেতে পারে, কাছাকাছি মানুষ দেখতে পারে এবং পাবলিক নাম অনুমোদনকারী প্রাপকের ডিভাইসে সংরক্ষিত হতে পারে।',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'প্রেরকদের পাবলিক নাম Expo, Apple বা Google push সেবায় পাঠানো হতে পারে, আপনার OS নোটিফিকেশন ইতিহাসে লেখা হতে পারে, আপনার লক স্ক্রিনে দেখা যেতে পারে, কাছাকাছি মানুষের কাছে দৃশ্যমান হতে পারে এবং এই ডিভাইসের ব্যাকআপে সংরক্ষিত হতে পারে।',
    'Enable Sending Public Name': 'পাবলিক নাম পাঠানো চালু করুন',
    'Enable Showing Public Names': 'পাবলিক নাম দেখানো চালু করুন',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'প্রাপকরা অনুমতি দিলে আপনার পাবলিক নাম নোটিফিকেশন মেটাডেটায় দেখা যেতে পারে তা নিশ্চিত করতে PIN লিখুন।',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'প্রেরকদের পাবলিক নাম এই ডিভাইসে নোটিফিকেশন মেটাডেটায় দেখা যেতে পারে তা নিশ্চিত করতে PIN লিখুন।',
    'Continue': 'চালিয়ে যান',
  },
  ur: {
    'Disabled by Spectre Mode': 'Spectre موڈ کے ذریعے غیر فعال',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      '{{biometricType}} ان لاک Spectre موڈ کے ذریعے غیر فعال ہے',
    'Always cleared by Spectre Mode': 'Spectre موڈ ہمیشہ صاف کرتا ہے',
    'Never Persist is enforced by Spectre Mode.':
      'Spectre موڈ کبھی محفوظ نہ کرنے کو نافذ کرتا ہے۔',
    'Send delivery receipts when you receive messages.':
      'پیغامات موصول ہونے پر ترسیل کی رسیدیں بھیجیں۔',
    'Send read receipts when you open messages.':
      'پیغامات کھولنے پر پڑھنے کی رسیدیں بھیجیں۔',
    'Send Public Name in Notifications': 'نوٹیفکیشنز میں عوامی نام بھیجیں',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'PIN درکار ہے۔ آپ کا عوامی نام نوٹیفکیشن میٹا ڈیٹا میں صرف تب ظاہر ہو گا جب وصول کنندگان اجازت دیں۔',
    'Show Public Names in Notifications': 'نوٹیفکیشنز میں عوامی نام دکھائیں',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'PIN درکار ہے۔ جب بھیجنے والے بھی اجازت دیں تو ان کے عوامی نام اس ڈیوائس پر ظاہر ہو سکتے ہیں۔',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'نوٹیفکیشنز میں عوامی نام push فراہم کنندگان، آپریٹنگ سسٹم، لاک اسکرینز، نوٹیفکیشن تاریخ، قریبی لوگوں، ڈیوائس بیک اپس اور وصول کنندہ ڈیوائسز کو نظر آ سکتے ہیں۔ پیغام کا مواد پوشیدہ رہتا ہے۔',
    'Clear Visual Media on Lock': 'لاک پر بصری میڈیا صاف کریں',
    'Clear avatar and media preview caches when the app locks.':
      'ایپ لاک ہونے پر avatar اور میڈیا preview caches صاف کریں۔',
    'Decrypted Message Cache': 'ڈیکرپٹ شدہ پیغام cache',
    'Controls the local plaintext cache used for faster chat loading.':
      'تیز chat loading کے لیے استعمال ہونے والے local plaintext cache کو کنٹرول کرتا ہے۔',
    'Standard': 'معیاری',
    'Clear on Lock': 'لاک پر صاف کریں',
    'Never Persist': 'کبھی محفوظ نہ کریں',
    'Could not update cache privacy': 'cache privacy اپ ڈیٹ نہیں ہو سکی',
    'Could not update message cache privacy': 'message cache privacy اپ ڈیٹ نہیں ہو سکی',
    'Could not update notification privacy': 'notification privacy اپ ڈیٹ نہیں ہو سکی',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'منتخب کریں کہ Spectra local decrypted-message cache کو کیسے سنبھالے۔ encrypted message records sync اور recovery کے لیے محفوظ رہتے ہیں۔',
    'Notification Name Privacy': 'نوٹیفکیشن نام کی privacy',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'آپ کا عوامی نام Expo، Apple یا Google push services کو بھیجا جا سکتا ہے، OS notification history میں لکھا جا سکتا ہے، lock screens پر دکھایا جا سکتا ہے، قریبی لوگ دیکھ سکتے ہیں، اور public names کی اجازت دینے والی recipient devices پر محفوظ ہو سکتا ہے۔',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'بھیجنے والوں کے public names Expo، Apple یا Google push services کو بھیجے جا سکتے ہیں، آپ کی OS notification history میں لکھے جا سکتے ہیں، آپ کی lock screen پر دکھائے جا سکتے ہیں، قریبی لوگوں کو نظر آ سکتے ہیں، اور اس device کے backups میں محفوظ ہو سکتے ہیں۔',
    'Enable Sending Public Name': 'public name بھیجنا فعال کریں',
    'Enable Showing Public Names': 'public names دکھانا فعال کریں',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'یہ تصدیق کرنے کے لیے اپنا PIN درج کریں کہ recipients کی اجازت پر آپ کا public name notification metadata میں ظاہر ہو سکتا ہے۔',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'یہ تصدیق کرنے کے لیے اپنا PIN درج کریں کہ senders کے public names اس device پر notification metadata میں ظاہر ہو سکتے ہیں۔',
    'Continue': 'جاری رکھیں',
  },
  id: {
    'Disabled by Spectre Mode': 'Dinonaktifkan oleh mode Spectre',
    '{{biometricType}} unlock is disabled by Spectre Mode':
      'Buka kunci {{biometricType}} dinonaktifkan oleh mode Spectre',
    'Always cleared by Spectre Mode': 'Selalu dibersihkan oleh mode Spectre',
    'Never Persist is enforced by Spectre Mode.':
      'Jangan Pernah Simpan diberlakukan oleh mode Spectre.',
    'Send delivery receipts when you receive messages.':
      'Kirim tanda terima pengiriman saat Anda menerima pesan.',
    'Send read receipts when you open messages.':
      'Kirim tanda dibaca saat Anda membuka pesan.',
    'Send Public Name in Notifications': 'Kirim Nama Publik di Notifikasi',
    'Requires PIN. Lets your public name appear in notification metadata only when recipients allow it.':
      'Memerlukan PIN. Membiarkan nama publik Anda muncul di metadata notifikasi hanya jika penerima mengizinkannya.',
    'Show Public Names in Notifications': 'Tampilkan Nama Publik di Notifikasi',
    'Requires PIN. Allows sender public names to appear on this device when senders also opt in.':
      'Memerlukan PIN. Mengizinkan nama publik pengirim muncul di perangkat ini saat pengirim juga ikut mengaktifkannya.',
    'Public names in notifications are visible to push providers, the operating system, lock screens, notification history, nearby people, device backups, and recipient devices. Message content remains hidden.':
      'Nama publik di notifikasi terlihat oleh penyedia push, sistem operasi, layar kunci, riwayat notifikasi, orang di sekitar, cadangan perangkat, dan perangkat penerima. Isi pesan tetap tersembunyi.',
    'Clear Visual Media on Lock': 'Bersihkan Media Visual saat Terkunci',
    'Clear avatar and media preview caches when the app locks.':
      'Bersihkan cache avatar dan pratinjau media saat aplikasi terkunci.',
    'Decrypted Message Cache': 'Cache Pesan Terdekripsi',
    'Controls the local plaintext cache used for faster chat loading.':
      'Mengontrol cache plaintext lokal yang digunakan untuk memuat chat lebih cepat.',
    'Standard': 'Standar',
    'Clear on Lock': 'Bersihkan saat Terkunci',
    'Never Persist': 'Jangan Pernah Simpan',
    'Could not update cache privacy': 'Tidak dapat memperbarui privasi cache',
    'Could not update message cache privacy': 'Tidak dapat memperbarui privasi cache pesan',
    'Could not update notification privacy': 'Tidak dapat memperbarui privasi notifikasi',
    'Choose how Spectra handles the local decrypted-message cache. Encrypted message records remain stored for sync and recovery.':
      'Pilih cara Spectra menangani cache pesan terdekripsi lokal. Catatan pesan terenkripsi tetap disimpan untuk sinkronisasi dan pemulihan.',
    'Notification Name Privacy': 'Privasi Nama Notifikasi',
    'Your public name may be sent to Expo, Apple or Google push services, written into OS notification history, shown on lock screens, seen by nearby people, and stored on recipient devices that allow public names.':
      'Nama publik Anda dapat dikirim ke layanan push Expo, Apple, atau Google, ditulis ke riwayat notifikasi OS, ditampilkan di layar kunci, dilihat orang sekitar, dan disimpan di perangkat penerima yang mengizinkan nama publik.',
    'Public names from senders may be sent to Expo, Apple or Google push services, written into your OS notification history, shown on your lock screen, visible to nearby people, and stored in backups for this device.':
      'Nama publik dari pengirim dapat dikirim ke layanan push Expo, Apple, atau Google, ditulis ke riwayat notifikasi OS Anda, ditampilkan di layar kunci, terlihat oleh orang sekitar, dan disimpan dalam cadangan perangkat ini.',
    'Enable Sending Public Name': 'Aktifkan Pengiriman Nama Publik',
    'Enable Showing Public Names': 'Aktifkan Tampilan Nama Publik',
    'Enter your PIN to confirm that your public name may appear in notification metadata when recipients also allow it.':
      'Masukkan PIN Anda untuk mengonfirmasi bahwa nama publik Anda dapat muncul di metadata notifikasi saat penerima juga mengizinkannya.',
    'Enter your PIN to confirm that sender public names may appear in notification metadata on this device.':
      'Masukkan PIN Anda untuk mengonfirmasi bahwa nama publik pengirim dapat muncul di metadata notifikasi pada perangkat ini.',
    'Continue': 'Lanjutkan',
  },
}

const spectreSetupChoiceTranslations: Record<
  FeatureLanguage,
  NonNullable<FeatureNamespaceTranslations['settings']>
> = {
  en: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'Use the saved Spectre account or create a fresh expendable account for this session.',
  },
  es: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'Usa la cuenta Spectre guardada o crea una cuenta desechable nueva para esta sesión.',
  },
  fr: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'Utilisez le compte Spectre enregistré ou créez un nouveau compte jetable pour cette session.',
  },
  de: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'Verwenden Sie das gespeicherte Spectre-Konto oder erstellen Sie für diese Sitzung ein neues löschbares Konto.',
  },
  it: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'Usa l\'account Spectre salvato o crea un nuovo account usa e getta per questa sessione.',
  },
  pt: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'Use a conta Spectre salva ou crie uma nova conta descartável para esta sessão.',
  },
  ru: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'Используйте сохраненную учетную запись Spectre или создайте новую одноразовую учетную запись для этого сеанса.',
  },
  'zh-Hans': {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      '使用已保存的 Spectre 账户，或为本次会话创建新的临时账户。',
  },
  hi: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'saved Spectre account इस्तेमाल करें या इस session के लिए नया expendable account बनाएं.',
  },
  ar: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'استخدم حساب Spectre المحفوظ أو أنشئ حسابا قابلا للمحو جديدا لهذه الجلسة.',
  },
  bn: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'সংরক্ষিত Spectre অ্যাকাউন্ট ব্যবহার করুন বা এই সেশনের জন্য নতুন মুছে ফেলা যায় এমন অ্যাকাউন্ট তৈরি করুন।',
  },
  ur: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'محفوظ Spectre اکاؤنٹ استعمال کریں یا اس سیشن کے لیے نیا expendable اکاؤنٹ بنائیں۔',
  },
  id: {
    'Use the saved Spectre account or create a fresh expendable account for this session.':
      'Gunakan akun Spectre yang tersimpan atau buat akun sekali pakai baru untuk sesi ini.',
  },
}

const contactArchiveCommonTranslations: Record<
  FeatureLanguage,
  NonNullable<FeatureNamespaceTranslations['common']>
> = Object.fromEntries(
  ([
    'en',
    'ar',
    'bn',
    'de',
    'es',
    'fr',
    'hi',
    'id',
    'it',
    'pt',
    'ru',
    'ur',
    'zh-Hans',
  ] as const).map((language) => [
    language,
    {
      'Close': 'Close',
      'Refresh': 'Refresh',
      'At least 16 characters': 'At least 16 characters',
      'Contacts: {{contacts}}': language === 'es'
        ? 'Contactos: {{contacts}}'
        : 'Contacts: {{contacts}}',
      'Contact Archive': language === 'es' ? 'Archivo de contactos' : 'Contact Archive',
      'Encrypted contact archive': language === 'es'
        ? 'Archivo de contactos cifrado'
        : 'Encrypted contact archive',
      'Export an encrypted file you control, then import it later to preserve saved contacts.':
        'Export an encrypted file you control, then import it later to preserve saved contacts.',
      'Archive Passphrase Required': 'Archive Passphrase Required',
      'Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.':
        'Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.',
      'Save encrypted contact archive': 'Save encrypted contact archive',
      'Archive Exported': 'Archive Exported',
      'Export Failed': 'Export Failed',
      'Import Complete': 'Import Complete',
      'Import Failed': 'Import Failed',
      'Import contact archive?': 'Import contact archive?',
      'Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.':
        'Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.',
      'Contact archives are unavailable while Spectre Mode is active.':
        'Contact archives are unavailable while Spectre Mode is active.',
      'No active wallet is available.': 'No active wallet is available.',
      'Unlock your vault before managing a contact archive.':
        'Unlock your vault before managing a contact archive.',
      'Contact archives are unavailable for Spectre accounts.':
        'Contact archives are unavailable for Spectre accounts.',
      'Archives unavailable': 'Archives unavailable',
      'The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.':
        'The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.',
      'Archive Passphrase': 'Archive Passphrase',
      'Export file': 'Export file',
      'Import file': 'Import file',
      'Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.':
        'Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.',
    },
  ]),
) as unknown as Record<FeatureLanguage, NonNullable<FeatureNamespaceTranslations['common']>>

const contactArchiveSettingsTranslations: Record<
  FeatureLanguage,
  NonNullable<FeatureNamespaceTranslations['settings']>
> = Object.fromEntries(
  ([
    'en',
    'ar',
    'bn',
    'de',
    'es',
    'fr',
    'hi',
    'id',
    'it',
    'pt',
    'ru',
    'ur',
    'zh-Hans',
  ] as const).map((language) => [
    language,
    {
      'Contact Archive': language === 'es' ? 'Archivo de contactos' : 'Contact Archive',
      'Encrypted contact archive': language === 'es'
        ? 'Archivo de contactos cifrado'
        : 'Encrypted contact archive',
      'Export an encrypted file you control, then import it later to preserve saved contacts.':
        'Export an encrypted file you control, then import it later to preserve saved contacts.',
      'Disabled by Spectre Mode': 'Disabled by Spectre Mode',
      'Export and import encrypted contacts': 'Export and import encrypted contacts',
      'Unable to complete Spectre activation': 'Unable to complete Spectre activation',
      'One anonymous activation token can be requested every 24 hours.':
        'One anonymous activation token can be requested every 24 hours.',
      'Backend is not configured for Spectre activation':
        'Backend is not configured for Spectre activation',
      'A verified Backend session is required for Spectre activation':
        'A verified Backend session is required for Spectre activation',
      'Failed to refresh Spectre access': 'Failed to refresh Spectre access',
    },
  ]),
) as unknown as Record<FeatureLanguage, NonNullable<FeatureNamespaceTranslations['settings']>>

function withFeatureSupplements(
  language: FeatureLanguage,
  translations: FeatureNamespaceTranslations,
): FeatureNamespaceTranslations {
  return {
    ...translations,
    common: {
      ...translations.common,
      ...spectreCommonTranslations[language],
      ...contactArchiveCommonTranslations[language],
      ...(homeScreenTranslations[language].common ?? {}),
      ...(localProfileVdfTranslations[language].common ?? {}),
      ...(walletIndexTranslations[language].common ?? {}),
    },
    auth: {
      ...translations.auth,
      ...(localProfileVdfTranslations[language].auth ?? {}),
    },
    navigation: {
      ...translations.navigation,
      ...(homeScreenTranslations[language].navigation ?? {}),
    },
    chat: {
      ...translations.chat,
      ...(homeScreenTranslations[language].chat ?? {}),
      ...chatStatusTranslations[language],
    },
    settings: {
      ...translations.settings,
      ...securitySettingsTranslations[language],
      ...spectreSetupChoiceTranslations[language],
      ...contactArchiveSettingsTranslations[language],
      ...(walletIndexTranslations[language].settings ?? {}),
    },
    profile: {
      ...translations.profile,
      ...(localProfileVdfTranslations[language].profile ?? {}),
    },
  }
}

export const featureTranslations: Record<FeatureLanguage, FeatureNamespaceTranslations> = {
  en: withFeatureSupplements('en', en),
  ar: withFeatureSupplements('ar', ar),
  bn: withFeatureSupplements('bn', bn),
  de: withFeatureSupplements('de', de),
  es: withFeatureSupplements('es', es),
  fr: withFeatureSupplements('fr', fr),
  hi: withFeatureSupplements('hi', hi),
  id: withFeatureSupplements('id', id),
  it: withFeatureSupplements('it', it),
  pt: withFeatureSupplements('pt', pt),
  ru: withFeatureSupplements('ru', ru),
  ur: withFeatureSupplements('ur', ur),
  'zh-Hans': withFeatureSupplements('zh-Hans', zhHans),
}

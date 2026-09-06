/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LocaleTranslationOverrides } from './translationOverrideTypes'

const translations = {
  common: {
    'Creating your post-quantum identity...': 'Creando tu identidad poscuántica...',
    'Encrypted group sender keys': 'Claves de remitente de grupo cifradas',
    'End-to-end encrypted': 'Cifrado de extremo a extremo',
    'End-to-end encryption available for supported chats':
      'Cifrado de extremo a extremo disponible para chats compatibles',
    'Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.':
      'Las claves de grupo se distribuyen a través de tus sesiones directas cifradas existentes. Al eliminar a un miembro, se rota automáticamente la clave de grupo activa.',
    'Hybrid post-quantum messaging': 'Mensajería híbrida poscuántica',
    'ML-DSA-65 post-quantum signatures': 'Firmas poscuánticas ML-DSA-65',
    'Post-quantum': 'Poscuántico',
    'Post-quantum identity keys ready': 'Claves de identidad poscuánticas listas',
    'Securing your encrypted vault...': 'Protegiendo tu bóveda cifrada...',
    'Supported direct messages are end-to-end encrypted.':
      'Los mensajes directos compatibles están cifrados de extremo a extremo.',
    ' +{{count}} more': ' +{{count}} más',
    '{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}':
      '{{bridgeCount}} puentes {{transport}} cargados. {{routeMessage}}',
    '{{count}} attachment_one': '{{count}} archivo adjunto',
    '{{count}} attachment_other': '{{count}} archivos adjuntos',
    '{{count}} groups in common': '{{count}} grupos en común',
    '{{count}} slots available': '{{count}} espacios disponibles',
    '{{count}} tokens': '{{count}} tokens',
    '{{error}} This request used the normal network while Tor was disabled.':
      '{{error}} Esta solicitud usó la red normal mientras Tor estaba desactivado.',
    '{{network}} address': 'Dirección de {{network}}',
    '{{senderName}} requested': '{{senderName}} solicitó',
    'Add {{count}}': 'Agregar {{count}}',
    'Add ETH before sending this token.': 'Agrega ETH antes de enviar este token.',
    'Add text': 'Agregar texto',
    'Add user': 'Agregar usuario',
    Allowed: 'Permitido',
    'Apply crop': 'Aplicar recorte',
    'Applying bridge configuration…': 'Aplicando la configuración de puentes…',
    'Applying direct Tor…': 'Aplicando Tor directo…',
    'Archive Exported': 'Archivo exportado',
    'Archive Passphrase': 'Frase de contraseña del archivo',
    'Archive Passphrase Required': 'Se requiere una frase de contraseña para el archivo',
    'Archives unavailable': 'Archivos no disponibles',
    'At least 16 characters': 'Al menos 16 caracteres',
    Available: 'Disponible',
    Back: 'Atrás',
    'BIP39 word suggestions': 'Sugerencias de palabras BIP39',
    Block: 'Bloquear',
    'Block {{displayName}}? You will no longer receive messages from them.':
      '¿Bloquear a {{displayName}}? Ya no recibirás sus mensajes.',
    Blockchain: 'Cadena de bloques',
    'Bridge Update Failed': 'No se pudo actualizar el puente',
    Buy: 'Comprar',
    'Calculated by network': 'Calculado por la red',
    'Calls are only supported in direct chats.':
      'Las llamadas solo son compatibles con chats directos.',
    'Calls unavailable': 'Llamadas no disponibles',
    'Cancel Spectre Mode': 'Cancelar el modo Spectre',
    'Canceling Spectre Mode...': 'Cancelando el modo Spectre...',
    'Chat unavailable': 'Chat no disponible',
    Chats: 'Chats',
    'Choose how long messages remain visible after they are read.':
      'Elige cuánto tiempo permanecen visibles los mensajes después de leerlos.',
    'Claim Refund': 'Reclamar reembolso',
    'Clear chat': 'Vaciar chat',
    Close: 'Cerrar',
    'Close media preview': 'Cerrar vista previa multimedia',
    'Close poll failed': 'No se pudo cerrar la encuesta',
    Color: 'Color',
    'Confirm Transaction': 'Confirmar transacción',
    'Connecting encrypted chat...': 'Conectando chat cifrado...',
    'Connecting...': 'Conectando...',
    'Connection failed': 'La conexión falló',
    'Contact archives are unavailable for Spectre accounts.':
      'Los archivos de contactos no están disponibles para cuentas Spectre.',
    'Contact archives are unavailable while Spectre Mode is active.':
      'Los archivos de contactos no están disponibles mientras el modo Spectre está activo.',
    'Copy TX': 'Copiar TX',
    'Could not add members': 'No se pudieron agregar miembros',
    'Could not import shared content': 'No se pudo importar el contenido compartido',
    'Could not open this chat': 'No se pudo abrir este chat',
    'Could not open this chat.': 'No se pudo abrir este chat.',
    'Could not save the edited image. Please try again.':
      'No se pudo guardar la imagen editada. Inténtalo de nuevo.',
    'Could not save your public name. Please try again.':
      'No se pudo guardar tu nombre público. Inténtalo de nuevo.',
    'Could not update notifications': 'No se pudieron actualizar las notificaciones',
    'Could not update this image. Please try again.':
      'No se pudo actualizar esta imagen. Inténtalo de nuevo.',
    Created: 'Creado',
    Creator: 'Creador',
    Crop: 'Recortar',
    'Diffusion channels require Spectre access.':
      'Los canales de difusión requieren acceso a Spectre.',
    'Disappearing messages': 'Mensajes temporales',
    'Drag text on the image to reposition it.':
      'Arrastra el texto sobre la imagen para cambiar su posición.',
    'Drag the crop frame or its corners, then apply.':
      'Arrastra el marco de recorte o sus esquinas y, después, aplica los cambios.',
    Draw: 'Dibujar',
    'Each recovery phrase restores up to 5 transparent EXO accounts.':
      'Cada frase de recuperación restaura hasta 5 cuentas EXO transparentes.',
    Edit: 'Editar',
    'Edit and resend': 'Editar y reenviar',
    'Edit image': 'Editar imagen',
    'Enter a valid amount': 'Ingresa un importe válido',
    'Enter a valid EXO price greater than zero.':
      'Ingresa un precio de EXO válido mayor que cero.',
    'ERC-20 on Ethereum Mainnet': 'ERC-20 en la red principal de Ethereum',
    'ERC-20 Tokens': 'Tokens ERC-20',
    'Est. gas: {{amount}} {{symbol}}': 'Gas estimado: {{amount}} {{symbol}}',
    'Establishing secure call...': 'Estableciendo llamada segura...',
    'Estimated fee': 'Comisión estimada',
    Euro: 'Euro',
    'EXO account creation is disabled while Spectre Mode is active.':
      'La creación de cuentas EXO está desactivada mientras el modo Spectre está activo.',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Exporta un archivo cifrado que controles e impórtalo más tarde para conservar los contactos guardados.',
    'Export Failed': 'La exportación falló',
    'Export file': 'Exportar archivo',
    'Failed to claim refund': 'No se pudo reclamar el reembolso',
    'Failed to complete the paid join flow':
      'No se pudo completar el proceso de incorporación de pago',
    'Failed to create poll': 'No se pudo crear la encuesta',
    'Failed to create poll message': 'No se pudo crear el mensaje de encuesta',
    'Failed to create request': 'No se pudo crear la solicitud',
    'Failed to Load': 'No se pudo cargar',
    'Failed to load market': 'No se pudo cargar el mercado',
    'Failed to save membership access settings':
      'No se pudo guardar la configuración de acceso de membresía',
    'Failed to switch EXO account': 'No se pudo cambiar de cuenta EXO',
    'Failed to verify the payment confirmation.':
      'No se pudo verificar la confirmación del pago.',
    'Fetched over the normal network while Tor was disabled.':
      'Obtenido mediante la red normal mientras Tor estaba desactivado.',
    'Group members': 'Miembros del grupo',
    Hidden: 'Oculto',
    'This removes {{displayName}} from this device, including the chat and its encryption session. They are not notified. This cannot be undone.':
      'Esto elimina a {{displayName}} de este dispositivo, incluido el chat y su sesión de cifrado. No se les avisa. Esto no se puede deshacer.',
    'Delete Contact': 'Eliminar contacto',
    'Delete Failed': 'No se pudo eliminar',
    "Hide this contact's public name in your push notifications.":
      'Ocultar el nombre público de este contacto en tus notificaciones push.',
    'I understand': 'Entiendo',
    'Import a transparent EXO recovery phrase into this unlocked root vault.':
      'Importa una frase de recuperación EXO transparente en esta bóveda raíz desbloqueada.',
    'Import Complete': 'Importación completada',
    'Import contact archive?': '¿Importar archivo de contactos?',
    'Import Failed': 'La importación falló',
    'Import file': 'Importar archivo',
    'Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.':
      'Los contactos importados se combinan con los contactos que ya están en este dispositivo. Los chats, mensajes, sesiones, claves de grupo y archivos multimedia nunca se importan.',
    'Incorrect PIN': 'PIN incorrecto',
    'Invalid {{network}} address': 'Dirección de {{network}} no válida',
    'Invalid amount': 'Importe no válido',
    'Invalid market ID': 'ID de mercado no válido',
    'Invalid recipient address': 'Dirección del destinatario no válida',
    'Load this image before editing it.':
      'Carga esta imagen antes de editarla.',
    'Loading pool data...': 'Cargando datos del pool...',
    'Loading shared content...': 'Cargando contenido compartido...',
    'Loading voice note...': 'Cargando nota de voz...',
    Max: 'Máx.',
    Media: 'Multimedia',
    'Media, links and docs': 'Multimedia, enlaces y documentos',
    'Message unavailable': 'Mensaje no disponible',
    'Minimize call': 'Minimizar llamada',
    Muted: 'Silenciado',
    'My {{network}} Address': 'Mi dirección de {{network}}',
    'Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}':
      'Ni la configuración solicitada ni los puentes anteriores pudieron conectarse. Tor permanece activado y el tráfico del backend sigue bloqueado. {{error}}',
    Network: 'Red',
    'Network State': 'Estado de la red',
    'Network: Mozaga native EXO': 'Red: EXO nativo de Mozaga',
    Next: 'Siguiente',
    'No active wallet is available.': 'No hay una cartera activa disponible.',
    'No address for this network': 'No hay dirección para esta red',
    'No documents shared yet': 'Aún no hay documentos compartidos',
    'No links shared yet': 'Aún no hay enlaces compartidos',
    'No Spectra chats are available for sharing yet.':
      'Aún no hay chats de Spectra disponibles para compartir.',
    'No tokens found': 'No se encontraron tokens',
    Notifications: 'Notificaciones',
    On: 'Activado',
    'Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.':
      'Solo se incluyen los contactos guardados y sus etiquetas. Los contactos existentes se conservan y los restaurados están disponibles inmediatamente después de importarlos.',
    'Opening...': 'Abriendo...',
    'Paid access setup incomplete': 'Configuración de acceso de pago incompleta',
    'Paid by {{payerName}}': 'Pagado por {{payerName}}',
    'Paid in {{symbol}}': 'Pagado en {{symbol}}',
    'Paste recovery phrase': 'Pegar frase de recuperación',
    'Pay {{amount}}': 'Pagar {{amount}}',
    'Pay request': 'Pagar solicitud de pago',
    Payment: 'Pago',
    'Payment already submitted': 'El pago ya se envió',
    'Payment failed': 'El pago falló',
    'Payment message received': 'Mensaje de pago recibido',
    'Payment paid': 'Pago realizado',
    'Payment Pending': 'Pago pendiente',
    'Payment recorded': 'Pago registrado',
    'Payment request: {{amount}} {{symbol}}':
      'Solicitud de pago: {{amount}} {{symbol}}',
    'Payment Required': 'Se requiere pago',
    'Payment submitted': 'Pago enviado',
    'Payment submitted: {{amount}} {{symbol}}':
      'Pago enviado: {{amount}} {{symbol}}',
    'Platform fee: {{fee}}': 'Comisión de plataforma: {{fee}}',
    'Please allow access to your photo library to change the group photo.':
      'Permite el acceso a tu biblioteca de fotos para cambiar la foto del grupo.',
    'Please retry the chat setup first.':
      'Primero vuelve a intentar la configuración del chat.',
    'Please wait until this chat is ready.':
      'Espera hasta que este chat esté listo.',
    'Post request': 'Publicar solicitud',
    'Preparing voice note...': 'Preparando nota de voz...',
    Previous: 'Anterior',
    'Previous Bridges Restored': 'Puentes anteriores restaurados',
    'Private handoff': 'Transferencia privada',
    'Public name in notifications': 'Nombre público en las notificaciones',
    'Receive address': 'Dirección de recepción',
    'Receive Crypto': 'Recibir criptomonedas',
    Recipient: 'Destinatario',
    'Recipient {{network}} Address': 'Dirección de {{network}} del destinatario',
    'Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.':
      'Los destinatarios solo se muestran dentro de Spectra. iOS solo ve el destino de la app Spectra.',
    'Reconnecting...': 'Reconectando...',
    'Recovering secure call...': 'Recuperando llamada segura...',
    'Recovery word {{number}}': 'Palabra de recuperación {{number}}',
    Refresh: 'Actualizar',
    'Request a payment in this chat': 'Solicitar un pago en este chat',
    'Requested asset is not available in this wallet':
      'El activo solicitado no está disponible en esta cartera',
    Reset: 'Restablecer',
    'Retry failed': 'El reintento falló',
    'Review Send': 'Revisar envío',
    'Root account required': 'Se requiere una cuenta raíz',
    Rotate: 'Rotar',
    'Save encrypted contact archive': 'Guardar archivo de contactos cifrado',
    'Search contacts...': 'Buscar contactos...',
    'Secure call waiting': 'Llamada segura en espera',
    'Securing chat...': 'Protegiendo el chat...',
    'Preparing secure channel...': 'Protegiendo el chat...',
    'Select Blockchain': 'Seleccionar cadena de bloques',
    'Select drawing color': 'Seleccionar color de dibujo',
    Sell: 'Vender',
    'Send {{symbol}}': 'Enviar {{symbol}}',
    'Send {{symbol}} to my {{network}} address:\n{{address}}':
      'Envía {{symbol}} a mi dirección de {{network}}:\n{{address}}',
    'Send ETH': 'Enviar ETH',
    'Sending as {{account}}': 'Enviando como {{account}}',
    'Sending transaction...': 'Enviando transacción...',
    'Share {{network}} Address': 'Compartir dirección de {{network}}',
    'Share contact': 'Compartir contacto',
    'Share to Spectra': 'Compartir con Spectra',
    'Shared content is missing. Please share it again.':
      'Falta contenido compartido. Vuelve a compartirlo.',
    'Snowflake bootstrap privacy notice':
      'Aviso de privacidad de inicio de Snowflake',
    'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.':
      'Snowflake usa infraestructura de inicio de WebRTC, incluidos servicios de intermediario, STUN y proxies voluntarios. Esos servicios pueden observar la dirección IP de tu dispositivo y el momento de conexión. Tor protege el tráfico después de establecer un circuito, pero no puede ocultar esta conexión inicial.',
    'Solana private key is not available':
      'La clave privada de Solana no está disponible',
    'Solana wallet not available': 'La cartera de Solana no está disponible',
    'Something went wrong. Please try again.':
      'Algo salió mal. Inténtalo de nuevo.',
    'Spectre access includes one diffusion channel.':
      'El acceso a Spectre incluye un canal de difusión.',
    'SPL Tokens': 'Tokens SPL',
    'SPL tokens on Solana': 'Tokens SPL en Solana',
    Stroke: 'Trazo',
    'Switch to your root EXO account to create transparent EXO accounts.':
      'Cambia a tu cuenta EXO raíz para crear cuentas EXO transparentes.',
    'Switch to your root EXO account to import transparent EXO accounts.':
      'Cambia a tu cuenta EXO raíz para importar cuentas EXO transparentes.',
    'Switching...': 'Cambiando...',
    'Tap to load voice note': 'Toca para cargar la nota de voz',
    'Tap to review and pay': 'Toca para revisar y pagar',
    'Tap to view shared links and documents':
      'Toca para ver enlaces y documentos compartidos',
    Text: 'Texto',
    'Text or link': 'Texto o enlace',
    'The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.':
      'El archivo se cifra en este dispositivo antes de compartirlo. Nunca se sube a Spectra. Guarda el archivo y la frase de contraseña por separado; Spectra no puede recuperar ninguno de los dos.',
    'The payment transaction failed on-chain.':
      'La transacción de pago falló en cadena.',
    'This fetch used the normal network while Tor was disabled.':
      'Esta solicitud usó la red normal mientras Tor estaba desactivado.',
    'This file is not available on this device yet.':
      'Este archivo aún no está disponible en este dispositivo.',
    'This image could not be edited right now.':
      'Esta imagen no se pudo editar en este momento.',
    'This message was deleted': 'Este mensaje se eliminó',
    'This request has already been marked as paid.':
      'Esta solicitud ya se marcó como pagada.',
    'This secure chat is not ready yet. Please try again in a moment.':
      'Este chat seguro aún no está listo. Inténtalo de nuevo en un momento.',
    'This voice note could not be loaded right now.':
      'Esta nota de voz no se pudo cargar en este momento.',
    'This wallet does not have an account for {{network}}.':
      'Esta cartera no tiene una cuenta para {{network}}.',
    To: 'Para',
    'Toggle media controls': 'Alternar controles multimedia',
    'Tor Bridges': 'Puentes Tor',
    'Tor Connection Failed': 'La conexión de Tor falló',
    'Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}':
      'Tor no pudo conectarse con la configuración solicitada, por lo que se restauraron los puentes anteriores que funcionaban. {{error}}',
    'Tor is disabled, so bridge requests will use the normal network.':
      'Tor está desactivado, por lo que las solicitudes de puentes usarán la red normal.',
    'Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.':
      'Tor está activado pero no conectado. Desactiva Tor antes de obtener puentes de inicio mediante la red normal.',
    'Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.':
      'Tor todavía se está conectando. Las solicitudes de puentes permanecen bloqueadas hasta que haya un circuito de Tor disponible.',
    'Transaction failed on-chain': 'La transacción falló en cadena',
    'Transparent EXO accounts are restored from your recovery phrase.':
      'Las cuentas EXO transparentes se restauran desde tu frase de recuperación.',
    'TRC-20 on Tron': 'TRC-20 en Tron',
    'TRC-20 Tokens': 'Tokens TRC-20',
    'Tron private key is not available':
      'La clave privada de Tron no está disponible',
    'Tron wallet not available': 'La cartera de Tron no está disponible',
    'Try Again': 'Intentar de nuevo',
    'Unable to edit image': 'No se pudo editar la imagen',
    'Unable to load voice note': 'No se pudo cargar la nota de voz',
    'Unable to open link': 'No se pudo abrir el enlace',
    'Unable to remove recipient': 'No se pudo quitar al destinatario',
    'Unable to retry': 'No se pudo reintentar',
    'Unable to send': 'No se pudo enviar',
    Unblock: 'Desbloquear',
    'Unblock {{displayName}}? They will be able to send you messages again.':
      '¿Desbloquear a {{displayName}}? Podrá volver a enviarte mensajes.',
    Undo: 'Deshacer',
    'Unlock the wallet that will pay for this membership and try again.':
      'Desbloquea la cartera que pagará esta membresía e inténtalo de nuevo.',
    'Unlock your vault before managing a contact archive.':
      'Desbloquea tu bóveda antes de administrar un archivo de contactos.',
    'Unsupported {{type}} attachment': 'Adjunto de tipo {{type}} no compatible',
    'Unsupported attachment': 'Adjunto no compatible',
    'Upgrade to Spectre to create one diffusion channel.':
      'Actualiza a Spectre para crear un canal de difusión.',
    'Use {{word}} for recovery word {{number}}':
      'Usar {{word}} como palabra de recuperación {{number}}',
    'Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.':
      'Usa una frase de contraseña única de al menos 16 caracteres que incluya letras, números y símbolos. Spectra no puede recuperarla.',
    'Use Biometric': 'Usar biometría',
    'Use original': 'Usar original',
    'Use the original offline backup you created during onboarding if you need the phrase again. If it is lost, create a newly backed up wallet and migrate to it. The device cannot reveal the old phrase.':
      'Usa la copia de seguridad original sin conexión que creaste durante la configuración inicial si vuelves a necesitar la frase. Si la pierdes, crea una cartera con una nueva copia de seguridad y migra a ella. El dispositivo no puede revelar la frase anterior.',
    'V1 supports Mozaga native EXO only. The company fee is {{fee}}.':
      'V1 solo admite EXO nativo de Mozaga. La comisión de la empresa es {{fee}}.',
    'via {{account}}': 'mediante {{account}}',
    'Voice note unavailable': 'Nota de voz no disponible',
    Volume: 'Volumen',
    Wallets: 'Carteras',
    'You can import up to 5 transparent EXO accounts from one recovery phrase.':
      'Puedes importar hasta 5 cuentas EXO transparentes desde una frase de recuperación.',
    'You requested': 'Solicitaste',
    "You'll enter the {{network}} address in the next step":
      'Ingresarás la dirección de {{network}} en el siguiente paso',
    'Your payment was submitted but is still waiting for confirmation. Reopen this invite in a moment to finish joining.':
      'Tu pago se envió, pero aún espera confirmación. Vuelve a abrir esta invitación en un momento para terminar de unirte.',
    'Spectra logo': 'Logotipo de Spectra',
    '{{width}} px': '{{width}} px',
    'External links unavailable': 'Enlaces externos no disponibles',
    'External links are unavailable while Spectre Mode is active.':
      'Los enlaces externos no están disponibles mientras el modo Spectre está activo.',
    'New encrypted message': 'Nuevo mensaje cifrado',
    'New message': 'Nuevo mensaje',
    'New group message': 'Nuevo mensaje de grupo',
    Default: 'Predeterminado',
    Messages: 'Mensajes',
    Calls: 'Llamadas',
    Transfers: 'Transferencias',
    'New message notifications': 'Notificaciones de mensajes nuevos',
    'Secure call notifications': 'Notificaciones de llamadas seguras',
    'Wallet transfer notifications': 'Notificaciones de transferencias de la cartera',
    'Secure call': 'Llamada segura',
    'A newer version of Spectra is available. Update to get the latest features and fixes.':
      'Hay una versión más reciente de Spectra disponible. Actualiza para obtener las últimas funciones y correcciones.',
    'This version of Spectra is no longer supported. Update to continue using secure services.':
      'Esta versión de Spectra ya no es compatible. Actualiza la app para seguir usando los servicios seguros.',
    'Update available': 'Actualización disponible',
    'Update required': 'Actualización obligatoria',
    'Update Spectra': 'Actualizar Spectra',
  },
  auth: {
    '{{count}} characters maximum.': 'Máximo de {{count}} caracteres.',
    'Account import progress': 'Progreso de importación de cuenta',
    'Authenticate to upgrade biometric unlock':
      'Autentícate para actualizar el desbloqueo biométrico',
    'Choose a Public Name': 'Elige un nombre público',
    'Deriving wallets...': 'Derivando carteras...',
    'Finishing previous account deletion...':
      'Finalizando la eliminación de la cuenta anterior...',
    'Go back': 'Volver',
    Important: 'Importante',
    'Importing Account': 'Importando cuenta',
    'Optional public name for chats': 'Nombre público opcional para chats',
    'Public Name': 'Nombre público',
    'Public name contains invalid text.':
      'El nombre público contiene texto no válido.',
    'Public name contains unsupported characters':
      'El nombre público contiene caracteres no compatibles',
    'Public name contains unsupported control characters.':
      'El nombre público contiene caracteres de control no compatibles.',
    'Public name contains unsupported direction controls.':
      'El nombre público contiene controles de dirección no compatibles.',
    'Public name is too large': 'El nombre público es demasiado largo',
    'Public name is too large when encoded.':
      'El nombre público es demasiado largo al codificarse.',
    'Public name must be {{max}} characters or fewer':
      'El nombre público debe tener {{max}} caracteres o menos',
    'Public name must be 80 characters or fewer.':
      'El nombre público debe tener 80 caracteres o menos.',
    'This optional name helps people recognize you in chats and contacts. You can change or remove it later.':
      'Este nombre opcional ayuda a que las personas te reconozcan en chats y contactos. Puedes cambiarlo o eliminarlo más tarde.',
    'Unable to use this public name':
      'No se puede usar este nombre público',
    'Unlock Spectra to connect your secure call':
      'Desbloquea Spectra para conectar tu llamada segura',
    'Your public name is shared as chat-directory metadata. It is not included in your recovery phrase and does not affect account security.':
      'Tu nombre público se comparte como metadatos del directorio de chats. No se incluye en tu frase de recuperación ni afecta la seguridad de la cuenta.',
    'PIN input': 'Entrada de PIN',
    'Mnemonic must be 12 or 24 words':
      'La frase mnemónica debe tener 12 o 24 palabras',
    'Invalid word: "{{word}}"': 'Palabra no válida: "{{word}}"',
    'Invalid mnemonic checksum':
      'Suma de verificación de la frase mnemónica no válida',
  },
  chat: {
    '{{count}} messages': '{{count}} mensajes',
    '{{name}} took a screenshot': '{{name}} tomó una captura de pantalla',
    'Add attachment': 'Agregar adjunto',
    'Add by invitation': 'Agregar mediante invitación',
    'Cancel reply': 'Cancelar respuesta',
    'Choose a contact or use a secure invitation':
      'Elige un contacto o usa una invitación segura',
    'Share contact': 'Compartir contacto',
    'Open QR settings': 'Abrir ajustes de QR',
    'Edit image': 'Editar imagen',
    'Load more': 'Cargar más',
    'Paste a secure invitation or scan its QR code':
      'Pega una invitación segura o escanea su código QR',
    'Paste a secure invitation or scan its QR code to start.':
      'Pega una invitación segura o escanea su código QR para comenzar.',
    'Record voice note': 'Grabar nota de voz',
    'Remove attachment': 'Quitar adjunto',
    'Send message': 'Enviar mensaje',
    'Toggle one-time message': 'Alternar mensaje de una sola vez',
    'Updated {{time}}': 'Actualizado {{time}}',
    'You took a screenshot': 'Tomaste una captura de pantalla',
    Nearby: 'Cerca',
    'Cancel voice note': 'Cancelar nota de voz',
    'Send voice note': 'Enviar nota de voz',
    'Play voice note': 'Reproducir nota de voz',
    'Pause voice note': 'Pausar nota de voz',
    'Text overlay': 'Superposición de texto',
    'Crop frame': 'Marco de recorte',
    'Crop top-left handle': 'Control de recorte superior izquierdo',
    'Crop top-right handle': 'Control de recorte superior derecho',
    'Crop bottom-left handle': 'Control de recorte inferior izquierdo',
    'Crop bottom-right handle': 'Control de recorte inferior derecho',
    '#Tag': '#Etiqueta',
    'Sending attachment': 'Enviando adjunto',
    'Preparing message': 'Preparando mensaje',
    'Sending message': 'Enviando mensaje',
    'Caching locally': 'Guardando en caché localmente',
    Complete: 'Completado',
    'Encrypting and uploading {{completed}}/{{total}}':
      'Cifrando y subiendo {{completed}}/{{total}}',
    'Sending nearby': 'Enviando por cercanía',
    'Queued nearby': 'En cola por cercanía',
    'Nearby delivery expired': 'La entrega por cercanía expiró',
    'Nearby retry limit reached':
      'Se alcanzó el límite de reintentos por cercanía',
    'Nearby queue full': 'La cola de cercanía está llena',
    'Nearby delivery interrupted': 'Entrega por cercanía interrumpida',
    'Nearby receipt timed out':
      'Se agotó el tiempo de espera de confirmación por cercanía',
    'Nearby transmission failed': 'Falló la transmisión por cercanía',
    'Nearby delivery failed': 'Falló la entrega por cercanía',
  },
  contacts: {
    'Search or filter contacts': 'Buscar o filtrar contactos',
    'Found on Spectra': 'Encontrados en Spectra',
    'No matching contacts': 'No hay contactos coincidentes',
    'Add by secure contact invitation':
      'Agregar mediante invitación de contacto segura',
    'Invalid contact invitation': 'Invitación de contacto no válida',
    'Invalid secure contact invitation':
      'Invitación de contacto segura no válida',
    'Paste a secure contact invitation or scan a contact QR code':
      'Pega una invitación de contacto segura o escanea un código QR de contacto',
    'Paste a secure contact invitation or scan its QR code.':
      'Pega una invitación de contacto segura o escanea su código QR.',
    'Paste a valid secure contact invitation.':
      'Pega una invitación de contacto segura válida.',
    'Please wait until the EXO account switch finishes.':
      'Espera hasta que termine el cambio de cuenta EXO.',
    'Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.':
      'Escanea un código QR de contacto o pega la invitación de contacto segura compartida por la persona que quieres agregar.',
    'Scan a secure Spectra contact QR code shared by the person you want to add.':
      'Escanea un código QR de contacto seguro de Spectra compartido por la persona que quieres agregar.',
    'Secure Contact Invitation': 'Invitación de contacto segura',
    'Secure invitation ready': 'Invitación segura lista',
  },
  crypto: {
    Total: 'Total',
    '~{{fee}} {{symbol}}': '~{{fee}} {{symbol}}',
    '{{symbol}} logo': 'Logotipo de {{symbol}}',
    'USDT logo': 'Logotipo de USDT',
  },
  markets: {
    '0 (unlimited)': '0 (sin límite)',
    'Amount exceeds remaining allowance':
      'El importe supera el límite restante',
    'Cannot contribute': 'No se puede contribuir',
    'Connect wallet to create a campaign':
      'Conecta una cartera para crear una campaña',
    'Connect wallet to create an escrow order':
      'Conecta una cartera para crear una orden de depósito en garantía',
    'Connect wallet to view your campaigns':
      'Conecta una cartera para ver tus campañas',
    'Connect wallet to view your escrow orders':
      'Conecta una cartera para ver tus órdenes de depósito en garantía',
    'Describe the condition for release...':
      'Describe la condición para la liberación...',
    'Enter a valid market ID': 'Ingresa un ID de mercado válido',
    'Enter a valid sale ID': 'Ingresa un ID de venta válido',
    'Fiat price must be greater than zero':
      'El precio fiduciario debe ser mayor que cero',
    Filled: 'Completado',
    'Invalid campaign ID': 'ID de campaña no válido',
    'Invalid order ID': 'ID de orden no válido',
    'Invalid sale ID': 'ID de venta no válido',
    'No escrow orders found':
      'No se encontraron órdenes de depósito en garantía',
    'Partially Filled': 'Completado parcialmente',
    Pools: 'Pools',
    Vol: 'Vol.',
    Yes: 'Sí',
    'You are not eligible to contribute': 'No cumples los requisitos para contribuir',
  },
  settings: {
    'Activating secure online access': 'Activando acceso en línea seguro',
    'Publishing secure discovery': 'Publicando descubrimiento seguro',
    'Keeping you findable': 'Manteniéndote localizable',
    'Starting a secure chat': 'Iniciando un chat seguro',
    'Creating one-time contact card': 'Creando tarjeta de contacto de un solo uso',
    'Computing VDF proof': 'Calculando prueba VDF',
    'Solving a sequential proof that helps prevent automated account creation.':
      'Resolviendo una prueba secuencial que ayuda a impedir la creación automatizada de cuentas.',
    'Generating VDF proof': 'Generando prueba VDF',
    'Preparing the compact proof the server can verify efficiently.':
      'Preparando la prueba compacta que el servidor puede verificar eficientemente.',
    'Waiting for server verification': 'Esperando la verificación del servidor',
    'Retrying server verification': 'Reintentando la verificación del servidor',
    'Proof ready. The server enforces a minimum delay before it accepts it.':
      'Prueba lista. El servidor impone un retraso mínimo antes de aceptarla.',
    'Verifying VDF proof': 'Verificando prueba VDF',
    'Sending the proof for secure verification.':
      'Enviando la prueba para una verificación segura.',
    'Secure online access is ready': 'El acceso en línea seguro está listo',
    'Your secure online access is active.': 'Tu acceso en línea seguro está activo.',
    'VDF work was cancelled': 'El trabajo VDF fue cancelado',
    'No proof was submitted.': 'No se envió ninguna prueba.',
    'Secure access needs attention': 'El acceso seguro requiere atención',
    'This proof could not be completed. Check your connection and try again.':
      'No se pudo completar esta prueba. Comprueba tu conexión e inténtalo de nuevo.',
    '{{percent}}% complete': '{{percent}}% completado',
    'VDFs completed {{completed}}/{{total}}': 'VDF completados {{completed}}/{{total}}',
    '{{rate}} VDF iterations/s': '{{rate}} iteraciones VDF/s',
    'Measuring VDF rate…': 'Midiendo la velocidad VDF…',
    '~{{count}}s remaining': '~{{count}} s restantes',
    'Cancel secure work': 'Cancelar trabajo seguro',
    'Could not start this chat': 'No se pudo iniciar este chat',
    'Could not update discovery': 'No se pudo actualizar el descubrimiento',
    'Could not create contact card': 'No se pudo crear la tarjeta de contacto',
    'Dismiss': 'Descartar',
    'Keep Spectra open while the security proof is verified.':
      'Mantén Spectra abierto mientras se verifica la prueba de seguridad.',
    '{{count}}s elapsed': '{{count}} s transcurridos',
    '{{count}}s elapsed - this may take 30-240 seconds with bridges':
      '{{count}} s transcurridos; esto puede tardar entre 30 y 240 segundos con puentes',
    'A verified backend session is required before deleting this account.':
      'Se requiere una sesión de backend verificada antes de eliminar esta cuenta.',
    'A verified Backend session is required for Spectre activation':
      'Se requiere una sesión de Backend verificada para la activación de Spectre',
    'Account deleted': 'Cuenta eliminada',
    'Account Deletion': 'Eliminación de cuenta',
    'Account deletion completed': 'Eliminación de cuenta completada',
    'Account Deletion Failed': 'La eliminación de la cuenta falló',
    'Account deletion failed. Try again after checking your connection.':
      'La eliminación de la cuenta falló. Inténtalo de nuevo después de comprobar tu conexión.',
    'Account deletion needs attention':
      'La eliminación de la cuenta requiere atención',
    'Applying Spectre protections': 'Aplicando protecciones de Spectre',
    'Backend cleanup could not be checked. Retry when the private connection is available.':
      'No se pudo comprobar la limpieza del backend. Vuelve a intentarlo cuando la conexión privada esté disponible.',
    'Backend cleanup is paused and will be retried safely. Try checking again.':
      'La limpieza del backend está en pausa y se reintentará de forma segura. Intenta comprobarlo de nuevo.',
    'Backend cleanup is still running. You can retry this status check safely.':
      'La limpieza del backend aún está en curso. Puedes volver a comprobar el estado de forma segura.',
    'Backend deletion completed, but final device cleanup needs to be retried.':
      'La eliminación del backend se completó, pero se debe reintentar la limpieza final del dispositivo.',
    'Backend deletion completed, but local key erasure could not be confirmed.':
      'La eliminación del backend se completó, pero no se pudo confirmar el borrado de las claves locales.',
    'Backend is not configured for Spectre activation':
      'El backend no está configurado para la activación de Spectre',
    'Changes were rolled back': 'Se revirtieron los cambios',
    'Checking private access': 'Comprobando acceso privado',
    'Choose a new 6-digit PIN': 'Elige un nuevo PIN de 6 dígitos',
    'Cleanup could not be confirmed. You can retry safely.':
      'No se pudo confirmar la limpieza. Puedes reintentarlo de forma segura.',
    'Cloud Session Required': 'Se requiere una sesión en la nube',
    'Confirm Account Deletion': 'Confirmar eliminación de cuenta',
    'Confirm New PIN': 'Confirmar nuevo PIN',
    'Connecting your private route': 'Conectando tu ruta privada',
    'Deleting Account': 'Eliminando cuenta',
    'Deleting account records': 'Eliminando registros de la cuenta',
    'Deleting chat relay data': 'Eliminando datos de retransmisión del chat',
    'Deleting encrypted objects': 'Eliminando objetos cifrados',
    'Deletion needs attention': 'La eliminación requiere atención',
    'Disabled by Spectre Mode': 'Desactivado por el modo Spectre',
    'Enter Current PIN': 'Ingresa el PIN actual',
    'Enter New PIN': 'Ingresa el nuevo PIN',
    'Enter your current PIN': 'Ingresa tu PIN actual',
    'Enter your current PIN before creating a duress PIN':
      'Ingresa tu PIN actual antes de crear un PIN de coacción',
    'Enter your PIN to continue to the final destructive confirmation.':
      'Ingresa tu PIN para continuar con la confirmación destructiva final.',
    'Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.':
      'Al ingresar el PIN de coacción, se intentará eliminar los datos de la cuenta del backend, borrar este dispositivo y cerrar tu sesión de inmediato.',
    'Erase Account Permanently?': '¿Borrar la cuenta de forma permanente?',
    'Erase Everything': 'Borrar todo',
    'Erasing local keys and data': 'Borrando claves y datos locales',
    'EXO can continue refreshing chats in the background once Spectre is ready.':
      'EXO puede seguir actualizando los chats en segundo plano cuando Spectre esté listo.',
    'EXO has finished switching back from Spectre Mode.':
      'EXO ha terminado de salir del modo Spectre.',
    'EXO is validating your Spectre account and required protections before the private handoff starts.':
      'EXO está validando tu cuenta Spectre y las protecciones necesarias antes de iniciar la transferencia privada.',
    'EXO is verifying the wallet session it uses for private network services.':
      'EXO está verificando la sesión de cartera que usa para los servicios de red privada.',
    'EXO stopped the Spectre flow and restored the previous safe state where it could.':
      'EXO detuvo el proceso de Spectre y restauró el estado seguro anterior cuando fue posible.',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Exporta un archivo cifrado que controles e impórtalo más tarde para conservar los contactos guardados.',
    'Export and import encrypted contacts':
      'Exportar e importar contactos cifrados',
    'Failed to change PIN': 'No se pudo cambiar el PIN',
    'Failed to disable Spectre Mode':
      'No se pudo desactivar el modo Spectre',
    'Failed to refresh Spectre access':
      'No se pudo actualizar el acceso a Spectre',
    'Failed to verify PIN': 'No se pudo verificar el PIN',
    'Finalizing secure cleanup': 'Finalizando la limpieza segura',
    'Finalizing Spectre shutdown': 'Finalizando el cierre de Spectre',
    'Finishing the private handoff': 'Finalizando la transferencia privada',
    'Getting Spectre ready': 'Preparando Spectre',
    'Keep Spectra open while each verified cleanup stage completes.':
      'Mantén Spectra abierto mientras se completa cada etapa de limpieza verificada.',
    'Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.':
      'Mantén esta pantalla abierta mientras EXO aplica los cambios de privacidad necesarios para el modo Spectre.',
    'Keep this screen open while EXO prepares the secure activation handoff.':
      'Mantén esta pantalla abierta mientras EXO prepara la transferencia de activación segura.',
    'Keep this screen open while EXO restores your regular wallet and security settings.':
      'Mantén esta pantalla abierta mientras EXO restaura tu cartera habitual y la configuración de seguridad.',
    'Loading your Spectre setup': 'Cargando tu configuración de Spectre',
    'Local data and the accepted backend cleanup have finished.':
      'Los datos locales y la limpieza aceptada del backend han finalizado.',
    'Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.':
      'Los datos locales se borraron, pero no se pudo confirmar la limpieza del backend. Vuelve a intentarlo cuando la conexión privada esté disponible.',
    'Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.':
      'Los datos locales se borraron, pero el backend no aceptó la solicitud de eliminación. Vuelve a importar la cuenta para reintentarlo.',
    'New PIN must be different from current PIN':
      'El nuevo PIN debe ser diferente del PIN actual',
    'One anonymous activation token can be requested every 24 hours.':
      'Se puede solicitar un token de activación anónimo cada 24 horas.',
    'PINs do not match': 'Los PIN no coinciden',
    'Preparing secure deletion': 'Preparando eliminación segura',
    'Preparing Spectre Mode': 'Preparando el modo Spectre',
    'Preparing your private workspace': 'Preparando tu espacio de trabajo privado',
    'Preparing your Spectre account': 'Preparando tu cuenta Spectre',
    'Preparing your Spectre setup': 'Preparando tu configuración de Spectre',
    'Re-enter your new PIN to confirm':
      'Vuelve a ingresar tu nuevo PIN para confirmarlo',
    'Registering the private account': 'Registrando la cuenta privada',
    'Reserving private activation': 'Reservando activación privada',
    'Restoring network and cleanup': 'Restaurando red y limpieza',
    'Restoring privacy protections': 'Restaurando protecciones de privacidad',
    'Restoring your main profile': 'Restaurando tu perfil principal',
    'Retry account deletion cleanup':
      'Reintentar la limpieza de eliminación de la cuenta',
    'Retry cleanup': 'Reintentar limpieza',
    'Review the failed step below before trying again.':
      'Revisa el paso fallido a continuación antes de volver a intentarlo.',
    'Secure account deletion stopped unexpectedly. Try again when the private connection is available.':
      'La eliminación segura de la cuenta se detuvo inesperadamente. Inténtalo de nuevo cuando la conexión privada esté disponible.',
    'Secure deletion in progress': 'Eliminación segura en curso',
    'Spectre cannot finish until Tor is connected. Try bridges or a different network.':
      'Spectre no puede finalizar hasta que Tor esté conectado. Prueba puentes u otra red.',
    'Spectre chats and contacts are still refreshing in the background.':
      'Los chats y contactos de Spectre todavía se están actualizando en segundo plano.',
    'Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.':
      'Spectre desactiva las llamadas y las acciones de criptomonedas; elimina los tokens push; fuerza Tor, el PIN de coacción, el borrado al fallar, la protección contra capturas de pantalla y la privacidad del selector de apps; y establece temporizadores cortos de desaparición para los mensajes nuevos.',
    'Spectre needs your attention': 'Spectre requiere tu atención',
    'Spectre protections are active': 'Las protecciones de Spectre están activas',
    'Submitting the deletion request': 'Enviando la solicitud de eliminación',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Cambia a tu cuenta EXO raíz para crear o importar cuentas EXO transparentes.',
    'Switching back to your main wallet':
      'Volviendo a tu cartera principal',
    'Switching to your Spectre identity':
      'Cambiando a tu identidad de Spectre',
    'The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.':
      'El backend ya no reconoce este token de limpieza. Vuelve a importar la cuenta para verificar la eliminación.',
    'The cleanup status token expired. Re-import the account to verify its status.':
      'El token de estado de limpieza expiró. Vuelve a importar la cuenta para verificar su estado.',
    'There is no pending backend cleanup to retry.':
      'No hay ninguna limpieza pendiente del backend para reintentar.',
    'This cannot be undone. Backend data and local sensitive data will be erased for this account.':
      'Esto no se puede deshacer. Los datos del backend y los datos locales confidenciales de esta cuenta se borrarán.',
    'This cannot be undone. Local sensitive data is erased before the backend deletion request starts.':
      'Esto no se puede deshacer. Los datos locales confidenciales se borran antes de que comience la solicitud de eliminación del backend.',
    'This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.':
      'Esto elimina primero las claves y los datos locales y, después, envía la limpieza del backend mediante tu transporte privado actual. La pantalla de progreso permanece visible hasta que se confirme la limpieza.',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'Esto elimina esta cuenta EXO de este dispositivo y libera un espacio de cuenta EXO transparente para esta frase de recuperación. Los mensajes existentes de esta cuenta se borran localmente. Esto no se puede deshacer.',
    'This screen updates automatically as each Spectre stage finishes.':
      'Esta pantalla se actualiza automáticamente al finalizar cada etapa de Spectre.',
    'This screen updates only when a cleanup stage is confirmed.':
      'Esta pantalla solo se actualiza cuando se confirma una etapa de limpieza.',
    'Tor could not connect': 'Tor no pudo conectarse',
    'Tor must be online before Spectre can switch identities and continue.':
      'Tor debe estar conectado antes de que Spectre pueda cambiar de identidad y continuar.',
    'Tor routing applies only inside Spectra. Device-wide network routing is unchanged.':
      'El enrutamiento de Tor solo se aplica dentro de Spectra. El enrutamiento de red de todo el dispositivo no cambia.',
    'Unable to complete Spectre activation':
      'No se pudo completar la activación de Spectre',
    'Unlock or reconnect to the backend before deleting the account.':
      'Desbloquea o vuelve a conectarte al backend antes de eliminar la cuenta.',
    'Verify Primary PIN': 'Verificar PIN principal',
    'Verify your identity to change PIN':
      'Verifica tu identidad para cambiar el PIN',
    'Verifying private access': 'Verificando acceso privado',
    'Your main wallet is restored': 'Tu cartera principal se restauró',
    'Your PIN has been changed successfully.':
      'Tu PIN se cambió correctamente.',
    'Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.':
      'Tu cartera Spectre y el túnel de Tor están listos. Los chats y contactos pueden terminar de actualizarse en segundo plano.',
    'Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.':
      'Tu cartera Spectre está activa. EXO está cambiando el ámbito de almacenamiento y cargando los datos locales de este perfil privado.',
  },
  profile: {
    'Show VDF progress': 'Mostrar progreso VDF',
    'Proofs still run in the background when this is off.':
      'Las pruebas siguen ejecutándose en segundo plano cuando esto está desactivado.',
    'Account Label': 'Etiqueta de cuenta',
    'Change Photo': 'Cambiar foto',
    'Chat bundle not on server — others cannot find you':
      'El paquete de chat no está en el servidor; otras personas no pueden encontrarte',
    'Chat bundle registered on server':
      'Paquete de chat registrado en el servidor',
    'Chat identity not available. Please restart the app.':
      'La identidad de chat no está disponible. Reinicia la app.',
    'Checking chat bundle...': 'Comprobando paquete de chat...',
    'Checking identity link...': 'Comprobando vínculo de identidad...',
    'Could not link identity. Please try again.':
      'No se pudo vincular la identidad. Inténtalo de nuevo.',
    'Could not refresh session. Check your connection.':
      'No se pudo actualizar la sesión. Comprueba tu conexión.',
    'Edit Profile': 'Editar perfil',
    'Identity linked to server': 'Identidad vinculada al servidor',
    'Identity not linked — messaging is disabled':
      'La identidad no está vinculada; la mensajería está desactivada',
    'Member since {{date}}': 'Miembro desde {{date}}',
    'Name this account': 'Nombra esta cuenta',
    'Optional public name for chats': 'Nombre público opcional para chats',
    'Photo disabled in Spectre Mode':
      'La foto está desactivada en el modo Spectre',
    'Preparing secure contact invitation…':
      'Preparando invitación de contacto segura…',
    'Preparing secure contact card…': 'Preparando tarjeta de contacto segura…',
    'Preparing secure share…': 'Preparando uso compartido seguro…',
    'Create a one-time card to show your QR code.':
      'Crea una tarjeta de un solo uso para mostrar tu código QR.',
    'Create one-time contact card': 'Crear tarjeta de contacto de un solo uso',
    'Publish for 5 minutes': 'Publicar durante 5 minutos',
    'Your account is discoverable for 5 minutes.':
      'Tu cuenta se puede encontrar durante 5 minutos.',
    'Your account is already discoverable.': 'Tu cuenta ya se puede encontrar.',
    'Your one-time contact card is still active.':
      'Tu tarjeta de contacto de un solo uso sigue activa.',
    'Open one-time contact card': 'Abrir tarjeta de contacto de un solo uso',
    'One-time contact card ready': 'Tarjeta de contacto de un solo uso lista',
    'Expires in {{minutes}} min': 'Caduca en {{minutes}} min',
    'One-time contact card': 'Tarjeta de contacto de un solo uso',
    'Share this QR code before it expires.':
      'Comparte este código QR antes de que caduque.',
    'A one-time contact card expires after one hour and can be used once.':
      'Una tarjeta de contacto de un solo uso vence después de una hora y solo se puede usar una vez.',
    'Chat identity is not ready yet.': 'La identidad de chat aún no está lista.',
    'Profile photos cannot be changed while Spectre Mode is active.':
      'Las fotos de perfil no se pueden cambiar mientras el modo Spectre está activo.',
    'Public Name': 'Nombre público',
    'Public name contains invalid text.':
      'El nombre público contiene texto no válido.',
    'Public name contains unsupported characters':
      'El nombre público contiene caracteres no compatibles',
    'Public name contains unsupported control characters.':
      'El nombre público contiene caracteres de control no compatibles.',
    'Public name contains unsupported direction controls.':
      'El nombre público contiene controles de dirección no compatibles.',
    'Public name is too large': 'El nombre público es demasiado largo',
    'Public name is too large when encoded.':
      'El nombre público es demasiado largo al codificarse.',
    'Public name must be {{max}} characters or fewer':
      'El nombre público debe tener {{max}} caracteres o menos',
    'Public name must be 80 characters or fewer.':
      'El nombre público debe tener 80 caracteres o menos.',
    'Public profile metadata is read-only while Spectre Mode is active.':
      'Los metadatos del perfil público son de solo lectura mientras el modo Spectre está activo.',
    'Public profile names cannot be edited while Spectre Mode is active.':
      'Los nombres del perfil público no se pueden editar mientras el modo Spectre está activo.',
    'Publication needs attention. Retry when you are online.':
      'La publicación requiere atención. Vuelve a intentarlo cuando estés en línea.',
    Published: 'Publicado',
    'Publishing public name...': 'Publicando nombre público...',
    'Retry Publication': 'Reintentar publicación',
    'Save Public Name': 'Guardar nombre público',
    'Security Status': 'Estado de seguridad',
    'Server session active': 'Sesión del servidor activa',
    'Server session expired — features may not work':
      'La sesión del servidor expiró; es posible que las funciones no funcionen',
    'This is a local label to help you identify this account. It is not your public chat name.':
      'Esta es una etiqueta local para ayudarte a identificar esta cuenta. No es tu nombre público de chat.',
    'This name is visible to your contacts':
      'Este nombre es visible para tus contactos',
    'This public name is saved on this device and will publish when your chat identity is linked.':
      'Este nombre público se guarda en este dispositivo y se publicará cuando se vincule tu identidad de chat.',
    'This repeatable name is public chat-directory metadata. People who have not saved you under another name can see it in chats and contacts. It appears in notifications only when both sides enable that privacy trade-off.':
      'Este nombre reutilizable es un metadato público del directorio de chats. Las personas que no te hayan guardado con otro nombre pueden verlo en chats y contactos. Solo aparece en las notificaciones cuando ambas partes activan esa concesión de privacidad.',
    'Unable to use this public name':
      'No se puede usar este nombre público',
    'Unknown error': 'Error desconocido',
    'Waiting for chat readiness. Automatic retries are scheduled.':
      'Esperando a que el chat esté listo. Se programaron reintentos automáticos.',
  },
} satisfies LocaleTranslationOverrides

export default translations

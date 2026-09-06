/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LocaleTranslationOverrides } from './translationOverrideTypes'

const translations = {
  common: {
    'Creating your post-quantum identity...': 'Criando sua identidade pós-quântica...',
    'Encrypted group sender keys': 'Chaves de remetente de grupo criptografadas',
    'End-to-end encrypted': 'Criptografado de ponta a ponta',
    'End-to-end encryption available for supported chats':
      'Criptografia de ponta a ponta disponível para conversas compatíveis',
    'Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.':
      'As chaves do grupo são distribuídas pelas suas sessões diretas criptografadas existentes. Remover um membro alterna automaticamente a chave de grupo ativa.',
    'Hybrid post-quantum messaging': 'Mensagens híbridas pós-quânticas',
    'ML-DSA-65 post-quantum signatures': 'Assinaturas pós-quânticas ML-DSA-65',
    'Post-quantum': 'Pós-quântico',
    'Post-quantum identity keys ready': 'Chaves de identidade pós-quânticas prontas',
    'Securing your encrypted vault...': 'Protegendo seu cofre criptografado...',
    'Supported direct messages are end-to-end encrypted.':
      'Mensagens diretas compatíveis são criptografadas de ponta a ponta.',
    ' +{{count}} more': ' +{{count}} mais',
    '{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}':
      '{{bridgeCount}} pontes {{transport}} carregadas. {{routeMessage}}',
    '{{count}} attachment_one': '{{count}} anexo',
    '{{count}} attachment_other': '{{count}} anexos',
    '{{count}} groups in common': '{{count}} grupos em comum',
    '{{count}} slots available': '{{count}} vagas disponíveis',
    '{{count}} tokens': '{{count}} tokens',
    '{{error}} This request used the normal network while Tor was disabled.':
      '{{error}} Esta solicitação usou a rede normal enquanto o Tor estava desativado.',
    '{{network}} address': 'endereço de {{network}}',
    '{{senderName}} requested': '{{senderName}} solicitou',
    '{{width}} px': '{{width}} px',
    '+ gas in': '+ gás em',
    'Account Name (Optional)': 'Nome da conta (opcional)',
    'Account ready': 'Conta pronta',
    'Add {{count}}': 'Adicionar {{count}}',
    'Add ETH before sending this token.': 'Adicione ETH antes de enviar este token.',
    'Add text': 'Adicionar texto',
    'Add user': 'Adicionar usuário',
    'Allowed': 'Permitido',
    'Apply crop': 'Aplicar corte',
    'Applying bridge configuration…': 'Aplicando configuração de pontes…',
    'Applying direct Tor…': 'Aplicando Tor direto…',
    'Archive Exported': 'Arquivo exportado',
    'Archive Passphrase': 'Senha do arquivo',
    'Archive Passphrase Required': 'Senha do arquivo obrigatória',
    'Archives unavailable': 'Arquivos indisponíveis',
    'At least 16 characters': 'Pelo menos 16 caracteres',
    'Available': 'Disponível',
    'Back': 'Voltar',
    'BIP39 word suggestions': 'Sugestões de palavras BIP39',
    'Block': 'Bloquear',
    'Block {{displayName}}? You will no longer receive messages from them.':
      'Bloquear {{displayName}}? Você não receberá mais mensagens dessa pessoa.',
    'Blockchain': 'Blockchain',
    'Bridge Update Failed': 'Falha ao atualizar as pontes',
    'Buy': 'Comprar',
    'Calculated by network': 'Calculado pela rede',
    'Calls': 'Chamadas',
    'Calls are only supported in direct chats.':
      'As chamadas são compatíveis apenas com chats diretos.',
    'Calls unavailable': 'Chamadas indisponíveis',
    'Cancel Spectre Mode': 'Cancelar modo Spectre',
    'Canceling Spectre Mode...': 'Cancelando modo Spectre...',
    'Chat bundle is still missing from the server.':
      'O pacote de chat ainda não está disponível no servidor.',
    'Chat identity did not finish switching. Try reconnecting.':
      'A troca da identidade de chat não foi concluída. Tente reconectar.',
    'Chat identity is not ready for this EXO account.':
      'A identidade de chat não está pronta para esta conta EXO.',
    'Chat unavailable': 'Chat indisponível',
    'Chats': 'Chats',
    'Choose how long messages remain visible after they are read.':
      'Escolha por quanto tempo as mensagens permanecerão visíveis depois de serem lidas.',
    'Claim Refund': 'Solicitar reembolso',
    'Clear chat': 'Limpar chat',
    'Close': 'Fechar',
    'Close media preview': 'Fechar prévia de mídia',
    'Close poll failed': 'Não foi possível encerrar a enquete',
    'Color': 'Cor',
    'Confirm & Send': 'Confirmar e enviar',
    'Confirm Payment': 'Confirmar pagamento',
    'Confirm that you backed up the recovery phrase before using this EXO account.':
      'Confirme que você fez backup da frase de recuperação antes de usar esta conta EXO.',
    'Confirm Transaction': 'Confirmar transação',
    'Connecting encrypted chat...': 'Conectando ao chat criptografado...',
    'Connecting securely...': 'Conectando com segurança...',
    'Connecting...': 'Conectando...',
    'Connection failed': 'Falha na conexão',
    'Connection problem': 'Problema de conexão',
    'Contact Archive': 'Arquivo de contatos',
    'Contact archives are unavailable for Spectre accounts.':
      'Arquivos de contatos não estão disponíveis para contas Spectre.',
    'Contact archives are unavailable while Spectre Mode is active.':
      'Arquivos de contatos não estão disponíveis enquanto o modo Spectre estiver ativo.',
    'Contacts: {{contacts}}': 'Contatos: {{contacts}}',
    'Copy TX': 'Copiar TX',
    'Could not add members': 'Não foi possível adicionar membros',
    'Could not import shared content': 'Não foi possível importar o conteúdo compartilhado',
    'Could not link this chat identity to the server.':
      'Não foi possível vincular esta identidade de chat ao servidor.',
    'Could not open this chat': 'Não foi possível abrir este chat',
    'Could not open this chat.': 'Não foi possível abrir este chat.',
    'Could not prepare this EXO account.': 'Não foi possível preparar esta conta EXO.',
    'Could not publish chat bundle.': 'Não foi possível publicar o pacote de chat.',
    'Could not save the edited image. Please try again.':
      'Não foi possível salvar a imagem editada. Tente novamente.',
    'Could not save your public name. Please try again.':
      'Não foi possível salvar seu nome público. Tente novamente.',
    'Could not switch back to the root EXO account.':
      'Não foi possível voltar para a conta EXO raiz.',
    'Could not switch EXO account': 'Não foi possível alternar a conta EXO',
    'Could not update notifications': 'Não foi possível atualizar as notificações',
    'Could not update this image. Please try again.':
      'Não foi possível atualizar esta imagem. Tente novamente.',
    'Could not verify the server session for this EXO account.':
      'Não foi possível verificar a sessão do servidor para esta conta EXO.',
    'Create a new transparent EXO account for work, friends, or another chat identity.':
      'Crie uma nova conta EXO transparente para trabalho, amigos ou outra identidade de chat.',
    'Create EXO Account': 'Criar conta EXO',
    'Created': 'Criado',
    'Creator': 'Criador',
    'Crop': 'Cortar',
    'Default': 'Padrão',
    'Diffusion channels require Spectre access.':
      'Canais de difusão exigem acesso Spectre.',
    'Disappearing messages': 'Mensagens que desaparecem',
    'Drag text on the image to reposition it.':
      'Arraste o texto na imagem para reposicioná-lo.',
    'Drag the crop frame or its corners, then apply.':
      'Arraste a moldura de corte ou seus cantos e depois aplique.',
    'Draw': 'Desenhar',
    'Each recovery phrase restores up to 5 transparent EXO accounts.':
      'Cada frase de recuperação restaura até 5 contas EXO transparentes.',
    'Edit': 'Editar',
    'Edit and resend': 'Editar e reenviar',
    'Edit image': 'Editar imagem',
    'Encrypted contact archive': 'Arquivo de contatos criptografado',
    'Enter a valid amount': 'Insira um valor válido',
    'Enter a valid EXO price greater than zero.':
      'Insira um preço EXO válido maior que zero.',
    'Erasing...': 'Apagando...',
    'ERC-20 on Ethereum Mainnet': 'ERC-20 na rede principal do Ethereum',
    'ERC-20 Tokens': 'Tokens ERC-20',
    'Est. gas: {{amount}} {{symbol}}': 'Gás est.: {{amount}} {{symbol}}',
    'Establishing secure call...': 'Estabelecendo chamada segura...',
    'Estimated fee': 'Taxa estimada',
    'Euro': 'Euro',
    'EXO Account {{number}}': 'Conta EXO {{number}}',
    'EXO account creation is disabled while Spectre Mode is active.':
      'A criação de contas EXO está desativada enquanto o modo Spectre estiver ativo.',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Exporte um arquivo criptografado que você controla e importe-o mais tarde para preservar os contatos salvos.',
    'Export Failed': 'Falha na exportação',
    'Export file': 'Exportar arquivo',
    'External links are unavailable while Spectre Mode is active.':
      'Links externos não estão disponíveis enquanto o modo Spectre estiver ativo.',
    'External links unavailable': 'Links externos indisponíveis',
    'Failed to claim refund': 'Não foi possível solicitar o reembolso',
    'Failed to complete the paid join flow':
      'Não foi possível concluir o fluxo de entrada paga',
    'Failed to create poll': 'Não foi possível criar a enquete',
    'Failed to create poll message': 'Não foi possível criar a mensagem de enquete',
    'Failed to create request': 'Não foi possível criar a solicitação',
    'Failed to generate account': 'Não foi possível gerar a conta',
    'Failed to import account': 'Não foi possível importar a conta',
    'Failed to Load': 'Falha ao carregar',
    'Failed to load market': 'Não foi possível carregar o mercado',
    'Failed to save EXO account': 'Não foi possível salvar a conta EXO',
    'Failed to save membership access settings':
      'Não foi possível salvar as configurações de acesso à associação',
    'Failed to switch EXO account': 'Não foi possível alternar a conta EXO',
    'Failed to verify the payment confirmation.':
      'Não foi possível verificar a confirmação de pagamento.',
    'Fetched over the normal network while Tor was disabled.':
      'Obtido pela rede normal enquanto o Tor estava desativado.',
    'Generating secure keys...': 'Gerando chaves seguras...',
    'Group members': 'Membros do grupo',
    'Hidden': 'Oculto',
    'Hide {{displayName}} from your Contacts tab on this device? Chats and encryption keys will stay intact.':
      'Ocultar {{displayName}} da sua aba Contatos neste dispositivo? Chats e chaves de criptografia continuarão intactos.',
    'Hide this contact\'s public name in your push notifications.':
      'Ocultar o nome público deste contato nas suas notificações push.',
    'I backed up this recovery phrase offline.':
      'Fiz backup desta frase de recuperação off-line.',
    'I understand': 'Entendi',
    'Import': 'Importar',
    'Import a transparent EXO recovery phrase into this unlocked root vault.':
      'Importe uma frase de recuperação EXO transparente para este cofre raiz desbloqueado.',
    'Import and Use Account': 'Importar e usar conta',
    'Import Complete': 'Importação concluída',
    'Import contact archive?': 'Importar arquivo de contatos?',
    'Import EXO Account': 'Importar conta EXO',
    'Import Failed': 'Falha na importação',
    'Import file': 'Importar arquivo',
    'Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.':
      'Os contatos importados são mesclados aos contatos já existentes neste dispositivo. Chats, mensagens, sessões, chaves de grupo e mídia nunca são importados.',
    'Importing...': 'Importando...',
    'Incorrect PIN': 'PIN incorreto',
    'Invalid {{network}} address': 'Endereço de {{network}} inválido',
    'Invalid amount': 'Valor inválido',
    'Invalid market ID': 'ID de mercado inválido',
    'Invalid recipient address': 'Endereço do destinatário inválido',
    'Invalid recovery phrase': 'Frase de recuperação inválida',
    'Load this image before editing it.': 'Carregue esta imagem antes de editá-la.',
    'Loading pool data...': 'Carregando dados do pool...',
    'Loading shared content...': 'Carregando conteúdo compartilhado...',
    'Loading voice note...': 'Carregando mensagem de voz...',
    'Make sure no one is watching your screen':
      'Certifique-se de que ninguém esteja olhando para sua tela',
    'Max': 'Máx.',
    'Media': 'Mídia',
    'Media, links and docs': 'Mídia, links e documentos',
    'Message unavailable': 'Mensagem indisponível',
    'Messages': 'Mensagens',
    'Minimize call': 'Minimizar chamada',
    'Muted': 'Silenciado',
    'My {{network}} Address': 'Meu endereço de {{network}}',
    'Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}':
      'Nem a configuração solicitada nem as pontes anteriores conseguiram conectar. O Tor permanece ativado e o tráfego do backend continua bloqueado. {{error}}',
    'Network': 'Rede',
    'Network Fee': 'Taxa de rede',
    'Network State': 'Estado da rede',
    'Network: Mozaga native EXO': 'Rede: EXO nativo da Mozaga',
    'Never share your recovery phrase': 'Nunca compartilhe sua frase de recuperação',
    'New encrypted message': 'Nova mensagem criptografada',
    'New EXO Account': 'Nova conta EXO',
    'New group message': 'Nova mensagem de grupo',
    'New message': 'Nova mensagem',
    'New message notifications': 'Notificações de novas mensagens',
    'Next': 'Próximo',
    'No active wallet is available.': 'Nenhuma carteira ativa está disponível.',
    'No address for this network': 'Não há endereço para esta rede',
    'No documents shared yet': 'Nenhum documento compartilhado ainda',
    'No links shared yet': 'Nenhum link compartilhado ainda',
    'No Spectra chats are available for sharing yet.':
      'Ainda não há chats do Spectra disponíveis para compartilhamento.',
    'No tokens found': 'Nenhum token encontrado',
    'Notifications': 'Notificações',
    'On': 'Ativado',
    'Only import a recovery phrase you control. Imported accounts can send and receive chats independently.':
      'Importe apenas uma frase de recuperação que você controla. As contas importadas podem enviar e receber mensagens de forma independente.',
    'Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.':
      'Somente os contatos salvos e os rótulos dos contatos são incluídos. Os contatos existentes são mantidos, e os contatos restaurados ficam disponíveis imediatamente após a importação.',
    'Opening...': 'Abrindo...',
    'Paid access setup incomplete': 'Configuração de acesso pago incompleta',
    'Paid by {{payerName}}': 'Pago por {{payerName}}',
    'Paid in {{symbol}}': 'Pago em {{symbol}}',
    'Paste recovery phrase': 'Colar frase de recuperação',
    'Pay {{amount}}': 'Pagar {{amount}}',
    'Pay request': 'Pagar solicitação de pagamento',
    'Payment': 'Pagamento',
    'Payment already submitted': 'Pagamento já enviado',
    'Payment failed': 'Falha no pagamento',
    'Payment message received': 'Mensagem de pagamento recebida',
    'Payment paid': 'Pagamento efetuado',
    'Payment Pending': 'Pagamento pendente',
    'Payment recorded': 'Pagamento registrado',
    'Payment request: {{amount}} {{symbol}}':
      'Solicitação de pagamento: {{amount}} {{symbol}}',
    'Payment Required': 'Pagamento necessário',
    'Payment submitted': 'Pagamento enviado',
    'Payment submitted: {{amount}} {{symbol}}':
      'Pagamento enviado: {{amount}} {{symbol}}',
    'Platform fee: {{fee}}': 'Taxa da plataforma: {{fee}}',
    'Please allow access to your photo library to change the group photo.':
      'Permita o acesso à sua biblioteca de fotos para alterar a foto do grupo.',
    'Please retry the chat setup first.':
      'Tente novamente configurar o chat primeiro.',
    'Please wait until this chat is ready.': 'Aguarde até que este chat esteja pronto.',
    'Post request': 'Publicar solicitação',
    'Preparing voice note...': 'Preparando mensagem de voz...',
    'Previous': 'Anterior',
    'Previous Bridges Restored': 'Pontes anteriores restauradas',
    'Private handoff': 'Transferência privada',
    'Public name in notifications': 'Nome público nas notificações',
    'Publishing chat bundle...': 'Publicando pacote de chat...',
    'Receive address': 'Endereço de recebimento',
    'Receive Crypto': 'Receber criptomoedas',
    'Recipient': 'Destinatário',
    'Recipient {{network}} Address': 'Endereço de {{network}} do destinatário',
    'Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.':
      'Os destinatários são exibidos apenas dentro do Spectra. O iOS vê apenas o destino do app Spectra.',
    'Reconnecting...': 'Reconectando...',
    'Recovering secure call...': 'Recuperando chamada segura...',
    'Recovery word {{number}}': 'Palavra de recuperação {{number}}',
    'Refresh': 'Atualizar',
    'Regenerate': 'Gerar novamente',
    'Request a payment in this chat': 'Solicitar um pagamento neste chat',
    'Requested asset is not available in this wallet':
      'O ativo solicitado não está disponível nesta carteira.',
    'Reset': 'Redefinir',
    'Retry failed': 'Falha na nova tentativa',
    'Review Send': 'Revisar envio',
    'Root account': 'Conta raiz',
    'Root account required': 'Conta raiz necessária',
    'Rotate': 'Girar',
    'Save and Use Account': 'Salvar e usar conta',
    'Save encrypted contact archive': 'Salvar arquivo de contatos criptografado',
    'Search contacts...': 'Pesquisar contatos...',
    'Secure call': 'Chamada segura',
    'Secure call notifications': 'Notificações de chamadas seguras',
    'Secure call waiting': 'Aguardando chamada segura',
    'Securing chat...': 'Protegendo chat...',
    'Preparing secure channel...': 'Protegendo chat...',
    'Select Blockchain': 'Selecionar blockchain',
    'Select drawing color': 'Selecionar cor do desenho',
    'Sell': 'Vender',
    'Send {{symbol}}': 'Enviar {{symbol}}',
    'Send {{symbol}} to my {{network}} address:\n{{address}}':
      'Envie {{symbol}} para meu endereço de {{network}}:\n{{address}}',
    'Send ETH': 'Enviar ETH',
    'Sending as {{account}}': 'Enviando como {{account}}',
    'Sending transaction...': 'Enviando transação...',
    'Share {{network}} Address': 'Compartilhar endereço de {{network}}',
    'Share contact': 'Compartilhar contato',
    'Share to Spectra': 'Compartilhar no Spectra',
    'Shared content is missing. Please share it again.':
      'O conteúdo compartilhado está indisponível. Compartilhe-o novamente.',
    'Show {{displayName}} in your Contacts tab again?':
      'Mostrar {{displayName}} novamente na sua aba Contatos?',
    'Snowflake bootstrap privacy notice':
      'Aviso de privacidade da inicialização Snowflake',
    'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.':
      'O Snowflake usa infraestrutura de inicialização WebRTC, incluindo serviços de broker, STUN e proxies voluntários. Esses serviços podem observar o endereço IP do seu dispositivo e o horário da conexão. O Tor protege o tráfego depois que um circuito é estabelecido, mas não pode ocultar essa conexão de inicialização.',
    'Solana private key is not available': 'Chave privada Solana indisponível',
    'Solana wallet not available': 'Carteira Solana indisponível',
    'Something went wrong. Please try again.': 'Algo deu errado. Tente novamente.',
    'Spectra logo': 'Logotipo da Spectra',
    'Spectre access includes one diffusion channel.':
      'O acesso Spectre inclui um canal de difusão.',
    'SPL Tokens': 'Tokens SPL',
    'SPL tokens on Solana': 'Tokens SPL na Solana',
    'Stroke': 'Traço',
    'Switch to your root EXO account to create transparent EXO accounts.':
      'Mude para sua conta EXO raiz para criar contas EXO transparentes.',
    'Switch to your root EXO account to import transparent EXO accounts.':
      'Mude para sua conta EXO raiz para importar contas EXO transparentes.',
    'Switching EXO account...': 'Alternando conta EXO...',
    'Switching...': 'Alternando...',
    'Tap to load voice note': 'Toque para carregar a mensagem de voz',
    'Tap to reveal your recovery phrase': 'Toque para revelar sua frase de recuperação',
    'Tap to review and pay': 'Toque para revisar e pagar',
    'Tap to view shared links and documents':
      'Toque para ver links e documentos compartilhados',
    'Text': 'Texto',
    'Text or link': 'Texto ou link',
    'The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.':
      'O arquivo é criptografado neste dispositivo antes de ser compartilhado. Ele nunca é enviado ao Spectra. Mantenha o arquivo e a senha separados; o Spectra não pode recuperar nenhum dos dois.',
    'The payment transaction failed on-chain.':
      'A transação de pagamento falhou na blockchain.',
    'This EXO account already exists on this device.':
      'Esta conta EXO já existe neste dispositivo.',
    'This fetch used the normal network while Tor was disabled.':
      'Esta busca usou a rede normal enquanto o Tor estava desativado.',
    'This file is not available on this device yet.':
      'Este arquivo ainda não está disponível neste dispositivo.',
    'This image could not be edited right now.':
      'Não foi possível editar esta imagem agora.',
    'This message was deleted': 'Esta mensagem foi excluída',
    'This recovery phrase is shown only now. Store it offline before saving the new EXO account.':
      'Esta frase de recuperação é exibida somente agora. Armazene-a off-line antes de salvar a nova conta EXO.',
    'This request has already been marked as paid.':
      'Esta solicitação já foi marcada como paga.',
    'This secure chat is not ready yet. Please try again in a moment.':
      'Este chat seguro ainda não está pronto. Tente novamente em alguns instantes.',
    'This voice note could not be loaded right now.':
      'Não foi possível carregar esta mensagem de voz agora.',
    'This wallet does not have an account for {{network}}.':
      'Esta carteira não tem uma conta para {{network}}.',
    'To': 'Para',
    'Toggle media controls': 'Alternar controles de mídia',
    'Tor Bridges': 'Pontes Tor',
    'Tor Connection Failed': 'Falha na conexão Tor',
    'Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}':
      'O Tor não pôde se conectar com a configuração solicitada, então as pontes anteriores que funcionavam foram restauradas. {{error}}',
    'Tor is disabled, so bridge requests will use the normal network.':
      'O Tor está desativado, portanto as solicitações de pontes usarão a rede normal.',
    'Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.':
      'O Tor está ativado, mas não conectado. Desative o Tor antes de buscar pontes de inicialização pela rede normal.',
    'Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.':
      'O Tor ainda está se conectando. As solicitações de pontes permanecem bloqueadas até que um circuito Tor esteja disponível.',
    'Transaction failed on-chain': 'Transação falhou na cadeia',
    'Transfers': 'Transferências',
    'Transparent EXO accounts are restored from your recovery phrase.':
      'As contas EXO transparentes são restauradas pela sua frase de recuperação.',
    'TRC-20 on Tron': 'TRC-20 na Tron',
    'TRC-20 Tokens': 'Tokens TRC-20',
    'Tron private key is not available': 'Chave privada Tron indisponível',
    'Tron wallet not available': 'Carteira Tron indisponível',
    'Try Again': 'Tentar novamente',
    'Unable to edit image': 'Não foi possível editar a imagem',
    'Unable to load voice note': 'Não foi possível carregar a mensagem de voz',
    'Unable to open link': 'Não foi possível abrir o link',
    'Unable to remove recipient': 'Não foi possível remover o destinatário',
    'Unable to retry': 'Não foi possível tentar novamente',
    'Unable to send': 'Não foi possível enviar',
    'Unable to switch EXO account': 'Não foi possível alternar a conta EXO',
    'Unblock': 'Desbloquear',
    'Unblock {{displayName}}? They will be able to send you messages again.':
      'Desbloquear {{displayName}}? Essa pessoa poderá enviar mensagens para você novamente.',
    'Undo': 'Desfazer',
    'Unlock the wallet that will pay for this membership and try again.':
      'Desbloqueie a carteira que pagará por esta associação e tente novamente.',
    'Unlock your vault before managing a contact archive.':
      'Desbloqueie seu cofre antes de gerenciar um arquivo de contatos.',
    'Unsupported {{type}} attachment': 'Anexo do tipo {{type}} não compatível',
    'Unsupported attachment': 'Anexo não compatível',
    'Upgrade to Spectre to create one diffusion channel.':
      'Atualize para o Spectre para criar um canal de difusão.',
    'Use': 'Usar',
    'Use {{word}} for recovery word {{number}}':
      'Use {{word}} para a palavra de recuperação {{number}}',
    'Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.':
      'Use uma senha exclusiva com pelo menos 16 caracteres, incluindo letras, números e símbolos. O Spectra não pode recuperá-la.',
    'Use Biometric': 'Usar biometria',
    'Use original': 'Usar original',
    'Use the original offline backup you created during onboarding if you need the phrase again. If it is lost, create a newly backed up wallet and migrate to it. The device cannot reveal the old phrase.':
      'Use o backup off-line original criado durante a configuração inicial se precisar da frase novamente. Se ele for perdido, crie uma nova carteira com backup e migre para ela. O dispositivo não pode revelar a frase antiga.',
    'V1 supports Mozaga native EXO only. The company fee is {{fee}}.':
      'A V1 é compatível apenas com EXO nativo da Mozaga. A taxa da empresa é {{fee}}.',
    'via {{account}}': 'via {{account}}',
    'Voice note unavailable': 'Mensagem de voz indisponível',
    'Volume': 'Volume',
    'Wallet transfer notifications': 'Notificações de transferências da carteira',
    'Wallets': 'Carteiras',
    'Work, Friends, Personal...': 'Trabalho, Amigos, Pessoal...',
    'You can import up to 5 transparent EXO accounts from one recovery phrase.':
      'Você pode importar até 5 contas EXO transparentes de uma frase de recuperação.',
    'You requested': 'Você solicitou',
    'You\'ll enter the {{network}} address in the next step':
      'Você inserirá o endereço de {{network}} na próxima etapa',
    'Your payment was submitted but is still waiting for confirmation. Reopen this invite in a moment to finish joining.':
      'Seu pagamento foi enviado, mas ainda aguarda confirmação. Abra este convite novamente em alguns instantes para concluir a entrada.',
    'A newer version of Spectra is available. Update to get the latest features and fixes.':
      'Uma versão mais recente do Spectra está disponível. Atualize para obter os recursos e correções mais recentes.',
    'This version of Spectra is no longer supported. Update to continue using secure services.':
      'Esta versão do Spectra não é mais compatível. Atualize o aplicativo para continuar usando os serviços seguros.',
    'Update available': 'Atualização disponível',
    'Update required': 'Atualização necessária',
    'Update Spectra': 'Atualizar Spectra',
  },
  auth: {
    '{{count}} characters maximum.': 'Máximo de {{count}} caracteres.',
    'Account import progress': 'Progresso da importação da conta',
    'Authenticate to upgrade biometric unlock':
      'Autentique-se para atualizar o desbloqueio biométrico',
    'Choose a Public Name': 'Escolha um nome público',
    'Deriving wallets...': 'Derivando carteiras...',
    'Finishing previous account deletion...':
      'Concluindo a exclusão anterior da conta...',
    'Go back': 'Voltar',
    'Important': 'Importante',
    'Importing Account': 'Importando conta',
    'Invalid mnemonic checksum': 'Soma de verificação da frase mnemônica inválida',
    'Invalid word: "{{word}}"': 'Palavra inválida: "{{word}}"',
    'Mnemonic must be 12 or 24 words':
      'A frase mnemônica deve ter 12 ou 24 palavras',
    'Optional public name for chats': 'Nome público opcional para chats',
    'PIN input': 'Entrada de PIN',
    'Public Name': 'Nome público',
    'Public name contains invalid text.': 'O nome público contém texto inválido.',
    'Public name contains unsupported characters':
      'O nome público contém caracteres não permitidos',
    'Public name contains unsupported control characters.':
      'O nome público contém caracteres de controle não permitidos.',
    'Public name contains unsupported direction controls.':
      'O nome público contém controles de direção não permitidos.',
    'Public name is too large': 'O nome público é muito longo',
    'Public name is too large when encoded.':
      'O nome público é muito longo quando codificado.',
    'Public name must be {{max}} characters or fewer':
      'O nome público deve ter {{max}} caracteres ou menos',
    'Public name must be 80 characters or fewer.':
      'O nome público deve ter 80 caracteres ou menos.',
    'This optional name helps people recognize you in chats and contacts. You can change or remove it later.':
      'Este nome opcional ajuda as pessoas a reconhecer você em chats e contatos. Você pode alterá-lo ou removê-lo mais tarde.',
    'Unable to use this public name': 'Não é possível usar este nome público',
    'Unlock Spectra to connect your secure call':
      'Desbloqueie o Spectra para conectar sua chamada segura',
    'Your public name is shared as chat-directory metadata. It is not included in your recovery phrase and does not affect account security.':
      'Seu nome público é compartilhado como metadado do diretório de chats. Ele não é incluído na sua frase de recuperação e não afeta a segurança da conta.',
  },
  chat: {
    '#Tag': '#Tag',
    '{{count}} messages': '{{count}} mensagens',
    '{{name}} took a screenshot': '{{name}} tirou uma captura de tela',
    'Add a contact and open a private chat':
      'Adicione um contato e abra um chat privado',
    'Add attachment': 'Adicionar anexo',
    'Add by address': 'Adicionar por endereço',
    'Add by invitation': 'Adicionar por convite',
    'Add someone by address or scan their QR code to start.':
      'Adicione alguém pelo endereço ou escaneie o QR code para começar.',
    'Caching locally': 'Armazenando localmente',
    'Cancel reply': 'Cancelar resposta',
    'Cancel voice note': 'Cancelar mensagem de voz',
    'Choose a contact or start with an address':
      'Escolha um contato ou comece com um endereço',
    'Choose a contact or use a secure invitation':
      'Escolha um contato ou use um convite seguro',
    'Complete': 'Concluído',
    'Crop bottom-left handle': 'Alça inferior esquerda de corte',
    'Crop bottom-right handle': 'Alça inferior direita de corte',
    'Crop frame': 'Moldura de corte',
    'Crop top-left handle': 'Alça superior esquerda de corte',
    'Crop top-right handle': 'Alça superior direita de corte',
    'Edit image': 'Editar imagem',
    'Encrypting and uploading {{completed}}/{{total}}':
      'Criptografando e enviando {{completed}}/{{total}}',
    'Load more': 'Carregar mais',
    'Nearby': 'Por perto',
    'Nearby delivery expired': 'Entrega por proximidade expirou',
    'Nearby delivery failed': 'Falha na entrega por proximidade',
    'Nearby delivery interrupted': 'Entrega por proximidade interrompida',
    'Nearby queue full': 'Fila de proximidade cheia',
    'Nearby receipt timed out': 'Confirmação de recebimento por proximidade expirou',
    'Nearby retry limit reached': 'Limite de tentativas por proximidade atingido',
    'Nearby transmission failed': 'Falha na transmissão por proximidade',
    'No saved contacts yet': 'Ainda não há contatos salvos',
    'Paste a secure invitation or scan its QR code':
      'Cole um convite seguro ou escaneie seu QR code',
    'Paste a secure invitation or scan its QR code to start.':
      'Cole um convite seguro ou escaneie seu QR code para começar.',
    'Pause voice note': 'Pausar mensagem de voz',
    'Play voice note': 'Reproduzir mensagem de voz',
    'Preparing message': 'Preparando mensagem',
    'Queued nearby': 'Na fila para envio por proximidade',
    'Record voice note': 'Gravar mensagem de voz',
    'Remove attachment': 'Remover anexo',
    'Scan, add, and start a private chat':
      'Escaneie, adicione e inicie um chat privado',
    'Select from contacts': 'Selecionar dos contatos',
    'Send message': 'Enviar mensagem',
    'Send voice note': 'Enviar mensagem de voz',
    'Sending attachment': 'Enviando anexo',
    'Sending message': 'Enviando mensagem',
    'Sending nearby': 'Enviando por proximidade',
    'Start Chat': 'Iniciar chat',
    'Start Secret Chat': 'Iniciar chat secreto',
    'Starting chat...': 'Iniciando chat...',
    'Starting from {{account}}': 'Iniciando de {{account}}',
    'Text overlay': 'Sobreposição de texto',
    'Toggle one-time message': 'Alternar mensagem de visualização única',
    'Unable to start chat': 'Não foi possível iniciar o chat',
    'Updated {{time}}': 'Atualizado {{time}}',
    'You took a screenshot': 'Você tirou uma captura de tela',
  },
  contacts: {
    'Add by secure contact invitation': 'Adicionar por convite de contato seguro',
    'Adding to': 'Adicionando a',
    'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.':
      'Digite o endereço pós-quântico da pessoa que deseja adicionar. Ela deve ter compartilhado o endereço com você.',
    'EXO Account': 'Conta EXO',
    'Invalid contact invitation': 'Convite de contato inválido',
    'Invalid secure contact invitation': 'Convite de contato seguro inválido',
    'Paste a secure contact invitation or scan a contact QR code':
      'Cole um convite de contato seguro ou escaneie um QR code de contato',
    'Paste a secure contact invitation or scan its QR code.':
      'Cole um convite de contato seguro ou escaneie seu QR code.',
    'Paste a valid secure contact invitation.':
      'Cole um convite de contato seguro válido.',
    'Please wait until the EXO account switch finishes.':
      'Aguarde até que a troca de conta EXO termine.',
    'Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.':
      'Escaneie um QR code de contato ou cole o convite de contato seguro compartilhado pela pessoa que deseja adicionar.',
    'Scan a secure Spectra contact QR code shared by the person you want to add.':
      'Escaneie um QR code seguro de contato do Spectra compartilhado pela pessoa que deseja adicionar.',
    'Secure Contact Invitation': 'Convite de contato seguro',
    'Secure invitation ready': 'Convite seguro pronto',
    'Selected': 'Selecionado',
    'Switching...': 'Alternando...',
    'This contact will be saved under this EXO account on this device.':
      'Este contato será salvo nesta conta EXO neste dispositivo.',
    'via {{account}}': 'via {{account}}',
  },
  crypto: {
    '{{symbol}} logo': 'Logotipo de {{symbol}}',
    '~{{fee}} {{symbol}}': '~{{fee}} {{symbol}}',
    'Total': 'Total',
    'USDT logo': 'Logotipo de USDT',
  },
  markets: {
    '{{count}} backers': '{{count}} apoiadores',
    '{{count}}d left': '{{count}}d restantes',
    '{{count}}h left': '{{count}}h restantes',
    '{{count}}m left': '{{count}}m restantes',
    '0 (unlimited)': '0 (ilimitado)',
    'Amount exceeds remaining allowance': 'O valor excede o limite restante',
    'Cannot contribute': 'Não é possível contribuir',
    'Connect wallet to create a campaign':
      'Conecte uma carteira para criar uma campanha',
    'Connect wallet to create an escrow order':
      'Conecte uma carteira para criar uma ordem de custódia',
    'Connect wallet to view your campaigns':
      'Conecte uma carteira para ver suas campanhas',
    'Connect wallet to view your escrow orders':
      'Conecte uma carteira para ver suas ordens de custódia',
    'Describe the condition for release...': 'Descreva a condição para liberação...',
    'Enter a valid market ID': 'Insira um ID de mercado válido',
    'Enter a valid sale ID': 'Insira um ID de venda válido',
    'Fiat price must be greater than zero':
      'O preço em moeda fiduciária deve ser maior que zero',
    'Filled': 'Preenchido',
    'Hot Predictions': 'Previsões em destaque',
    'Invalid campaign ID': 'ID de campanha inválido',
    'Invalid order ID': 'ID de ordem inválido',
    'Invalid sale ID': 'ID de venda inválido',
    'Live Campaigns': 'Campanhas ativas',
    'No description': 'Sem descrição',
    'No escrow orders found': 'Nenhuma ordem de custódia encontrada',
    'No order activity yet': 'Ainda não há atividade de ordens',
    'of': 'de',
    'Partially Filled': 'Parcialmente preenchido',
    'Pools': 'Pools',
    'See all': 'Ver tudo',
    'Trending Markets': 'Mercados em alta',
    'Untitled campaign': 'Campanha sem título',
    'Vol': 'Vol.',
    'Yes': 'Sim',
    'You are not eligible to contribute': 'Você não está qualificado para contribuir',
  },
  profile: {
    'Show VDF progress': 'Mostrar progresso VDF',
    'Proofs still run in the background when this is off.':
      'As provas continuam a ser executadas em segundo plano quando isto está desativado.',
    'Account Label': 'Rótulo da conta',
    'Change Photo': 'Alterar foto',
    'Chat bundle not on server — others cannot find you':
      'Pacote de chat não está no servidor — outras pessoas não podem encontrar você',
    'Chat bundle registered on server': 'Pacote de chat registrado no servidor',
    'Chat identity not available. Please restart the app.':
      'Identidade de chat indisponível. Reinicie o app.',
    'Checking chat bundle...': 'Verificando pacote de chat...',
    'Checking identity link...': 'Verificando vínculo de identidade...',
    'Could not link identity. Please try again.':
      'Não foi possível vincular a identidade. Tente novamente.',
    'Could not refresh session. Check your connection.':
      'Não foi possível atualizar a sessão. Verifique sua conexão.',
    'Edit Profile': 'Editar perfil',
    'Identity linked to server': 'Identidade vinculada ao servidor',
    'Identity not linked — messaging is disabled':
      'Identidade não vinculada — as mensagens estão desativadas',
    'Member since {{date}}': 'Membro desde {{date}}',
    'Name this account': 'Dê um nome a esta conta',
    'Optional public name for chats': 'Nome público opcional para chats',
    'Photo disabled in Spectre Mode': 'Foto desativada no modo Spectre',
    'Preparing secure contact invitation…':
      'Preparando convite de contato seguro…',
    'Preparing secure contact card…': 'Preparando cartão de contato seguro…',
    'Preparing secure share…': 'Preparando compartilhamento seguro…',
    'Create a one-time card to show your QR code.':
      'Crie um cartão de uso único para mostrar seu código QR.',
    'Create one-time contact card': 'Criar cartão de contato de uso único',
    'Publish for 5 minutes': 'Publicar por 5 minutos',
    'Your account is discoverable for 5 minutes.':
      'Sua conta pode ser encontrada por 5 minutos.',
    'Your account is already discoverable.': 'Sua conta já pode ser encontrada.',
    'Your one-time contact card is still active.':
      'Seu cartão de contato de uso único ainda está ativo.',
    'Open one-time contact card': 'Abrir cartão de contato de uso único',
    'One-time contact card ready': 'Cartão de contato de uso único pronto',
    'Expires in {{minutes}} min': 'Expira em {{minutes}} min',
    'One-time contact card': 'Cartão de contato de uso único',
    'Share this QR code before it expires.':
      'Compartilhe este QR code antes que expire.',
    'A one-time contact card expires after one hour and can be used once.':
      'Um cartão de contato de uso único expira após uma hora e só pode ser usado uma vez.',
    'Chat identity is not ready yet.': 'A identidade de chat ainda não está pronta.',
    'Profile photos cannot be changed while Spectre Mode is active.':
      'As fotos de perfil não podem ser alteradas enquanto o modo Spectre estiver ativo.',
    'Public Name': 'Nome público',
    'Public name contains invalid text.': 'O nome público contém texto inválido.',
    'Public name contains unsupported characters':
      'O nome público contém caracteres não permitidos',
    'Public name contains unsupported control characters.':
      'O nome público contém caracteres de controle não permitidos.',
    'Public name contains unsupported direction controls.':
      'O nome público contém controles de direção não permitidos.',
    'Public name is too large': 'O nome público é muito longo',
    'Public name is too large when encoded.':
      'O nome público é muito longo quando codificado.',
    'Public name must be {{max}} characters or fewer':
      'O nome público deve ter {{max}} caracteres ou menos',
    'Public name must be 80 characters or fewer.':
      'O nome público deve ter 80 caracteres ou menos.',
    'Public profile metadata is read-only while Spectre Mode is active.':
      'Os metadados do perfil público são somente leitura enquanto o modo Spectre estiver ativo.',
    'Public profile names cannot be edited while Spectre Mode is active.':
      'Os nomes de perfil público não podem ser editados enquanto o modo Spectre estiver ativo.',
    'Publication needs attention. Retry when you are online.':
      'A publicação precisa de atenção. Tente novamente quando estiver on-line.',
    'Published': 'Publicado',
    'Publishing public name...': 'Publicando nome público...',
    'Retry Publication': 'Tentar publicar novamente',
    'Save Public Name': 'Salvar nome público',
    'Security Status': 'Status de segurança',
    'Server session active': 'Sessão do servidor ativa',
    'Server session expired — features may not work':
      'Sessão do servidor expirada — alguns recursos podem não funcionar',
    'This is a local label to help you identify this account. It is not your public chat name.':
      'Este é um rótulo local para ajudar você a identificar esta conta. Ele não é seu nome público de chat.',
    'This name is visible to your contacts': 'Este nome é visível para seus contatos',
    'This public name is saved on this device and will publish when your chat identity is linked.':
      'Este nome público é salvo neste dispositivo e será publicado quando sua identidade de chat for vinculada.',
    'This repeatable name is public chat-directory metadata. People who have not saved you under another name can see it in chats and contacts. It appears in notifications only when both sides enable that privacy trade-off.':
      'Este nome reutilizável é um metadado público do diretório de chats. Pessoas que não salvaram você com outro nome podem vê-lo em chats e contatos. Ele aparece nas notificações somente quando ambos os lados ativam essa opção de privacidade.',
    'Unable to use this public name': 'Não é possível usar este nome público',
    'Unknown error': 'Erro desconhecido',
    'Waiting for chat readiness. Automatic retries are scheduled.':
      'Aguardando a disponibilidade do chat. Novas tentativas automáticas estão programadas.',
  },
  settings: {
    'Activating secure online access': 'Ativando acesso online seguro',
    'Publishing secure discovery': 'Publicando descoberta segura',
    'Keeping you findable': 'Mantendo-te encontrável',
    'Starting a secure chat': 'A iniciar um chat seguro',
    'Creating one-time contact card': 'Criando cartão de contato de uso único',
    'Computing VDF proof': 'Calculando prova VDF',
    'Solving a sequential proof that helps prevent automated account creation.':
      'Resolvendo uma prova sequencial que ajuda a impedir a criação automatizada de contas.',
    'Generating VDF proof': 'Gerando prova VDF',
    'Preparing the compact proof the server can verify efficiently.':
      'Preparando a prova compacta que o servidor pode verificar com eficiência.',
    'Waiting for server verification': 'Aguardando verificação do servidor',
    'Retrying server verification': 'Tentando novamente a verificação do servidor',
    'Proof ready. The server enforces a minimum delay before it accepts it.':
      'A prova está pronta. O servidor impõe um atraso mínimo antes de aceitá-la.',
    'Verifying VDF proof': 'Verificando prova VDF',
    'Sending the proof for secure verification.':
      'Enviando a prova para verificação segura.',
    'Secure online access is ready': 'O acesso online seguro está pronto',
    'Your secure online access is active.': 'Seu acesso online seguro está ativo.',
    'VDF work was cancelled': 'O trabalho VDF foi cancelado',
    'No proof was submitted.': 'Nenhuma prova foi enviada.',
    'Secure access needs attention': 'O acesso seguro precisa de atenção',
    'This proof could not be completed. Check your connection and try again.':
      'Não foi possível concluir esta prova. Verifique sua conexão e tente novamente.',
    '{{percent}}% complete': '{{percent}}% concluído',
    'VDFs completed {{completed}}/{{total}}': 'VDFs concluídos {{completed}}/{{total}}',
    '{{rate}} VDF iterations/s': '{{rate}} iterações VDF/s',
    'Measuring VDF rate…': 'Medindo a velocidade VDF…',
    '~{{count}}s remaining': '~{{count}} s restantes',
    'Cancel secure work': 'Cancelar trabalho seguro',
    'Could not start this chat': 'Não foi possível iniciar este chat',
    'Could not update discovery': 'Não foi possível atualizar a descoberta',
    'Could not create contact card': 'Não foi possível criar o cartão de contacto',
    'Dismiss': 'Dispensar',
    'Keep Spectra open while the security proof is verified.':
      'Mantenha o Spectra aberto enquanto a prova de segurança é verificada.',
    '{{count}}s elapsed': '{{count}}s decorridos',
    '{{count}}s elapsed - this may take 30-240 seconds with bridges':
      '{{count}}s decorridos - isso pode levar de 30 a 240 segundos com pontes',
    'A verified backend session is required before deleting this account.':
      'Uma sessão de backend verificada é necessária antes de excluir esta conta.',
    'A verified Backend session is required for Spectre activation':
      'Uma sessão de Backend verificada é necessária para a ativação do Spectre',
    'Account deleted': 'Conta excluída',
    'Account Deletion': 'Exclusão da conta',
    'Account deletion completed': 'Exclusão da conta concluída',
    'Account Deletion Failed': 'Falha na exclusão da conta',
    'Account deletion failed. Try again after checking your connection.':
      'A exclusão da conta falhou. Tente novamente depois de verificar sua conexão.',
    'Account deletion needs attention': 'A exclusão da conta precisa de atenção',
    'Applying Spectre protections': 'Aplicando proteções do Spectre',
    'Backend cleanup could not be checked. Retry when the private connection is available.':
      'Não foi possível verificar a limpeza do backend. Tente novamente quando a conexão privada estiver disponível.',
    'Backend cleanup is paused and will be retried safely. Try checking again.':
      'A limpeza do backend está pausada e será tentada novamente com segurança. Tente verificar de novo.',
    'Backend cleanup is still running. You can retry this status check safely.':
      'A limpeza do backend ainda está em andamento. Você pode tentar esta verificação de status novamente com segurança.',
    'Backend deletion completed, but final device cleanup needs to be retried.':
      'A exclusão no backend foi concluída, mas a limpeza final do dispositivo precisa ser tentada novamente.',
    'Backend deletion completed, but local key erasure could not be confirmed.':
      'A exclusão no backend foi concluída, mas não foi possível confirmar o apagamento das chaves locais.',
    'Backend is not configured for Spectre activation':
      'O backend não está configurado para a ativação do Spectre',
    'Changes were rolled back': 'As alterações foram revertidas',
    'Checking private access': 'Verificando acesso privado',
    'Choose a new 6-digit PIN': 'Escolha um novo PIN de 6 dígitos',
    'Cleanup could not be confirmed. You can retry safely.':
      'Não foi possível confirmar a limpeza. Você pode tentar novamente com segurança.',
    'Cloud Session Required': 'Sessão de nuvem necessária',
    'Confirm Account Deletion': 'Confirmar exclusão da conta',
    'Confirm New PIN': 'Confirmar novo PIN',
    'Connecting your private route': 'Conectando sua rota privada',
    'Contact Archive': 'Arquivo de contatos',
    'Deleting Account': 'Excluindo conta',
    'Deleting account records': 'Excluindo registros da conta',
    'Deleting chat relay data': 'Excluindo dados do relay de chat',
    'Deleting encrypted objects': 'Excluindo objetos criptografados',
    'Deletion needs attention': 'A exclusão precisa de atenção',
    'Disabled by Spectre Mode': 'Desativado pelo modo Spectre',
    'Encrypted contact archive': 'Arquivo de contatos criptografado',
    'Enter Current PIN': 'Digite o PIN atual',
    'Enter New PIN': 'Digite o novo PIN',
    'Enter your current PIN': 'Digite seu PIN atual',
    'Enter your current PIN before creating a duress PIN':
      'Digite seu PIN atual antes de criar um PIN de coação',
    'Enter your PIN to continue to the final destructive confirmation.':
      'Digite seu PIN para continuar para a confirmação destrutiva final.',
    'Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.':
      'Ao digitar o PIN de coação, será tentada a exclusão dos dados da conta no backend, a limpeza deste dispositivo e o encerramento imediato da sua sessão.',
    'Erase Account Permanently?': 'Apagar conta permanentemente?',
    'Erase Everything': 'Apagar tudo',
    'Erasing local keys and data': 'Apagando chaves e dados locais',
    'EXO can continue refreshing chats in the background once Spectre is ready.':
      'O EXO pode continuar atualizando chats em segundo plano quando o Spectre estiver pronto.',
    'EXO has finished switching back from Spectre Mode.':
      'O EXO terminou de voltar do modo Spectre.',
    'EXO is validating your Spectre account and required protections before the private handoff starts.':
      'O EXO está validando sua conta Spectre e as proteções necessárias antes do início da transferência privada.',
    'EXO is verifying the wallet session it uses for private network services.':
      'O EXO está verificando a sessão da carteira usada para os serviços de rede privada.',
    'EXO stopped the Spectre flow and restored the previous safe state where it could.':
      'O EXO interrompeu o fluxo do Spectre e restaurou o estado seguro anterior quando foi possível.',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Exporte um arquivo criptografado que você controla e importe-o mais tarde para preservar os contatos salvos.',
    'Export and import encrypted contacts': 'Exportar e importar contatos criptografados',
    'Failed to change PIN': 'Não foi possível alterar o PIN',
    'Failed to disable an expired Spectre session':
      'Não foi possível desativar uma sessão Spectre expirada',
    'Failed to disable Spectre Mode': 'Não foi possível desativar o modo Spectre',
    'Failed to refresh Spectre access': 'Não foi possível atualizar o acesso Spectre',
    'Failed to verify PIN': 'Não foi possível verificar o PIN',
    'Finalizing secure cleanup': 'Finalizando a limpeza segura',
    'Finalizing Spectre shutdown': 'Finalizando o encerramento do Spectre',
    'Finishing the private handoff': 'Concluindo a transferência privada',
    'Getting Spectre ready': 'Preparando o Spectre',
    'Keep Spectra open while each verified cleanup stage completes.':
      'Mantenha o Spectra aberto enquanto cada etapa de limpeza verificada é concluída.',
    'Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.':
      'Mantenha esta tela aberta enquanto o EXO aplica as mudanças de privacidade necessárias para o modo Spectre.',
    'Keep this screen open while EXO prepares the secure activation handoff.':
      'Mantenha esta tela aberta enquanto o EXO prepara a transferência de ativação segura.',
    'Keep this screen open while EXO restores your regular wallet and security settings.':
      'Mantenha esta tela aberta enquanto o EXO restaura sua carteira regular e suas configurações de segurança.',
    'Loading your Spectre setup': 'Carregando sua configuração do Spectre',
    'Local data and the accepted backend cleanup have finished.':
      'Os dados locais e a limpeza aceita do backend foram concluídos.',
    'Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.':
      'Os dados locais foram apagados, mas não foi possível confirmar a limpeza do backend. Tente novamente quando a conexão privada estiver disponível.',
    'Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.':
      'Os dados locais foram apagados, mas o backend não aceitou a solicitação de exclusão. Importe a conta novamente para tentar de novo.',
    'New PIN must be different from current PIN':
      'O novo PIN deve ser diferente do PIN atual',
    'One anonymous activation token can be requested every 24 hours.':
      'Um token de ativação anônimo pode ser solicitado a cada 24 horas.',
    'PINs do not match': 'Os PINs não coincidem',
    'Preparing secure deletion': 'Preparando a exclusão segura',
    'Preparing Spectre Mode': 'Preparando o modo Spectre',
    'Preparing your private workspace': 'Preparando seu espaço privado',
    'Preparing your Spectre account': 'Preparando sua conta Spectre',
    'Preparing your Spectre setup': 'Preparando sua configuração do Spectre',
    'Re-enter your new PIN to confirm': 'Digite novamente seu novo PIN para confirmar',
    'Registering the private account': 'Registrando a conta privada',
    'Reserving private activation': 'Reservando a ativação privada',
    'Restoring network and cleanup': 'Restaurando rede e limpeza',
    'Restoring privacy protections': 'Restaurando proteções de privacidade',
    'Restoring your main profile': 'Restaurando seu perfil principal',
    'Retry account deletion cleanup':
      'Tentar novamente a limpeza da exclusão da conta',
    'Retry cleanup': 'Tentar limpar novamente',
    'Review the failed step below before trying again.':
      'Revise a etapa que falhou abaixo antes de tentar novamente.',
    'Secure account deletion stopped unexpectedly. Try again when the private connection is available.':
      'A exclusão segura da conta parou inesperadamente. Tente novamente quando a conexão privada estiver disponível.',
    'Secure deletion in progress': 'Exclusão segura em andamento',
    'Spectre cannot finish until Tor is connected. Try bridges or a different network.':
      'O Spectre não pode terminar até que o Tor esteja conectado. Tente pontes ou outra rede.',
    'Spectre chats and contacts are still refreshing in the background.':
      'Os chats e contatos do Spectre ainda estão sendo atualizados em segundo plano.',
    'Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.':
      'O Spectre desativa chamadas e ações de criptomoedas; remove tokens de push; força Tor, PIN de coação, limpeza em caso de falha, proteção contra capturas de tela e privacidade no alternador de apps; e define temporizadores curtos de desaparecimento para novas mensagens.',
    'Spectre needs your attention': 'O Spectre precisa da sua atenção',
    'Spectre protections are active': 'As proteções do Spectre estão ativas',
    'Submitting the deletion request': 'Enviando a solicitação de exclusão',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Mude para sua conta EXO raiz para criar ou importar contas EXO transparentes.',
    'Switching back to your main wallet': 'Voltando para sua carteira principal',
    'Switching to your Spectre identity': 'Alternando para sua identidade Spectre',
    'The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.':
      'O backend não reconhece mais este token de limpeza. Importe a conta novamente para verificar a exclusão.',
    'The cleanup status token expired. Re-import the account to verify its status.':
      'O token de status da limpeza expirou. Importe a conta novamente para verificar o status.',
    'There is no pending backend cleanup to retry.':
      'Não há limpeza pendente do backend para tentar novamente.',
    'This cannot be undone. Backend data and local sensitive data will be erased for this account.':
      'Isso não pode ser desfeito. Os dados do backend e os dados locais sensíveis serão apagados para esta conta.',
    'This cannot be undone. Local sensitive data is erased before the backend deletion request starts.':
      'Isso não pode ser desfeito. Os dados locais sensíveis são apagados antes do início da solicitação de exclusão no backend.',
    'This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.':
      'Isso exclui as chaves e os dados locais primeiro e, em seguida, envia a limpeza do backend pelo seu transporte privado atual. Uma tela de progresso permanece visível até que a limpeza seja confirmada.',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'Isso remove esta conta EXO deste dispositivo e libera uma vaga de conta EXO transparente para esta frase de recuperação. As mensagens existentes desta conta são apagadas localmente. Isso não pode ser desfeito.',
    'This screen updates automatically as each Spectre stage finishes.':
      'Esta tela é atualizada automaticamente à medida que cada etapa do Spectre termina.',
    'This screen updates only when a cleanup stage is confirmed.':
      'Esta tela é atualizada somente quando uma etapa de limpeza é confirmada.',
    'Tor could not connect': 'O Tor não pôde se conectar',
    'Tor must be online before Spectre can switch identities and continue.':
      'O Tor precisa estar on-line antes que o Spectre possa alternar identidades e continuar.',
    'Tor routing applies only inside Spectra. Device-wide network routing is unchanged.':
      'O roteamento Tor se aplica apenas dentro do Spectra. O roteamento de rede de todo o dispositivo não é alterado.',
    'Unable to complete Spectre activation':
      'Não foi possível concluir a ativação do Spectre',
    'Unlock or reconnect to the backend before deleting the account.':
      'Desbloqueie ou reconecte-se ao backend antes de excluir a conta.',
    'Verify Primary PIN': 'Verificar PIN principal',
    'Verify your identity to change PIN': 'Verifique sua identidade para alterar o PIN',
    'Verifying private access': 'Verificando acesso privado',
    'Your main wallet is restored': 'Sua carteira principal foi restaurada',
    'Your PIN has been changed successfully.': 'Seu PIN foi alterado com sucesso.',
    'Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.':
      'Sua carteira Spectre e o túnel Tor estão prontos. Os chats e contatos podem terminar de ser atualizados em segundo plano.',
    'Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.':
      'Sua carteira Spectre está ativa. O EXO está alternando o escopo de armazenamento e carregando dados locais para este perfil privado.',
  },
  tor: {
    'Connected to Spectre': 'Conectado ao Spectre',
  },
} satisfies LocaleTranslationOverrides

export default translations

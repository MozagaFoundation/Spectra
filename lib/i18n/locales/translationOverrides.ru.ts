/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LocaleTranslationOverrides } from './translationOverrideTypes'

const translations = {
  common: {
    'Creating your post-quantum identity...': 'Создание вашей постквантовой идентичности...',
    'Encrypted group sender keys': 'Зашифрованные ключи отправителя группы',
    'End-to-end encrypted': 'Сквозное шифрование',
    'End-to-end encryption available for supported chats':
      'Сквозное шифрование доступно для поддерживаемых чатов',
    'Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.':
      'Ключи группы распространяются через существующие зашифрованные прямые сеансы. При удалении участника активный ключ группы автоматически меняется.',
    'Hybrid post-quantum messaging': 'Гибридный постквантовый обмен сообщениями',
    'ML-DSA-65 post-quantum signatures': 'Постквантовые подписи ML-DSA-65',
    'Post-quantum': 'Постквантовый',
    'Post-quantum identity keys ready': 'Постквантовые ключи идентичности готовы',
    'Securing your encrypted vault...': 'Защита вашего зашифрованного хранилища...',
    'Supported direct messages are end-to-end encrypted.':
      'Поддерживаемые прямые сообщения защищены сквозным шифрованием.',
    'Snowflake bootstrap privacy notice': 'Уведомление о конфиденциальности при запуске Snowflake',
    'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.':
      'Snowflake использует инфраструктуру запуска WebRTC, включая брокер, STUN и добровольные прокси-сервисы. Эти сервисы могут видеть IP-адрес вашего устройства и время подключения. Tor защищает трафик после создания цепочки, но не скрывает это начальное подключение.',
    'I understand': 'Понятно',
    'Switching...': 'Переключение...',
    'Import': 'Импортировать',
    'Use': 'Использовать',
    'Erasing...': 'Удаление...',
    'Could not switch EXO account': 'Не удалось переключить аккаунт EXO',
    'Unable to switch EXO account': 'Не удаётся переключить аккаунт EXO',
    'Switching EXO account...': 'Переключение аккаунта EXO...',
    'Transparent EXO accounts are restored from your recovery phrase.':
      'Прозрачные аккаунты EXO восстанавливаются из вашей фразы восстановления.',
    'Failed to generate account': 'Не удалось создать аккаунт',
    'Confirm that you backed up the recovery phrase before using this EXO account.':
      'Подтвердите, что вы создали резервную копию фразы восстановления, прежде чем использовать этот аккаунт EXO.',
    'Failed to save EXO account': 'Не удалось сохранить аккаунт EXO',
    'Regenerate': 'Сгенерировать заново',
    'Create EXO Account': 'Создать аккаунт EXO',
    'Create a new transparent EXO account for work, friends, or another chat identity.':
      'Создайте новый прозрачный аккаунт EXO для работы, друзей или другой личности в чатах.',
    'Root account required': 'Требуется корневой аккаунт',
    'Each recovery phrase restores up to 5 transparent EXO accounts.':
      'Каждая фраза восстановления позволяет восстановить до 5 прозрачных аккаунтов EXO.',
    'Switch to your root EXO account to create transparent EXO accounts.':
      'Переключитесь на корневой аккаунт EXO, чтобы создавать прозрачные аккаунты EXO.',
    'Generating secure keys...': 'Создание защищённых ключей...',
    'New EXO Account': 'Новый аккаунт EXO',
    'Never share your recovery phrase': 'Никому не сообщайте фразу восстановления',
    'This recovery phrase is shown only now. Store it offline before saving the new EXO account.':
      'Эта фраза восстановления показывается только сейчас. Сохраните её офлайн, прежде чем сохранять новый аккаунт EXO.',
    'Tap to reveal your recovery phrase': 'Нажмите, чтобы показать фразу восстановления',
    'Make sure no one is watching your screen': 'Убедитесь, что никто не видит ваш экран',
    'I backed up this recovery phrase offline.': 'Я сохранил(а) эту фразу восстановления офлайн.',
    'Save and Use Account': 'Сохранить и использовать аккаунт',
    'Invalid recovery phrase': 'Неверная фраза восстановления',
    'This EXO account already exists on this device.':
      'Этот аккаунт EXO уже существует на устройстве.',
    'Failed to import account': 'Не удалось импортировать аккаунт',
    'Import EXO Account': 'Импортировать аккаунт EXO',
    'Import a transparent EXO recovery phrase into this unlocked root vault.':
      'Импортируйте фразу восстановления прозрачного аккаунта EXO в это разблокированное корневое хранилище.',
    'You can import up to 5 transparent EXO accounts from one recovery phrase.':
      'Из одной фразы восстановления можно импортировать до 5 прозрачных аккаунтов EXO.',
    'Switch to your root EXO account to import transparent EXO accounts.':
      'Переключитесь на корневой аккаунт EXO, чтобы импортировать прозрачные аккаунты EXO.',
    'Only import a recovery phrase you control. Imported accounts can send and receive chats independently.':
      'Импортируйте только фразу восстановления, которой вы управляете. Импортированные аккаунты могут независимо отправлять и получать сообщения.',
    'Account Name (Optional)': 'Название аккаунта (необязательно)',
    'Work, Friends, Personal...': 'Работа, друзья, личное...',
    'Importing...': 'Импорт...',
    'Import and Use Account': 'Импортировать и использовать аккаунт',
    'Account ready': 'Аккаунт готов',
    'Connection problem': 'Проблема с подключением',
    'Connecting securely...': 'Безопасное подключение...',
    'Root account': 'Корневой аккаунт',
    'EXO Account {{number}}': 'Аккаунт EXO {{number}}',
    'Chat identity did not finish switching. Try reconnecting.':
      'Переключение личности чата не завершилось. Попробуйте переподключиться.',
    'Chat identity is not ready for this EXO account.':
      'Личность чата для этого аккаунта EXO ещё не готова.',
    'Could not verify the server session for this EXO account.':
      'Не удалось проверить сеанс на сервере для этого аккаунта EXO.',
    'Publishing chat bundle...': 'Публикация пакета чата...',
    'Could not publish chat bundle.': 'Не удалось опубликовать пакет чата.',
    'Chat bundle is still missing from the server.': 'Пакет чата всё ещё отсутствует на сервере.',
    'Could not link this chat identity to the server.':
      'Не удалось привязать эту личность чата к серверу.',
    'Could not prepare this EXO account.': 'Не удалось подготовить этот аккаунт EXO.',
    'Could not switch back to the root EXO account.':
      'Не удалось переключиться обратно на корневой аккаунт EXO.',
    'Close': 'Закрыть',
    'Refresh': 'Обновить',
    'At least 16 characters': 'Не менее 16 символов',
    'Contacts: {{contacts}}': 'Контакты: {{contacts}}',
    'Contact Archive': 'Архив контактов',
    'Encrypted contact archive': 'Зашифрованный архив контактов',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Экспортируйте зашифрованный файл, которым вы управляете, а затем импортируйте его позже, чтобы сохранить контакты.',
    'Archive Passphrase Required': 'Требуется парольная фраза архива',
    'Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.':
      'Используйте уникальную парольную фразу не короче 16 символов, содержащую буквы, цифры и символы. Spectra не сможет её восстановить.',
    'Save encrypted contact archive': 'Сохранить зашифрованный архив контактов',
    'Archive Exported': 'Архив экспортирован',
    'Export Failed': 'Не удалось экспортировать',
    'Import Complete': 'Импорт завершён',
    'Import Failed': 'Не удалось импортировать',
    'Import contact archive?': 'Импортировать архив контактов?',
    'Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.':
      'Импортированные контакты объединяются с контактами, уже сохранёнными на этом устройстве. Чаты, сообщения, сеансы, ключи групп и медиафайлы никогда не импортируются.',
    'Contact archives are unavailable while Spectre Mode is active.':
      'Архивы контактов недоступны, пока активен режим Spectre.',
    'No active wallet is available.': 'Нет доступного активного кошелька.',
    'Unlock your vault before managing a contact archive.':
      'Разблокируйте хранилище, прежде чем управлять архивом контактов.',
    'Contact archives are unavailable for Spectre accounts.':
      'Архивы контактов недоступны для аккаунтов Spectre.',
    'Archives unavailable': 'Архивы недоступны',
    'The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.':
      'Архив шифруется на этом устройстве перед отправкой. Он никогда не загружается в Spectra. Храните файл и парольную фразу отдельно: Spectra не сможет восстановить ни то, ни другое.',
    'Archive Passphrase': 'Парольная фраза архива',
    'Export file': 'Экспортировать файл',
    'Import file': 'Импортировать файл',
    'Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.':
      'Включаются только сохранённые контакты и их метки. Существующие контакты сохраняются, а восстановленные становятся доступными сразу после импорта.',
    'BIP39 word suggestions': 'Подсказки слов BIP39',
    'Next': 'Далее',
    'Paste recovery phrase': 'Вставить фразу восстановления',
    'Previous': 'Назад',
    'Recovery word {{number}}': 'Слово для восстановления {{number}}',
    'Use {{word}} for recovery word {{number}}':
      'Использовать {{word}} в качестве слова для восстановления {{number}}',
    '{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}':
      'Загружено мостов {{transport}}: {{bridgeCount}}. {{routeMessage}}',
    '{{error}} This request used the normal network while Tor was disabled.':
      '{{error}} Этот запрос использовал обычную сеть, пока Tor был отключён.',
    'Applying bridge configuration…': 'Применение конфигурации мостов…',
    'Applying direct Tor…': 'Применение прямого подключения Tor…',
    'Bridge Update Failed': 'Не удалось обновить мосты',
    'Fetched over the normal network while Tor was disabled.':
      'Получено через обычную сеть, пока Tor был отключён.',
    'Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}':
      'Ни запрошенная конфигурация, ни предыдущие мосты не смогли подключиться. Tor остаётся включённым, а трафик к серверной части заблокирован. {{error}}',
    'Previous Bridges Restored': 'Предыдущие мосты восстановлены',
    'This fetch used the normal network while Tor was disabled.':
      'При выполнении этого запроса использовалась обычная сеть, пока Tor был отключён.',
    'Tor Connection Failed': 'Не удалось подключиться к Tor',
    'Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}':
      'Tor не смог подключиться с запрошенной конфигурацией, поэтому были восстановлены предыдущие рабочие мосты. {{error}}',
    'Tor is disabled, so bridge requests will use the normal network.':
      'Tor отключён, поэтому запросы мостов будут использовать обычную сеть.',
    'Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.':
      'Tor включён, но не подключён. Отключите Tor, прежде чем получать загрузочные мосты через обычную сеть.',
    'Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.':
      'Tor всё ещё подключается. Запросы мостов останутся заблокированными, пока не станет доступна цепочка Tor.',
    '{{count}} groups in common': '{{count}} общих групп',
    '{{network}} address': 'Адрес {{network}}',
    'Add ETH before sending this token.': 'Добавьте ETH перед отправкой этого токена.',
    'Available': 'Доступно',
    'Back': 'Назад',
    'Block': 'Заблокировать',
    'Block {{displayName}}? You will no longer receive messages from them.':
      'Заблокировать {{displayName}}? Вы больше не будете получать от него сообщения.',
    'Buy': 'Купить',
    'Calculated by network': 'Рассчитывается сетью',
    'Cancel Spectre Mode': 'Отменить режим Spectre',
    'Canceling Spectre Mode...': 'Отмена режима Spectre...',
    'Calls are only supported in direct chats.': 'Звонки поддерживаются только в личных чатах.',
    'Calls unavailable': 'Звонки недоступны',
    'Chat unavailable': 'Чат недоступен',
    'Chats': 'Чаты',
    'Choose how long messages remain visible after they are read.':
      'Выберите, как долго сообщения будут видны после прочтения.',
    'Claim Refund': 'Получить возврат',
    'Clear chat': 'Очистить чат',
    'Close media preview': 'Закрыть предпросмотр медиа',
    'Close poll failed': 'Не удалось закрыть опрос',
    'Confirm & Send': 'Подтвердить и отправить',
    'Confirm Payment': 'Подтвердить платёж',
    'Confirm Transaction': 'Подтвердить транзакцию',
    'Connecting...': 'Подключение...',
    'Connection failed': 'Не удалось подключиться',
    'Copy TX': 'Копировать TX',
    'Could not open this chat': 'Не удалось открыть этот чат',
    'Could not open this chat.': 'Не удалось открыть этот чат.',
    'Creator': 'Создатель',
    'Disappearing messages': 'Исчезающие сообщения',
    'Edit': 'Изменить',
    'Enter a valid amount': 'Введите корректную сумму',
    'Enter a valid EXO price greater than zero.': 'Введите корректную цену EXO больше нуля.',
    'ERC-20 on Ethereum Mainnet': 'ERC-20 в основной сети Ethereum',
    'ERC-20 Tokens': 'Токены ERC-20',
    'Est. gas: {{amount}} {{symbol}}': 'Расчётная комиссия за газ: {{amount}} {{symbol}}',
    'Estimated fee': 'Расчётная комиссия',
    'EXO account creation is disabled while Spectre Mode is active.':
      'Создание аккаунтов EXO отключено, пока активен режим Spectre.',
    'Failed to claim refund': 'Не удалось получить возврат',
    'Failed to complete the paid join flow': 'Не удалось завершить платное присоединение',
    'Failed to create poll': 'Не удалось создать опрос',
    'Failed to create poll message': 'Не удалось создать сообщение с опросом',
    'Failed to create request': 'Не удалось создать запрос',
    'Failed to Load': 'Не удалось загрузить',
    'Failed to load market': 'Не удалось загрузить рынок',
    'Failed to save membership access settings':
      'Не удалось сохранить настройки доступа к участию',
    'Failed to switch EXO account': 'Не удалось переключить аккаунт EXO',
    'Failed to verify the payment confirmation.':
      'Не удалось проверить подтверждение платежа.',
    'Hide {{displayName}} from your Contacts tab on this device? Chats and encryption keys will stay intact.':
      'Скрыть {{displayName}} на вкладке «Контакты» на этом устройстве? Чаты и ключи шифрования останутся без изменений.',
    'Incorrect PIN': 'Неверный PIN',
    'Invalid {{network}} address': 'Неверный адрес {{network}}',
    'Invalid amount': 'Неверная сумма',
    'Invalid market ID': 'Неверный ID рынка',
    'Invalid recipient address': 'Неверный адрес получателя',
    'Loading pool data...': 'Загрузка данных пула...',
    'Loading voice note...': 'Загрузка голосового сообщения...',
    'Max': 'Макс.',
    'Media, links and docs': 'Медиа, ссылки и документы',
    'Muted': 'Без звука',
    'My {{network}} Address': 'Мой адрес {{network}}',
    'Network': 'Сеть',
    'Network Fee': 'Комиссия сети',
    'Network State': 'Состояние сети',
    'Network: Mozaga native EXO': 'Сеть: нативный EXO Mozaga',
    'No documents shared yet': 'Документами ещё не делились',
    'No address for this network': 'Нет адреса для этой сети',
    'No links shared yet': 'Ссылками ещё не делились',
    'No tokens found': 'Токены не найдены',
    'Notifications': 'Уведомления',
    'On': 'Вкл.',
    'Opening...': 'Открытие...',
    'Paid access setup incomplete': 'Настройка платного доступа не завершена',
    'Paid in {{symbol}}': 'Оплачено в {{symbol}}',
    'Paid by {{payerName}}': 'Оплатил(а) {{payerName}}',
    'Pay request': 'Оплатить запрос',
    'Pay {{amount}}': 'Оплатить {{amount}}',
    'Payment already submitted': 'Платёж уже отправлен',
    'Payment failed': 'Платёж не выполнен',
    'Payment message received': 'Получено сообщение о платеже',
    'Payment Pending': 'Платёж ожидает обработки',
    'Payment paid': 'Платёж оплачен',
    'Payment recorded': 'Платёж зарегистрирован',
    'Payment request: {{amount}} {{symbol}}': 'Запрос на оплату: {{amount}} {{symbol}}',
    'Payment Required': 'Требуется оплата',
    'Payment submitted': 'Платёж отправлен',
    'Payment submitted: {{amount}} {{symbol}}': 'Платёж отправлен: {{amount}} {{symbol}}',
    'Platform fee: {{fee}}': 'Комиссия платформы: {{fee}}',
    'Please allow access to your photo library to change the group photo.':
      'Разрешите доступ к медиатеке, чтобы изменить фото группы.',
    'Preparing voice note...': 'Подготовка голосового сообщения...',
    'Post request': 'Опубликовать запрос',
    'Recipient {{network}} Address': 'Адрес получателя {{network}}',
    'Recipient': 'Получатель',
    'Receive Crypto': 'Получить криптовалюту',
    'Receive address': 'Адрес для получения',
    'Reconnecting...': 'Переподключение...',
    'Request a payment in this chat': 'Запросить платёж в этом чате',
    'Requested asset is not available in this wallet':
      'Запрошенный актив недоступен в этом кошельке.',
    'Review Send': 'Проверить отправку',
    'Search contacts...': 'Поиск контактов...',
    'Securing chat...': 'Защита чата...',
    'Preparing secure channel...': 'Защита чата...',
    'Select Blockchain': 'Выберите блокчейн',
    'Sell': 'Продать',
    'Send {{symbol}}': 'Отправить {{symbol}}',
    'Send {{symbol}} to my {{network}} address:\n{{address}}':
      'Отправьте {{symbol}} на мой адрес {{network}}:\n{{address}}',
    'Sending as {{account}}': 'Отправка от имени {{account}}',
    'Sending transaction...': 'Отправка транзакции...',
    'Share {{network}} Address': 'Поделиться адресом {{network}}',
    'Share contact': 'Поделиться контактом',
    'Show {{displayName}} in your Contacts tab again?':
      'Снова показать {{displayName}} на вкладке «Контакты»?',
    'Solana private key is not available': 'Закрытый ключ Solana недоступен',
    'Solana wallet not available': 'Кошелёк Solana недоступен',
    'Something went wrong. Please try again.': 'Что-то пошло не так. Попробуйте ещё раз.',
    'SPL Tokens': 'Токены SPL',
    'SPL tokens on Solana': 'Токены SPL в сети Solana',
    'Tap to load voice note': 'Нажмите, чтобы загрузить голосовое сообщение',
    'Tap to view shared links and documents':
      'Нажмите, чтобы посмотреть общие ссылки и документы',
    'The payment transaction failed on-chain.': 'Платёжная транзакция не выполнена в блокчейне.',
    'This file is not available on this device yet.':
      'Этот файл пока недоступен на этом устройстве.',
    'This message was deleted': 'Это сообщение удалено',
    'This request has already been marked as paid.':
      'Этот запрос уже отмечен как оплаченный.',
    'This voice note could not be loaded right now.':
      'Сейчас не удалось загрузить это голосовое сообщение.',
    'This wallet does not have an account for {{network}}.':
      'В этом кошельке нет аккаунта для сети {{network}}.',
    'To': 'Кому',
    'Tor Bridges': 'Мосты Tor',
    'Transaction failed on-chain': 'Транзакция не выполнена в блокчейне',
    'TRC-20 on Tron': 'TRC-20 в сети Tron',
    'TRC-20 Tokens': 'Токены TRC-20',
    'Tron private key is not available': 'Закрытый ключ Tron недоступен',
    'Tron wallet not available': 'Кошелёк Tron недоступен',
    'Try Again': 'Попробовать снова',
    'Unable to load voice note': 'Не удалось загрузить голосовое сообщение',
    'Unable to open link': 'Не удалось открыть ссылку',
    'Unable to remove recipient': 'Не удалось удалить получателя',
    'Unblock': 'Разблокировать',
    'Unblock {{displayName}}? They will be able to send you messages again.':
      'Разблокировать {{displayName}}? Он снова сможет отправлять вам сообщения.',
    'Unlock the wallet that will pay for this membership and try again.':
      'Разблокируйте кошелёк, который оплатит это участие, и попробуйте снова.',
    'Unsupported {{type}} attachment': 'Вложение типа {{type}} не поддерживается',
    'Unsupported attachment': 'Неподдерживаемое вложение',
    'Use Biometric': 'Использовать биометрию',
    'Use the original offline backup you created during onboarding if you need the phrase again. If it is lost, create a newly backed up wallet and migrate to it. The device cannot reveal the old phrase.':
      'Если фраза понадобится снова, используйте исходную офлайн-резервную копию, созданную при настройке. Если она утрачена, создайте новый кошелёк с резервной копией и перенесите в него средства. Устройство не может показать старую фразу.',
    'V1 supports Mozaga native EXO only. The company fee is {{fee}}.':
      'V1 поддерживает только нативный EXO сети Mozaga. Комиссия компании: {{fee}}.',
    'via {{account}}': 'через {{account}}',
    'Voice note unavailable': 'Голосовое сообщение недоступно',
    'Volume': 'Громкость',
    'Wallets': 'Кошельки',
    'You requested': 'Вы запросили',
    "You'll enter the {{network}} address in the next step":
      'На следующем шаге вы введёте адрес {{network}}',
    'Your payment was submitted but is still waiting for confirmation. Reopen this invite in a moment to finish joining.':
      'Ваш платёж отправлен, но всё ещё ожидает подтверждения. Через некоторое время снова откройте это приглашение, чтобы завершить присоединение.',
    '{{senderName}} requested': '{{senderName}} запросил(а)',
    'Diffusion channels require Spectre access.':
      'Для каналов распространения требуется доступ Spectre.',
    'Upgrade to Spectre to create one diffusion channel.':
      'Перейдите на Spectre, чтобы создать один канал распространения.',
    'Please wait until this chat is ready.': 'Подождите, пока этот чат будет готов.',
    'Please retry the chat setup first.': 'Сначала повторите настройку чата.',
    'Edit and resend': 'Изменить и отправить повторно',
    'Could not update notifications': 'Не удалось обновить уведомления',
    'Public name in notifications': 'Публичное имя в уведомлениях',
    "Hide this contact's public name in your push notifications.":
      'Скрыть публичное имя этого контакта в push-уведомлениях.',
    'Hidden': 'Скрыто',
    'Allowed': 'Разрешено',
    'Send ETH': 'Отправить ETH',
    'Could not add members': 'Не удалось добавить участников',
    'Add {{count}}': 'Добавить {{count}}',
    'Media': 'Медиа',
    'Add user': 'Добавить пользователя',
    '{{count}} slots available': 'Доступно мест: {{count}}',
    'Group members': 'Участники группы',
    'Created': 'Создано',
    'Could not save your public name. Please try again.':
      'Не удалось сохранить публичное имя. Попробуйте ещё раз.',
    'Text or link': 'Текст или ссылка',
    ' +{{count}} more': ' +ещё {{count}}',
    'Shared content is missing. Please share it again.':
      'Общий контент отсутствует. Поделитесь им снова.',
    'Unable to send': 'Не удалось отправить',
    'Share to Spectra': 'Поделиться в Spectra',
    'Private handoff': 'Приватная передача',
    'Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.':
      'Получатели отображаются только в Spectra. iOS видит только приложение Spectra как место назначения.',
    'Loading shared content...': 'Загрузка общего контента...',
    'Could not import shared content': 'Не удалось импортировать общий контент',
    '{{count}} attachment_one': '{{count}} вложение',
    '{{count}} attachment_few': '{{count}} вложения',
    '{{count}} attachment_many': '{{count}} вложений',
    '{{count}} attachment_other': '{{count}} вложения',
    'No Spectra chats are available for sharing yet.':
      'Пока нет доступных чатов Spectra, с которыми можно поделиться.',
    'Connecting encrypted chat...': 'Подключение зашифрованного чата...',
    'Recovering secure call...': 'Восстановление защищённого звонка...',
    'Establishing secure call...': 'Установка защищённого звонка...',
    'Secure call waiting': 'Ожидание защищённого звонка',
    'Minimize call': 'Свернуть звонок',
    'Edit image': 'Редактировать изображение',
    'Toggle media controls': 'Переключить элементы управления медиа',
    '+ gas in': '+ газ в',
    'Payment': 'Платёж',
    'Tap to review and pay': 'Нажмите, чтобы проверить и оплатить',
    'Unable to edit image': 'Не удалось отредактировать изображение',
    'This image could not be edited right now.':
      'Сейчас не удалось отредактировать это изображение.',
    'Message unavailable': 'Сообщение недоступно',
    'Could not update this image. Please try again.':
      'Не удалось обновить это изображение. Попробуйте ещё раз.',
    'Could not save the edited image. Please try again.':
      'Не удалось сохранить отредактированное изображение. Попробуйте ещё раз.',
    'Add text': 'Добавить текст',
    'Drag text on the image to reposition it.':
      'Перетащите текст по изображению, чтобы изменить его положение.',
    'Drag the crop frame or its corners, then apply.':
      'Перетащите рамку кадрирования или её углы, затем примените изменения.',
    'Apply crop': 'Применить кадрирование',
    'Color': 'Цвет',
    'Select drawing color': 'Выберите цвет рисования',
    'Stroke': 'Толщина линии',
    'Crop': 'Кадрировать',
    'Rotate': 'Повернуть',
    'Draw': 'Рисовать',
    'Text': 'Текст',
    'Undo': 'Отменить',
    'Reset': 'Сбросить',
    'Use original': 'Использовать оригинал',
    'Retry failed': 'Не удалось повторить',
    'Unable to retry': 'Не удалось повторить',
    'This secure chat is not ready yet. Please try again in a moment.':
      'Этот защищённый чат ещё не готов. Попробуйте снова через некоторое время.',
    'Load this image before editing it.':
      'Загрузите это изображение перед редактированием.',
    'Spectre access includes one diffusion channel.':
      'Доступ Spectre включает один канал распространения.',
    'Spectra logo': 'Логотип Spectra',
    '{{width}} px': '{{width}} пикс.',
    'External links unavailable': 'Внешние ссылки недоступны',
    'External links are unavailable while Spectre Mode is active.':
      'Внешние ссылки недоступны, пока активен режим Spectre.',
    'New encrypted message': 'Новое зашифрованное сообщение',
    'New message': 'Новое сообщение',
    'New group message': 'Новое сообщение в группе',
    'Default': 'По умолчанию',
    'Messages': 'Сообщения',
    'Calls': 'Звонки',
    'Transfers': 'Переводы',
    'New message notifications': 'Уведомления о новых сообщениях',
    'Secure call notifications': 'Уведомления о защищённых звонках',
    'Wallet transfer notifications': 'Уведомления о переводах кошелька',
    'Secure call': 'Защищённый звонок',
    'A newer version of Spectra is available. Update to get the latest features and fixes.':
      'Доступна более новая версия Spectra. Обновите приложение, чтобы получить новейшие функции и исправления.',
    'This version of Spectra is no longer supported. Update to continue using secure services.':
      'Эта версия Spectra больше не поддерживается. Обновите приложение, чтобы продолжить пользоваться защищёнными сервисами.',
    'Update available': 'Доступно обновление',
    'Update required': 'Требуется обновление',
    'Update Spectra': 'Обновить Spectra',
  },
  auth: {
    'Account import progress': 'Ход импорта аккаунта',
    'Deriving wallets...': 'Создание кошельков...',
    'Finishing previous account deletion...': 'Завершение предыдущего удаления аккаунта...',
    'Importing Account': 'Импорт аккаунта',
    'Public name contains unsupported characters':
      'Публичное имя содержит неподдерживаемые символы',
    'Public name is too large': 'Публичное имя слишком длинное',
    'Public name must be {{max}} characters or fewer':
      'Публичное имя должно содержать не более {{max}} символов',
    'Unable to use this public name': 'Не удаётся использовать это публичное имя',
    'Authenticate to upgrade biometric unlock':
      'Пройдите аутентификацию, чтобы обновить биометрическую разблокировку',
    'Choose a Public Name': 'Выберите публичное имя',
    'Go back': 'Назад',
    'Important': 'Важно',
    'Optional public name for chats': 'Необязательное публичное имя для чатов',
    'Public Name': 'Публичное имя',
    'Public name contains invalid text.': 'Публичное имя содержит недопустимый текст.',
    'Public name contains unsupported control characters.':
      'Публичное имя содержит неподдерживаемые управляющие символы.',
    'Public name contains unsupported direction controls.':
      'Публичное имя содержит неподдерживаемые символы управления направлением текста.',
    'Public name is too large when encoded.':
      'Публичное имя слишком длинное после кодирования.',
    'Public name must be 80 characters or fewer.':
      'Публичное имя должно содержать не более 80 символов.',
    'This optional name helps people recognize you in chats and contacts. You can change or remove it later.':
      'Это необязательное имя помогает людям узнавать вас в чатах и контактах. Его можно изменить или удалить позже.',
    'Your public name is shared as chat-directory metadata. It is not included in your recovery phrase and does not affect account security.':
      'Ваше публичное имя передаётся как метаданные каталога чатов. Оно не входит в фразу восстановления и не влияет на безопасность аккаунта.',
    '{{count}} characters maximum.': 'Не более {{count}} символов.',
    'Unlock Spectra to connect your secure call':
      'Разблокируйте Spectra, чтобы подключить защищённый звонок',
    'PIN input': 'Ввод PIN-кода',
    'Mnemonic must be 12 or 24 words':
      'Мнемоническая фраза должна содержать 12 или 24 слова',
    'Invalid word: "{{word}}"': 'Недопустимое слово: "{{word}}"',
    'Invalid mnemonic checksum': 'Неверная контрольная сумма мнемонической фразы',
  },
  chat: {
    'Start Secret Chat': 'Начать секретный чат',
    'Choose a contact or start with an address':
      'Выберите контакт или начните с адреса',
    'Starting from {{account}}': 'Начать от имени {{account}}',
    'Add by address': 'Добавить по адресу',
    'Add a contact and open a private chat':
      'Добавьте контакт и откройте личный чат',
    'Start Chat': 'Начать чат',
    'Scan, add, and start a private chat':
      'Отсканируйте, добавьте и начните личный чат',
    'Select from contacts': 'Выбрать из контактов',
    'No saved contacts yet': 'Сохранённых контактов пока нет',
    'Add someone by address or scan their QR code to start.':
      'Чтобы начать, добавьте человека по адресу или отсканируйте его QR-код.',
    'Starting chat...': 'Запуск чата...',
    'Unable to start chat': 'Не удалось начать чат',
    '{{count}} messages': '{{count}} сообщений',
    '{{name}} took a screenshot': '{{name}} сделал(а) снимок экрана',
    'Add attachment': 'Добавить вложение',
    'Cancel reply': 'Отменить ответ',
    'Load more': 'Загрузить ещё',
    'Record voice note': 'Записать голосовое сообщение',
    'Remove attachment': 'Удалить вложение',
    'Send message': 'Отправить сообщение',
    'Toggle one-time message': 'Переключить одноразовое сообщение',
    'Updated {{time}}': 'Обновлено {{time}}',
    'You took a screenshot': 'Вы сделали снимок экрана',
    'Edit image': 'Редактировать изображение',
    'Choose a contact or use a secure invitation':
      'Выберите контакт или используйте защищённое приглашение',
    'Add by invitation': 'Добавить по приглашению',
    'Paste a secure invitation or scan its QR code':
      'Вставьте защищённое приглашение или отсканируйте его QR-код',
    'Paste a secure invitation or scan its QR code to start.':
      'Чтобы начать, вставьте защищённое приглашение или отсканируйте его QR-код.',
    'Nearby': 'Рядом',
    'Cancel voice note': 'Отменить голосовое сообщение',
    'Send voice note': 'Отправить голосовое сообщение',
    'Play voice note': 'Воспроизвести голосовое сообщение',
    'Pause voice note': 'Приостановить голосовое сообщение',
    'Text overlay': 'Текстовая надпись',
    'Crop frame': 'Рамка кадрирования',
    'Crop top-left handle': 'Верхний левый маркер кадрирования',
    'Crop top-right handle': 'Верхний правый маркер кадрирования',
    'Crop bottom-left handle': 'Нижний левый маркер кадрирования',
    'Crop bottom-right handle': 'Нижний правый маркер кадрирования',
    '#Tag': '#Тег',
    'Sending attachment': 'Отправка вложения',
    'Preparing message': 'Подготовка сообщения',
    'Sending message': 'Отправка сообщения',
    'Caching locally': 'Сохранение локально',
    'Complete': 'Готово',
    'Encrypting and uploading {{completed}}/{{total}}':
      'Шифрование и загрузка {{completed}}/{{total}}',
    'Sending nearby': 'Отправка поблизости',
    'Queued nearby': 'В очереди для отправки поблизости',
    'Nearby delivery expired': 'Срок доставки поблизости истёк',
    'Nearby retry limit reached': 'Достигнут лимит повторных попыток доставки поблизости',
    'Nearby queue full': 'Очередь доставки поблизости заполнена',
    'Nearby delivery interrupted': 'Доставка поблизости прервана',
    'Nearby receipt timed out': 'Истекло время ожидания подтверждения доставки поблизости',
    'Nearby transmission failed': 'Не удалось передать сообщение поблизости',
    'Nearby delivery failed': 'Не удалось доставить сообщение поблизости',
  },
  contacts: {
    'EXO Account': 'Аккаунт EXO',
    'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.':
      'Введите постквантовый адрес человека, которого хотите добавить. Этот человек должен был поделиться с вами своим адресом.',
    'Adding to': 'Добавление в',
    'This contact will be saved under this EXO account on this device.':
      'Этот контакт будет сохранён в этом аккаунте EXO на данном устройстве.',
    'Selected': 'Выбрано',
    'Switching...': 'Переключение...',
    'via {{account}}': 'через {{account}}',
    'Please wait until the EXO account switch finishes.':
      'Подождите, пока завершится переключение аккаунта EXO.',
    'Paste a valid secure contact invitation.':
      'Вставьте действительное защищённое приглашение контакта.',
    'Paste a secure contact invitation or scan a contact QR code':
      'Вставьте защищённое приглашение контакта или отсканируйте QR-код контакта',
    'Invalid secure contact invitation':
      'Недействительное защищённое приглашение контакта',
    'Add by secure contact invitation':
      'Добавить по защищённому приглашению контакта',
    'Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.':
      'Отсканируйте QR-код контакта или вставьте защищённое приглашение, которым поделился человек, которого вы хотите добавить.',
    'Secure Contact Invitation': 'Защищённое приглашение контакта',
    'Secure invitation ready': 'Защищённое приглашение готово',
    'Invalid contact invitation': 'Недействительное приглашение контакта',
    'Scan a secure Spectra contact QR code shared by the person you want to add.':
      'Отсканируйте защищённый QR-код контакта Spectra, которым поделился человек, которого вы хотите добавить.',
    'Paste a secure contact invitation or scan its QR code.':
      'Вставьте защищённое приглашение контакта или отсканируйте его QR-код.',
  },
  crypto: {
    '~{{fee}} {{symbol}}': '~{{fee}} {{symbol}}',
    '{{symbol}} logo': 'Логотип {{symbol}}',
    'USDT logo': 'Логотип USDT',
  },
  markets: {
    'Trending Markets': 'Популярные рынки',
    'Live Campaigns': 'Активные кампании',
    'Hot Predictions': 'Горячие прогнозы',
    'See all': 'Показать все',
    'Vol': 'Объём',
    'of': 'из',
    '{{count}}m left': 'Осталось {{count}} мин',
    '{{count}}h left': 'Осталось {{count}} ч',
    '{{count}}d left': 'Осталось {{count}} дн.',
    'No description': 'Нет описания',
    'No order activity yet': 'По ордеру пока нет активности',
    'Untitled campaign': 'Кампания без названия',
    '{{count}} backers': '{{count}} спонсоров',
    'Amount exceeds remaining allowance':
      'Сумма превышает оставшийся допустимый лимит',
    'Cannot contribute': 'Не удаётся внести вклад',
    'Connect wallet to create a campaign':
      'Подключите кошелёк, чтобы создать кампанию',
    'Connect wallet to create an escrow order':
      'Подключите кошелёк, чтобы создать эскроу-ордер',
    'Connect wallet to view your campaigns':
      'Подключите кошелёк, чтобы просмотреть свои кампании',
    'Connect wallet to view your escrow orders':
      'Подключите кошелёк, чтобы просмотреть свои эскроу-ордера',
    'Describe the condition for release...':
      'Опишите условие для высвобождения средств...',
    'Enter a valid market ID': 'Введите корректный ID рынка',
    'Enter a valid sale ID': 'Введите корректный ID продажи',
    'Fiat price must be greater than zero':
      'Цена в фиатной валюте должна быть больше нуля',
    'Filled': 'Исполнено',
    'Invalid campaign ID': 'Неверный ID кампании',
    'Invalid order ID': 'Неверный ID ордера',
    'Invalid sale ID': 'Неверный ID продажи',
    'No escrow orders found': 'Эскроу-ордеров не найдено',
    'Partially Filled': 'Исполнено частично',
    'Yes': 'Да',
    'You are not eligible to contribute':
      'Вы не можете внести вклад',
  },
  profile: {
    'Show VDF progress': 'Показывать ход VDF',
    'Proofs still run in the background when this is off.':
      'Доказательства продолжают выполняться в фоне, когда это выключено.',
    'Public name contains unsupported characters':
      'Публичное имя содержит неподдерживаемые символы',
    'Public name is too large': 'Публичное имя слишком длинное',
    'Public name must be {{max}} characters or fewer':
      'Публичное имя должно содержать не более {{max}} символов',
    'Unable to use this public name': 'Не удаётся использовать это публичное имя',
    'Change Photo': 'Изменить фото',
    'Chat bundle not on server — others cannot find you':
      'Пакет чата отсутствует на сервере — другие не могут вас найти',
    'Chat bundle registered on server': 'Пакет чата зарегистрирован на сервере',
    'Chat identity not available. Please restart the app.':
      'Личность чата недоступна. Перезапустите приложение.',
    'Checking chat bundle...': 'Проверка пакета чата...',
    'Checking identity link...': 'Проверка привязки личности...',
    'Could not link identity. Please try again.':
      'Не удалось привязать личность. Попробуйте ещё раз.',
    'Could not refresh session. Check your connection.':
      'Не удалось обновить сеанс. Проверьте подключение.',
    'Edit Profile': 'Редактировать профиль',
    'Identity linked to server': 'Личность привязана к серверу',
    'Identity not linked — messaging is disabled':
      'Личность не привязана — обмен сообщениями отключён',
    'Member since {{date}}': 'Участник с {{date}}',
    'Security Status': 'Состояние безопасности',
    'Server session active': 'Сеанс на сервере активен',
    'Server session expired — features may not work':
      'Сеанс на сервере истёк — некоторые функции могут не работать',
    'This name is visible to your contacts':
      'Это имя видно вашим контактам',
    'Unknown error': 'Неизвестная ошибка',
    'Profile photos cannot be changed while Spectre Mode is active.':
      'Фотографии профиля нельзя изменить, пока активен режим Spectre.',
    'Photo disabled in Spectre Mode': 'Фото отключено в режиме Spectre',
    'Account Label': 'Метка аккаунта',
    'Name this account': 'Назовите этот аккаунт',
    'This is a local label to help you identify this account. It is not your public chat name.':
      'Это локальная метка, которая поможет вам отличать этот аккаунт. Это не ваше публичное имя в чате.',
    'Public profile names cannot be edited while Spectre Mode is active.':
      'Публичные имена профиля нельзя редактировать, пока активен режим Spectre.',
    'Public Name': 'Публичное имя',
    'Public name contains invalid text.':
      'Публичное имя содержит недопустимый текст.',
    'Public name contains unsupported control characters.':
      'Публичное имя содержит неподдерживаемые управляющие символы.',
    'Public name contains unsupported direction controls.':
      'Публичное имя содержит неподдерживаемые символы управления направлением текста.',
    'Public name is too large when encoded.':
      'Публичное имя слишком длинное после кодирования.',
    'Public name must be 80 characters or fewer.':
      'Публичное имя должно содержать не более 80 символов.',
    'Optional public name for chats':
      'Необязательное публичное имя для чатов',
    'Publication needs attention. Retry when you are online.':
      'Публикация требует внимания. Повторите попытку при подключении к сети.',
    'Published': 'Опубликовано',
    'Publishing public name...': 'Публикация публичного имени...',
    'Public profile metadata is read-only while Spectre Mode is active.':
      'Метаданные публичного профиля доступны только для чтения, пока активен режим Spectre.',
    'Retry Publication': 'Повторить публикацию',
    'This repeatable name is public chat-directory metadata. People who have not saved you under another name can see it in chats and contacts. It appears in notifications only when both sides enable that privacy trade-off.':
      'Это повторяемое имя является публичными метаданными каталога чатов. Люди, которые не сохранили вас под другим именем, могут видеть его в чатах и контактах. В уведомлениях оно появляется, только когда обе стороны включили этот компромисс конфиденциальности.',
    'This public name is saved on this device and will publish when your chat identity is linked.':
      'Это публичное имя сохранено на устройстве и будет опубликовано, когда личность чата будет привязана.',
    'Waiting for chat readiness. Automatic retries are scheduled.':
      'Ожидание готовности чата. Запланированы автоматические повторные попытки.',
    'Save Public Name': 'Сохранить публичное имя',
    'Preparing secure contact invitation…':
      'Подготовка защищённого приглашения контакта…',
    'Preparing secure contact card…': 'Подготовка защищённой карточки контакта…',
    'Preparing secure share…': 'Подготовка защищённого доступа…',
    'Create a one-time card to show your QR code.':
      'Создайте одноразовую карточку, чтобы показать QR-код.',
    'Create one-time contact card': 'Создать одноразовую карточку контакта',
    'Publish for 5 minutes': 'Опубликовать на 5 минут',
    'Your account is discoverable for 5 minutes.':
      'Ваш аккаунт доступен для поиска в течение 5 минут.',
    'Your account is already discoverable.': 'Ваш аккаунт уже доступен для поиска.',
    'Your one-time contact card is still active.':
      'Ваша одноразовая карточка контакта ещё активна.',
    'Open one-time contact card': 'Открыть одноразовую карточку контакта',
    'One-time contact card ready': 'Одноразовая карточка контакта готова',
    'Expires in {{minutes}} min': 'Истекает через {{minutes}} мин',
    'One-time contact card': 'Одноразовая карточка контакта',
    'Share this QR code before it expires.':
      'Поделитесь этим QR-кодом до истечения срока.',
    'A one-time contact card expires after one hour and can be used once.':
      'Одноразовая карточка контакта действует один час и может быть использована только один раз.',
    'Chat identity is not ready yet.': 'Идентификатор чата ещё не готов.',
  },
  settings: {
    'Activating secure online access': 'Активация безопасного онлайн-доступа',
    'Publishing secure discovery': 'Публикация безопасной доступности',
    'Keeping you findable': 'Вы остаётесь находимыми',
    'Starting a secure chat': 'Запуск защищённого чата',
    'Creating one-time contact card': 'Создание одноразовой карточки контакта',
    'Computing VDF proof': 'Вычисление доказательства VDF',
    'Solving a sequential proof that helps prevent automated account creation.':
      'Решение последовательного доказательства, которое помогает предотвратить автоматическое создание аккаунтов.',
    'Generating VDF proof': 'Создание доказательства VDF',
    'Preparing the compact proof the server can verify efficiently.':
      'Подготовка компактного доказательства, которое сервер может эффективно проверить.',
    'Waiting for server verification': 'Ожидание проверки сервером',
    'Retrying server verification': 'Повторная попытка проверки сервером',
    'Proof ready. The server enforces a minimum delay before it accepts it.':
      'Доказательство готово. Сервер устанавливает минимальную задержку перед его принятием.',
    'Verifying VDF proof': 'Проверка доказательства VDF',
    'Sending the proof for secure verification.':
      'Отправка доказательства для безопасной проверки.',
    'Secure online access is ready': 'Безопасный онлайн-доступ готов',
    'Your secure online access is active.': 'Ваш безопасный онлайн-доступ активен.',
    'VDF work was cancelled': 'Вычисление VDF отменено',
    'No proof was submitted.': 'Доказательство не было отправлено.',
    'Secure access needs attention': 'Безопасный доступ требует внимания',
    'This proof could not be completed. Check your connection and try again.':
      'Не удалось завершить это доказательство. Проверьте подключение и попробуйте снова.',
    '{{percent}}% complete': '{{percent}}% выполнено',
    'VDFs completed {{completed}}/{{total}}': 'VDF выполнено {{completed}}/{{total}}',
    '{{rate}} VDF iterations/s': '{{rate}} итераций VDF/с',
    'Measuring VDF rate…': 'Измерение скорости VDF…',
    '~{{count}}s remaining': '~{{count}} с осталось',
    'Cancel secure work': 'Отменить безопасное вычисление',
    'Could not start this chat': 'Не удалось начать этот чат',
    'Could not update discovery': 'Не удалось обновить обнаружение',
    'Could not create contact card': 'Не удалось создать карточку контакта',
    'Dismiss': 'Скрыть',
    'Keep Spectra open while the security proof is verified.':
      'Не закрывайте Spectra, пока проверяется доказательство безопасности.',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'Этот аккаунт EXO будет удалён с устройства, а для этой фразы восстановления освободится одно место для прозрачного аккаунта EXO. Существующие сообщения этого аккаунта будут удалены локально. Это действие нельзя отменить.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Переключитесь на корневой аккаунт EXO, чтобы создать или импортировать прозрачные аккаунты EXO.',
    'Failed to disable an expired Spectre session':
      'Не удалось отключить истёкший сеанс Spectre',
    'Disabled by Spectre Mode': 'Отключено режимом Spectre',
    'Contact Archive': 'Архив контактов',
    'Encrypted contact archive': 'Зашифрованный архив контактов',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Экспортируйте зашифрованный файл, которым вы управляете, а затем импортируйте его позже, чтобы сохранить контакты.',
    'Export and import encrypted contacts':
      'Экспортировать и импортировать зашифрованные контакты',
    'Unable to complete Spectre activation':
      'Не удалось завершить активацию Spectre',
    'One anonymous activation token can be requested every 24 hours.':
      'Один анонимный токен активации можно запрашивать каждые 24 часа.',
    'Backend is not configured for Spectre activation':
      'Серверная часть не настроена для активации Spectre',
    'A verified Backend session is required for Spectre activation':
      'Для активации Spectre требуется проверенный сеанс серверной части',
    'Failed to refresh Spectre access': 'Не удалось обновить доступ Spectre',
    'Account deleted': 'Аккаунт удалён',
    'Account deletion completed': 'Удаление аккаунта завершено',
    'Account deletion needs attention': 'Удаление аккаунта требует внимания',
    'A verified backend session is required before deleting this account.':
      'Перед удалением этого аккаунта требуется проверенный сеанс серверной части.',
    'Backend cleanup is paused and will be retried safely. Try checking again.':
      'Очистка серверной части приостановлена и будет безопасно повторена. Попробуйте проверить снова.',
    'Backend cleanup is still running. You can retry this status check safely.':
      'Очистка серверной части всё ещё выполняется. Вы можете безопасно повторить проверку статуса.',
    'Backend cleanup could not be checked. Retry when the private connection is available.':
      'Не удалось проверить очистку серверной части. Повторите попытку, когда станет доступно приватное соединение.',
    'Backend deletion completed, but final device cleanup needs to be retried.':
      'Удаление на сервере завершено, но окончательную очистку устройства нужно повторить.',
    'Backend deletion completed, but local key erasure could not be confirmed.':
      'Удаление на сервере завершено, но не удалось подтвердить удаление локальных ключей.',
    'Cleanup could not be confirmed. You can retry safely.':
      'Не удалось подтвердить очистку. Вы можете безопасно повторить попытку.',
    'Deleting Account': 'Удаление аккаунта',
    'Deleting account records': 'Удаление данных аккаунта',
    'Deleting chat relay data': 'Удаление данных ретрансляции чатов',
    'Deleting encrypted objects': 'Удаление зашифрованных объектов',
    'Deletion needs attention': 'Удаление требует внимания',
    'Erasing local keys and data': 'Удаление локальных ключей и данных',
    'Finalizing secure cleanup': 'Завершение безопасной очистки',
    'Keep Spectra open while each verified cleanup stage completes.':
      'Не закрывайте Spectra, пока не завершится каждый подтверждённый этап очистки.',
    'Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.':
      'Локальные данные удалены, но не удалось подтвердить очистку на сервере. Повторите попытку, когда станет доступно приватное соединение.',
    'Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.':
      'Локальные данные удалены, но серверная часть не приняла запрос на удаление. Повторно импортируйте аккаунт, чтобы повторить попытку.',
    'Local data and the accepted backend cleanup have finished.':
      'Локальные данные удалены, а подтверждённая очистка на сервере завершена.',
    'Preparing secure deletion': 'Подготовка безопасного удаления',
    'Retry account deletion cleanup': 'Повторить очистку после удаления аккаунта',
    'Retry cleanup': 'Повторить очистку',
    'Secure account deletion stopped unexpectedly. Try again when the private connection is available.':
      'Безопасное удаление аккаунта неожиданно остановилось. Попробуйте снова, когда станет доступно приватное соединение.',
    'Secure deletion in progress': 'Выполняется безопасное удаление',
    'Submitting the deletion request': 'Отправка запроса на удаление',
    'This cannot be undone. Local sensitive data is erased before the backend deletion request starts.':
      'Это действие нельзя отменить. Локальные конфиденциальные данные удаляются до отправки запроса на удаление на сервер.',
    'This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.':
      'Сначала будут удалены локальные ключи и данные, затем через текущее приватное соединение будет отправлен запрос на очистку серверной части. Экран выполнения останется видимым до подтверждения очистки.',
    'This screen updates only when a cleanup stage is confirmed.':
      'Этот экран обновляется только после подтверждения этапа очистки.',
    'The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.':
      'Серверная часть больше не распознаёт этот токен очистки. Повторно импортируйте аккаунт, чтобы проверить удаление.',
    'The cleanup status token expired. Re-import the account to verify its status.':
      'Срок действия токена состояния очистки истёк. Повторно импортируйте аккаунт, чтобы проверить его состояние.',
    'There is no pending backend cleanup to retry.':
      'Нет ожидающей очистки серверной части, которую можно повторить.',
    '{{count}}s elapsed': 'Прошло {{count}} с',
    'Applying Spectre protections': 'Применение защит Spectre',
    'Keep this screen open while EXO prepares the secure activation handoff.':
      'Не закрывайте этот экран, пока EXO готовит безопасную передачу для активации.',
    'Preparing Spectre Mode': 'Подготовка режима Spectre',
    'Preparing your Spectre account': 'Подготовка аккаунта Spectre',
    'Registering the private account': 'Регистрация приватного аккаунта',
    'Reserving private activation': 'Резервирование приватной активации',
    'Changes were rolled back': 'Изменения отменены',
    'Checking private access': 'Проверка приватного доступа',
    'Choose a new 6-digit PIN': 'Выберите новый 6-значный PIN',
    'Confirm New PIN': 'Подтвердите новый PIN',
    'Connecting your private route': 'Подключение к приватному маршруту',
    'Enter Current PIN': 'Введите текущий PIN',
    'Enter New PIN': 'Введите новый PIN',
    'Enter your current PIN': 'Введите текущий PIN',
    'Enter your current PIN before creating a duress PIN':
      'Введите текущий PIN перед созданием PIN-кода принуждения',
    'Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.':
      'Ввод PIN-кода принуждения запустит попытку удалить данные аккаунта на сервере, удалить данные с этого устройства и немедленно выйти из аккаунта.',
    'EXO can continue refreshing chats in the background once Spectre is ready.':
      'EXO сможет продолжить обновлять чаты в фоне, когда Spectre будет готов.',
    'EXO has finished switching back from Spectre Mode.':
      'EXO завершил переключение из режима Spectre.',
    'EXO is validating your Spectre account and required protections before the private handoff starts.':
      'EXO проверяет аккаунт Spectre и необходимые меры защиты перед началом приватной передачи.',
    'EXO is verifying the wallet session it uses for private network services.':
      'EXO проверяет сеанс кошелька, используемый для приватных сетевых сервисов.',
    'EXO stopped the Spectre flow and restored the previous safe state where it could.':
      'EXO остановил процесс Spectre и, где возможно, восстановил предыдущее безопасное состояние.',
    'Failed to change PIN': 'Не удалось изменить PIN',
    'Failed to disable Spectre Mode': 'Не удалось отключить режим Spectre',
    'Failed to verify PIN': 'Не удалось проверить PIN',
    'Finalizing Spectre shutdown': 'Завершение отключения Spectre',
    'Finishing the private handoff': 'Завершение приватной передачи',
    'Getting Spectre ready': 'Подготовка Spectre',
    'Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.':
      'Не закрывайте этот экран, пока EXO применяет изменения конфиденциальности, необходимые для режима Spectre.',
    'Keep this screen open while EXO restores your regular wallet and security settings.':
      'Не закрывайте этот экран, пока EXO восстанавливает обычный кошелёк и настройки безопасности.',
    'Loading your Spectre setup': 'Загрузка настройки Spectre',
    'New PIN must be different from current PIN':
      'Новый PIN должен отличаться от текущего',
    'PINs do not match': 'PIN-коды не совпадают',
    'Preparing your private workspace': 'Подготовка приватного пространства',
    'Preparing your Spectre setup': 'Подготовка настройки Spectre',
    'Re-enter your new PIN to confirm':
      'Повторно введите новый PIN для подтверждения',
    'Restoring network and cleanup': 'Восстановление сети и очистка',
    'Restoring privacy protections': 'Восстановление защит конфиденциальности',
    'Restoring your main profile': 'Восстановление основного профиля',
    'Review the failed step below before trying again.':
      'Проверьте неудавшийся этап ниже, прежде чем повторять попытку.',
    'Spectre cannot finish until Tor is connected. Try bridges or a different network.':
      'Spectre не сможет завершить настройку, пока не подключится Tor. Попробуйте мосты или другую сеть.',
    'Spectre chats and contacts are still refreshing in the background.':
      'Чаты и контакты Spectre всё ещё обновляются в фоне.',
    'Spectre needs your attention': 'Spectre требует вашего внимания',
    'Spectre protections are active': 'Защиты Spectre активны',
    'Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.':
      'Spectre отключает звонки и криптодействия; удаляет push-токены; принудительно включает Tor, PIN-код принуждения, очистку при неудаче, защиту от снимков экрана и конфиденциальность переключателя приложений; а для новых сообщений по умолчанию устанавливает короткие таймеры исчезновения.',
    'Switching back to your main wallet': 'Переключение обратно на основной кошелёк',
    'Switching to your Spectre identity': 'Переключение на личность Spectre',
    'This screen updates automatically as each Spectre stage finishes.':
      'Этот экран обновляется автоматически по завершении каждого этапа Spectre.',
    'Tor could not connect': 'Tor не удалось подключиться',
    'Tor must be online before Spectre can switch identities and continue.':
      'Tor должен быть подключён к сети, прежде чем Spectre сможет переключить личности и продолжить.',
    'Tor routing applies only inside Spectra. Device-wide network routing is unchanged.':
      'Маршрутизация через Tor действует только внутри Spectra. Общесистемные сетевые настройки устройства не изменяются.',
    'Verify Primary PIN': 'Подтвердите основной PIN',
    'Verify your identity to change PIN': 'Подтвердите личность, чтобы изменить PIN',
    'Verifying private access': 'Проверка приватного доступа',
    'Your main wallet is restored': 'Основной кошелёк восстановлен',
    'Your PIN has been changed successfully.': 'PIN успешно изменён.',
    'Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.':
      'Кошелёк Spectre и туннель Tor готовы. Чаты и контакты могут завершить обновление в фоне.',
    'Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.':
      'Кошелёк Spectre активен. EXO переключает область хранения и загружает локальные данные для этого приватного профиля.',
    'Erase Account Permanently?': 'Удалить аккаунт навсегда?',
    'This cannot be undone. Backend data and local sensitive data will be erased for this account.':
      'Это действие нельзя отменить. Для этого аккаунта будут удалены данные на сервере и локальные конфиденциальные данные.',
    'Erase Everything': 'Удалить всё',
    'Cloud Session Required': 'Требуется сеанс облачного сервиса',
    'Unlock or reconnect to the backend before deleting the account.':
      'Разблокируйте аккаунт или переподключитесь к серверной части перед его удалением.',
    'Account deletion failed. Try again after checking your connection.':
      'Не удалось удалить аккаунт. Проверьте подключение и попробуйте снова.',
    'Account Deletion Failed': 'Не удалось удалить аккаунт',
    'Confirm Account Deletion': 'Подтвердите удаление аккаунта',
    'Enter your PIN to continue to the final destructive confirmation.':
      'Введите PIN, чтобы перейти к окончательному подтверждению удаления.',
    'Account Deletion': 'Удаление аккаунта',
    '{{count}}s elapsed - this may take 30-240 seconds with bridges':
      'Прошло {{count}} с — с мостами это может занять 30–240 секунд',
  },
  tor: {
    'Connected to Spectre': 'Подключено к Spectre',
  },
} satisfies LocaleTranslationOverrides

export default translations

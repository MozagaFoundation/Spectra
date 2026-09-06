/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LocaleTranslationOverrides } from './translationOverrideTypes'

const translations = {
  common: {
    'Creating your post-quantum identity...': 'Membuat identitas pascakuantum Anda...',
    'Encrypted group sender keys': 'Kunci pengirim grup terenkripsi',
    'End-to-end encrypted': 'Terenkripsi ujung ke ujung',
    'End-to-end encryption available for supported chats':
      'Enkripsi ujung ke ujung tersedia untuk chat yang didukung',
    'Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.':
      'Kunci grup didistribusikan melalui sesi langsung terenkripsi yang ada. Menghapus anggota akan merotasi kunci grup aktif secara otomatis.',
    'Hybrid post-quantum messaging': 'Perpesanan hibrida pascakuantum',
    'ML-DSA-65 post-quantum signatures': 'Tanda tangan pascakuantum ML-DSA-65',
    'Post-quantum': 'Pascakuantum',
    'Post-quantum identity keys ready': 'Kunci identitas pascakuantum siap',
    'Securing your encrypted vault...': 'Mengamankan brankas terenkripsi Anda...',
    'Supported direct messages are end-to-end encrypted.':
      'Pesan langsung yang didukung terenkripsi ujung ke ujung.',
    'Snowflake bootstrap privacy notice': 'Pemberitahuan privasi bootstrap Snowflake',
    'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.':
      'Snowflake menggunakan infrastruktur bootstrap WebRTC, termasuk broker, STUN, dan layanan proksi sukarelawan. Layanan tersebut dapat mengamati alamat IP perangkat dan waktu koneksi Anda. Tor melindungi lalu lintas setelah sirkuit dibuat, tetapi tidak dapat menyembunyikan koneksi bootstrap ini.',
    'I understand': 'Saya mengerti',
    'Switching...': 'Mengalihkan...',
    'Import': 'Impor',
    'Use': 'Gunakan',
    'Erasing...': 'Menghapus...',
    'Could not switch EXO account': 'Tidak dapat mengalihkan akun EXO',
    'Unable to switch EXO account': 'Tidak dapat mengalihkan akun EXO',
    'Switching EXO account...': 'Mengalihkan akun EXO...',
    'Transparent EXO accounts are restored from your recovery phrase.':
      'Akun EXO transparan dipulihkan dari frasa pemulihan Anda.',
    'Failed to generate account': 'Gagal membuat akun',
    'Confirm that you backed up the recovery phrase before using this EXO account.':
      'Pastikan Anda telah mencadangkan frasa pemulihan sebelum menggunakan akun EXO ini.',
    'Failed to save EXO account': 'Gagal menyimpan akun EXO',
    'Regenerate': 'Buat ulang',
    'Create EXO Account': 'Buat Akun EXO',
    'Create a new transparent EXO account for work, friends, or another chat identity.':
      'Buat akun EXO transparan baru untuk pekerjaan, teman, atau identitas chat lainnya.',
    'Root account required': 'Akun root diperlukan',
    'Each recovery phrase restores up to 5 transparent EXO accounts.':
      'Setiap frasa pemulihan memulihkan hingga 5 akun EXO transparan.',
    'Switch to your root EXO account to create transparent EXO accounts.':
      'Beralihlah ke akun EXO root untuk membuat akun EXO transparan.',
    'Generating secure keys...': 'Membuat kunci aman...',
    'New EXO Account': 'Akun EXO Baru',
    'Never share your recovery phrase': 'Jangan pernah membagikan frasa pemulihan Anda',
    'This recovery phrase is shown only now. Store it offline before saving the new EXO account.':
      'Frasa pemulihan ini hanya ditampilkan sekarang. Simpan secara offline sebelum menyimpan akun EXO baru.',
    'Tap to reveal your recovery phrase': 'Ketuk untuk menampilkan frasa pemulihan Anda',
    'Make sure no one is watching your screen': 'Pastikan tidak ada yang melihat layar Anda',
    'I backed up this recovery phrase offline.': 'Saya telah mencadangkan frasa pemulihan ini secara offline.',
    'Save and Use Account': 'Simpan dan Gunakan Akun',
    'Invalid recovery phrase': 'Frasa pemulihan tidak valid',
    'This EXO account already exists on this device.': 'Akun EXO ini sudah ada di perangkat ini.',
    'Failed to import account': 'Gagal mengimpor akun',
    'Import EXO Account': 'Impor Akun EXO',
    'Import a transparent EXO recovery phrase into this unlocked root vault.':
      'Impor frasa pemulihan EXO transparan ke brankas root yang tidak terkunci ini.',
    'You can import up to 5 transparent EXO accounts from one recovery phrase.':
      'Anda dapat mengimpor hingga 5 akun EXO transparan dari satu frasa pemulihan.',
    'Switch to your root EXO account to import transparent EXO accounts.':
      'Beralihlah ke akun EXO root untuk mengimpor akun EXO transparan.',
    'Only import a recovery phrase you control. Imported accounts can send and receive chats independently.':
      'Hanya impor frasa pemulihan yang Anda kendalikan. Akun yang diimpor dapat mengirim dan menerima pesan secara mandiri.',
    'Account Name (Optional)': 'Nama Akun (Opsional)',
    'Work, Friends, Personal...': 'Pekerjaan, Teman, Pribadi...',
    'Importing...': 'Mengimpor...',
    'Import and Use Account': 'Impor dan Gunakan Akun',
    'Account ready': 'Akun siap',
    'Connection problem': 'Masalah koneksi',
    'Connecting securely...': 'Menghubungkan dengan aman...',
    'Root account': 'Akun root',
    'EXO Account {{number}}': 'Akun EXO {{number}}',
    'Chat identity did not finish switching. Try reconnecting.':
      'Identitas chat belum selesai dialihkan. Coba hubungkan kembali.',
    'Chat identity is not ready for this EXO account.':
      'Identitas chat belum siap untuk akun EXO ini.',
    'Could not verify the server session for this EXO account.':
      'Tidak dapat memverifikasi sesi server untuk akun EXO ini.',
    'Publishing chat bundle...': 'Menerbitkan paket chat...',
    'Could not publish chat bundle.': 'Tidak dapat menerbitkan paket chat.',
    'Chat bundle is still missing from the server.': 'Paket chat masih belum ada di server.',
    'Could not link this chat identity to the server.':
      'Tidak dapat menautkan identitas chat ini ke server.',
    'Could not prepare this EXO account.': 'Tidak dapat menyiapkan akun EXO ini.',
    'Could not switch back to the root EXO account.':
      'Tidak dapat beralih kembali ke akun EXO root.',
    'Close': 'Tutup',
    'Refresh': 'Muat ulang',
    'At least 16 characters': 'Minimal 16 karakter',
    'Contacts: {{contacts}}': 'Kontak: {{contacts}}',
    'Contact Archive': 'Arsip Kontak',
    'Encrypted contact archive': 'Arsip kontak terenkripsi',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Ekspor file terenkripsi yang Anda kendalikan, lalu impor nanti untuk mempertahankan kontak tersimpan.',
    'Archive Passphrase Required': 'Frasa sandi arsip diperlukan',
    'Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.':
      'Gunakan frasa sandi unik dengan minimal 16 karakter, termasuk huruf, angka, dan simbol. Spectra tidak dapat memulihkannya.',
    'Save encrypted contact archive': 'Simpan arsip kontak terenkripsi',
    'Archive Exported': 'Arsip diekspor',
    'Export Failed': 'Ekspor gagal',
    'Import Complete': 'Impor selesai',
    'Import Failed': 'Impor gagal',
    'Import contact archive?': 'Impor arsip kontak?',
    'Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.':
      'Kontak yang diimpor digabung dengan kontak yang sudah ada di perangkat ini. Chat, pesan, sesi, kunci grup, dan media tidak pernah diimpor.',
    'Contact archives are unavailable while Spectre Mode is active.':
      'Arsip kontak tidak tersedia saat Mode Spectre aktif.',
    'No active wallet is available.': 'Tidak ada dompet aktif yang tersedia.',
    'Unlock your vault before managing a contact archive.':
      'Buka kunci brankas Anda sebelum mengelola arsip kontak.',
    'Contact archives are unavailable for Spectre accounts.':
      'Arsip kontak tidak tersedia untuk akun Spectre.',
    'Archives unavailable': 'Arsip tidak tersedia',
    'The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.':
      'Arsip dienkripsi di perangkat ini sebelum dibagikan. Arsip tidak pernah diunggah ke Spectra. Simpan file dan frasa sandi secara terpisah; Spectra tidak dapat memulihkan keduanya.',
    'Archive Passphrase': 'Frasa sandi arsip',
    'Export file': 'Ekspor file',
    'Import file': 'Impor file',
    'Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.':
      'Hanya kontak tersimpan dan label kontak yang disertakan. Kontak yang ada tetap dipertahankan, dan kontak yang dipulihkan langsung tersedia setelah impor.',
    'BIP39 word suggestions': 'Saran kata BIP39',
    'Next': 'Berikutnya',
    'Paste recovery phrase': 'Tempel frasa pemulihan',
    'Previous': 'Sebelumnya',
    'Recovery word {{number}}': 'Kata pemulihan {{number}}',
    'Use {{word}} for recovery word {{number}}':
      'Gunakan {{word}} untuk kata pemulihan {{number}}',
    '{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}':
      '{{bridgeCount}} jembatan {{transport}} dimuat. {{routeMessage}}',
    '{{error}} This request used the normal network while Tor was disabled.':
      '{{error}} Permintaan ini menggunakan jaringan normal saat Tor dinonaktifkan.',
    'Applying bridge configuration…': 'Menerapkan konfigurasi jembatan…',
    'Applying direct Tor…': 'Menerapkan Tor langsung…',
    'Bridge Update Failed': 'Pembaruan jembatan gagal',
    'Fetched over the normal network while Tor was disabled.':
      'Diambil melalui jaringan normal saat Tor dinonaktifkan.',
    'Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}':
      'Baik konfigurasi yang diminta maupun jembatan sebelumnya tidak dapat tersambung. Tor tetap aktif dan lalu lintas backend tetap diblokir. {{error}}',
    'Previous Bridges Restored': 'Jembatan sebelumnya dipulihkan',
    'This fetch used the normal network while Tor was disabled.':
      'Pengambilan ini menggunakan jaringan normal saat Tor dinonaktifkan.',
    'Tor Connection Failed': 'Koneksi Tor gagal',
    'Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}':
      'Tor tidak dapat tersambung dengan konfigurasi yang diminta, sehingga jembatan yang sebelumnya berfungsi dipulihkan. {{error}}',
    'Tor is disabled, so bridge requests will use the normal network.':
      'Tor dinonaktifkan, sehingga permintaan jembatan akan menggunakan jaringan normal.',
    'Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.':
      'Tor aktif tetapi belum terhubung. Nonaktifkan Tor sebelum mengambil jembatan bootstrap melalui jaringan normal.',
    'Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.':
      'Tor masih tersambung. Permintaan jembatan tetap diblokir hingga sirkuit Tor tersedia.',
    '{{count}} groups in common': '{{count}} grup yang sama',
    '{{network}} address': 'Alamat {{network}}',
    'Add ETH before sending this token.': 'Tambahkan ETH sebelum mengirim token ini.',
    'Available': 'Tersedia',
    'Back': 'Kembali',
    'Block': 'Blokir',
    'Block {{displayName}}? You will no longer receive messages from them.':
      'Blokir {{displayName}}? Anda tidak akan lagi menerima pesan dari mereka.',
    'Buy': 'Beli',
    'Calculated by network': 'Dihitung oleh jaringan',
    'Cancel Spectre Mode': 'Batalkan Mode Spectre',
    'Canceling Spectre Mode...': 'Membatalkan Mode Spectre...',
    'Calls are only supported in direct chats.': 'Panggilan hanya didukung dalam chat langsung.',
    'Calls unavailable': 'Panggilan tidak tersedia',
    'Chat unavailable': 'Chat tidak tersedia',
    'Chats': 'Chat',
    'Choose how long messages remain visible after they are read.':
      'Pilih berapa lama pesan tetap terlihat setelah dibaca.',
    'Claim Refund': 'Klaim pengembalian dana',
    'Clear chat': 'Hapus chat',
    'Close media preview': 'Tutup pratinjau media',
    'Close poll failed': 'Gagal menutup jajak pendapat',
    'Confirm & Send': 'Konfirmasi & Kirim',
    'Confirm Payment': 'Konfirmasi Pembayaran',
    'Confirm Transaction': 'Konfirmasi Transaksi',
    'Connecting...': 'Menghubungkan...',
    'Connection failed': 'Koneksi gagal',
    'Copy TX': 'Salin TX',
    'Could not open this chat': 'Tidak dapat membuka chat ini',
    'Could not open this chat.': 'Tidak dapat membuka chat ini.',
    'Creator': 'Pembuat',
    'Disappearing messages': 'Pesan menghilang',
    'Edit': 'Edit',
    'Enter a valid amount': 'Masukkan jumlah yang valid',
    'Enter a valid EXO price greater than zero.':
      'Masukkan harga EXO valid yang lebih besar dari nol.',
    'ERC-20 on Ethereum Mainnet': 'ERC-20 di Ethereum Mainnet',
    'ERC-20 Tokens': 'Token ERC-20',
    'Euro': 'Euro',
    'Est. gas: {{amount}} {{symbol}}': 'Perkiraan gas: {{amount}} {{symbol}}',
    'Estimated fee': 'Estimasi biaya',
    'EXO account creation is disabled while Spectre Mode is active.':
      'Pembuatan akun EXO dinonaktifkan saat Mode Spectre aktif.',
    'Failed to claim refund': 'Gagal mengklaim pengembalian dana',
    'Failed to complete the paid join flow': 'Gagal menyelesaikan alur bergabung berbayar',
    'Failed to create poll': 'Gagal membuat jajak pendapat',
    'Failed to create poll message': 'Gagal membuat pesan jajak pendapat',
    'Failed to create request': 'Gagal membuat permintaan',
    'Failed to Load': 'Gagal memuat',
    'Failed to load market': 'Gagal memuat pasar',
    'Failed to save membership access settings':
      'Gagal menyimpan pengaturan akses keanggotaan',
    'Failed to switch EXO account': 'Gagal mengalihkan akun EXO',
    'Failed to verify the payment confirmation.': 'Gagal memverifikasi konfirmasi pembayaran.',
    'Hide {{displayName}} from your Contacts tab on this device? Chats and encryption keys will stay intact.':
      'Sembunyikan {{displayName}} dari tab Kontak di perangkat ini? Chat dan kunci enkripsi tetap utuh.',
    'Incorrect PIN': 'PIN salah',
    'Invalid {{network}} address': 'Alamat {{network}} tidak valid',
    'Invalid amount': 'Jumlah tidak valid',
    'Invalid market ID': 'ID pasar tidak valid',
    'Invalid recipient address': 'Alamat penerima tidak valid',
    'Loading pool data...': 'Memuat data pool...',
    'Loading voice note...': 'Memuat catatan suara...',
    'Max': 'Maks.',
    'Media, links and docs': 'Media, tautan, dan dokumen',
    'Muted': 'Dibisukan',
    'My {{network}} Address': 'Alamat {{network}} saya',
    'Network': 'Jaringan',
    'Network Fee': 'Biaya jaringan',
    'Network State': 'Status jaringan',
    'Network: Mozaga native EXO': 'Jaringan: EXO asli Mozaga',
    'No documents shared yet': 'Belum ada dokumen yang dibagikan',
    'No address for this network': 'Tidak ada alamat untuk jaringan ini',
    'No links shared yet': 'Belum ada tautan yang dibagikan',
    'No tokens found': 'Tidak ada token ditemukan',
    'Notifications': 'Notifikasi',
    'On': 'Aktif',
    'Opening...': 'Membuka...',
    'Paid access setup incomplete': 'Penyiapan akses berbayar belum selesai',
    'Paid in {{symbol}}': 'Dibayar dalam {{symbol}}',
    'Paid by {{payerName}}': 'Dibayar oleh {{payerName}}',
    'Pay request': 'Bayar permintaan pembayaran',
    'Pay {{amount}}': 'Bayar {{amount}}',
    'Payment already submitted': 'Pembayaran sudah dikirim',
    'Payment failed': 'Pembayaran gagal',
    'Payment message received': 'Pesan pembayaran diterima',
    'Payment Pending': 'Pembayaran tertunda',
    'Payment paid': 'Pembayaran telah dilakukan',
    'Payment recorded': 'Pembayaran tercatat',
    'Payment request: {{amount}} {{symbol}}': 'Permintaan pembayaran: {{amount}} {{symbol}}',
    'Payment Required': 'Pembayaran diperlukan',
    'Payment submitted': 'Pembayaran dikirim',
    'Payment submitted: {{amount}} {{symbol}}': 'Pembayaran dikirim: {{amount}} {{symbol}}',
    'Platform fee: {{fee}}': 'Biaya platform: {{fee}}',
    'Please allow access to your photo library to change the group photo.':
      'Izinkan akses ke perpustakaan foto Anda untuk mengubah foto grup.',
    'Preparing voice note...': 'Menyiapkan catatan suara...',
    'Post request': 'Kirim permintaan',
    'Recipient {{network}} Address': 'Alamat {{network}} penerima',
    'Recipient': 'Penerima',
    'Receive Crypto': 'Terima Kripto',
    'Receive address': 'Alamat penerimaan',
    'Reconnecting...': 'Menghubungkan kembali...',
    'Request a payment in this chat': 'Minta pembayaran dalam chat ini',
    'Requested asset is not available in this wallet':
      'Aset yang diminta tidak tersedia di dompet ini',
    'Review Send': 'Tinjau Pengiriman',
    'Search contacts...': 'Cari kontak...',
    'Securing chat...': 'Mengamankan chat...',
    'Preparing secure channel...': 'Mengamankan chat...',
    'Select Blockchain': 'Pilih blockchain',
    'Sell': 'Jual',
    'Send {{symbol}}': 'Kirim {{symbol}}',
    'Send {{symbol}} to my {{network}} address:\n{{address}}':
      'Kirim {{symbol}} ke alamat {{network}} saya:\n{{address}}',
    'Sending as {{account}}': 'Mengirim sebagai {{account}}',
    'Sending transaction...': 'Mengirim transaksi...',
    'Share {{network}} Address': 'Bagikan Alamat {{network}}',
    'Share contact': 'Bagikan kontak',
    'Show {{displayName}} in your Contacts tab again?':
      'Tampilkan {{displayName}} lagi di tab Kontak Anda?',
    'Solana private key is not available': 'Kunci privat Solana tidak tersedia',
    'Solana wallet not available': 'Dompet Solana tidak tersedia',
    'Something went wrong. Please try again.': 'Terjadi kesalahan. Silakan coba lagi.',
    'SPL Tokens': 'Token SPL',
    'SPL tokens on Solana': 'Token SPL di Solana',
    'Tap to load voice note': 'Ketuk untuk memuat catatan suara',
    'Tap to view shared links and documents':
      'Ketuk untuk melihat tautan dan dokumen yang dibagikan',
    'The payment transaction failed on-chain.': 'Transaksi pembayaran gagal di blockchain.',
    'This file is not available on this device yet.': 'File ini belum tersedia di perangkat ini.',
    'This message was deleted': 'Pesan ini dihapus',
    'This request has already been marked as paid.': 'Permintaan ini sudah ditandai sebagai dibayar.',
    'This voice note could not be loaded right now.':
      'Catatan suara ini tidak dapat dimuat sekarang.',
    'This wallet does not have an account for {{network}}.':
      'Dompet ini tidak memiliki akun untuk {{network}}.',
    'To': 'Kepada',
    'Tor Bridges': 'Jembatan Tor',
    'Transaction failed on-chain': 'Transaksi gagal di blockchain',
    'TRC-20 on Tron': 'TRC-20 di Tron',
    'TRC-20 Tokens': 'Token TRC-20',
    'Tron private key is not available': 'Kunci privat Tron tidak tersedia',
    'Tron wallet not available': 'Dompet Tron tidak tersedia',
    'Try Again': 'Coba lagi',
    'Unable to load voice note': 'Tidak dapat memuat catatan suara',
    'Unable to open link': 'Tidak dapat membuka tautan',
    'Unable to remove recipient': 'Tidak dapat menghapus penerima',
    'Unblock': 'Buka blokir',
    'Unblock {{displayName}}? They will be able to send you messages again.':
      'Buka blokir {{displayName}}? Mereka akan dapat mengirimi Anda pesan lagi.',
    'Unlock the wallet that will pay for this membership and try again.':
      'Buka kunci dompet yang akan membayar keanggotaan ini lalu coba lagi.',
    'Unsupported {{type}} attachment': 'Lampiran {{type}} tidak didukung',
    'Unsupported attachment': 'Lampiran tidak didukung',
    'Use Biometric': 'Gunakan Biometrik',
    'Use the original offline backup you created during onboarding if you need the phrase again. If it is lost, create a newly backed up wallet and migrate to it. The device cannot reveal the old phrase.':
      'Gunakan cadangan offline asli yang Anda buat saat onboarding jika Anda memerlukan frasa itu lagi. Jika hilang, buat dompet baru yang telah dicadangkan dan migrasikan ke sana. Perangkat tidak dapat mengungkapkan frasa lama.',
    'V1 supports Mozaga native EXO only. The company fee is {{fee}}.':
      'V1 hanya mendukung EXO asli Mozaga. Biaya perusahaan adalah {{fee}}.',
    'via {{account}}': 'melalui {{account}}',
    'Voice note unavailable': 'Catatan suara tidak tersedia',
    'Volume': 'Volume',
    'Wallets': 'Dompet',
    'You requested': 'Anda meminta',
    "You'll enter the {{network}} address in the next step":
      'Anda akan memasukkan alamat {{network}} pada langkah berikutnya',
    'Your payment was submitted but is still waiting for confirmation. Reopen this invite in a moment to finish joining.':
      'Pembayaran Anda telah dikirim tetapi masih menunggu konfirmasi. Buka kembali undangan ini sebentar lagi untuk menyelesaikan proses bergabung.',
    '{{senderName}} requested': '{{senderName}} meminta',
    'Diffusion channels require Spectre access.': 'Kanal difusi memerlukan akses Spectre.',
    'Upgrade to Spectre to create one diffusion channel.':
      'Tingkatkan ke Spectre untuk membuat satu kanal difusi.',
    'Please wait until this chat is ready.': 'Tunggu hingga chat ini siap.',
    'Please retry the chat setup first.': 'Coba ulang penyiapan chat terlebih dahulu.',
    'Edit and resend': 'Edit dan kirim ulang',
    'Could not update notifications': 'Tidak dapat memperbarui notifikasi',
    'Public name in notifications': 'Nama publik dalam notifikasi',
    "Hide this contact's public name in your push notifications.":
      'Sembunyikan nama publik kontak ini di notifikasi push Anda.',
    'Hidden': 'Tersembunyi',
    'Allowed': 'Diizinkan',
    'Send ETH': 'Kirim ETH',
    'Could not add members': 'Tidak dapat menambahkan anggota',
    'Add {{count}}': 'Tambahkan {{count}}',
    'Media': 'Media',
    'Add user': 'Tambahkan pengguna',
    '{{count}} slots available': '{{count}} slot tersedia',
    'Group members': 'Anggota grup',
    'Created': 'Dibuat',
    'Could not save your public name. Please try again.':
      'Tidak dapat menyimpan nama publik Anda. Silakan coba lagi.',
    'Text or link': 'Teks atau tautan',
    ' +{{count}} more': ' +{{count}} lainnya',
    'Shared content is missing. Please share it again.':
      'Konten yang dibagikan hilang. Silakan bagikan lagi.',
    'Unable to send': 'Tidak dapat mengirim',
    'Share to Spectra': 'Bagikan ke Spectra',
    'Private handoff': 'Serah terima privat',
    'Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.':
      'Penerima hanya ditampilkan di dalam Spectra. iOS hanya melihat tujuan aplikasi Spectra.',
    'Loading shared content...': 'Memuat konten yang dibagikan...',
    'Could not import shared content': 'Tidak dapat mengimpor konten yang dibagikan',
    '{{count}} attachment_one': '{{count}} lampiran',
    '{{count}} attachment_other': '{{count}} lampiran',
    'No Spectra chats are available for sharing yet.':
      'Belum ada chat Spectra yang tersedia untuk dibagikan.',
    'Connecting encrypted chat...': 'Menghubungkan chat terenkripsi...',
    'Recovering secure call...': 'Memulihkan panggilan aman...',
    'Establishing secure call...': 'Membuat panggilan aman...',
    'Secure call waiting': 'Menunggu panggilan aman',
    'Minimize call': 'Minimalkan panggilan',
    'Edit image': 'Edit gambar',
    'Toggle media controls': 'Tampilkan/sembunyikan kontrol media',
    '+ gas in': '+ gas dalam',
    'Payment': 'Pembayaran',
    'Tap to review and pay': 'Ketuk untuk meninjau dan membayar',
    'Unable to edit image': 'Tidak dapat mengedit gambar',
    'This image could not be edited right now.': 'Gambar ini tidak dapat diedit sekarang.',
    'Message unavailable': 'Pesan tidak tersedia',
    'Could not update this image. Please try again.':
      'Tidak dapat memperbarui gambar ini. Silakan coba lagi.',
    'Could not save the edited image. Please try again.':
      'Tidak dapat menyimpan gambar yang diedit. Silakan coba lagi.',
    'Add text': 'Tambahkan teks',
    'Drag text on the image to reposition it.':
      'Seret teks pada gambar untuk mengubah posisinya.',
    'Drag the crop frame or its corners, then apply.':
      'Seret bingkai pangkas atau sudutnya, lalu terapkan.',
    'Apply crop': 'Terapkan pangkasan',
    'Color': 'Warna',
    'Select drawing color': 'Pilih warna gambar',
    'Stroke': 'Ketebalan garis',
    'Crop': 'Pangkas',
    'Rotate': 'Putar',
    'Draw': 'Gambar',
    'Text': 'Teks',
    'Undo': 'Urungkan',
    'Reset': 'Atur ulang',
    'Use original': 'Gunakan asli',
    'Retry failed': 'Coba ulang yang gagal',
    'Unable to retry': 'Tidak dapat mencoba ulang',
    'This secure chat is not ready yet. Please try again in a moment.':
      'Chat aman ini belum siap. Silakan coba lagi sebentar.',
    'Load this image before editing it.': 'Muat gambar ini sebelum mengeditnya.',
    'Spectre access includes one diffusion channel.':
      'Akses Spectre mencakup satu kanal difusi.',
    'Spectra logo': 'Logo Spectra',
    '{{width}} px': '{{width}} px',
    'External links unavailable': 'Tautan eksternal tidak tersedia',
    'External links are unavailable while Spectre Mode is active.':
      'Tautan eksternal tidak tersedia saat Mode Spectre aktif.',
    'New encrypted message': 'Pesan terenkripsi baru',
    'New message': 'Pesan baru',
    'New group message': 'Pesan grup baru',
    'Default': 'Bawaan',
    'Messages': 'Pesan',
    'Calls': 'Panggilan',
    'Transfers': 'Transfer',
    'New message notifications': 'Notifikasi pesan baru',
    'Secure call notifications': 'Notifikasi panggilan aman',
    'Wallet transfer notifications': 'Notifikasi transfer dompet',
    'Secure call': 'Panggilan aman',
    'A newer version of Spectra is available. Update to get the latest features and fixes.':
      'Versi Spectra yang lebih baru tersedia. Perbarui untuk mendapatkan fitur dan perbaikan terbaru.',
    'This version of Spectra is no longer supported. Update to continue using secure services.':
      'Versi Spectra ini tidak lagi didukung. Perbarui aplikasi untuk terus menggunakan layanan yang aman.',
    'Update available': 'Pembaruan tersedia',
    'Update required': 'Pembaruan diperlukan',
    'Update Spectra': 'Perbarui Spectra',
  },
  auth: {
    'Account import progress': 'Progres impor akun',
    'Deriving wallets...': 'Membuat dompet...',
    'Finishing previous account deletion...': 'Menyelesaikan penghapusan akun sebelumnya...',
    'Importing Account': 'Mengimpor Akun',
    'Public name contains unsupported characters':
      'Nama publik berisi karakter yang tidak didukung',
    'Public name is too large': 'Nama publik terlalu panjang',
    'Public name must be {{max}} characters or fewer':
      'Nama publik harus terdiri dari {{max}} karakter atau kurang',
    'Unable to use this public name': 'Tidak dapat menggunakan nama publik ini',
    'Authenticate to upgrade biometric unlock':
      'Autentikasi untuk meningkatkan buka kunci biometrik',
    'Choose a Public Name': 'Pilih Nama Publik',
    'Go back': 'Kembali',
    'Important': 'Penting',
    'Optional public name for chats': 'Nama publik opsional untuk chat',
    'Public Name': 'Nama Publik',
    'Public name contains invalid text.': 'Nama publik berisi teks tidak valid.',
    'Public name contains unsupported control characters.':
      'Nama publik berisi karakter kontrol yang tidak didukung.',
    'Public name contains unsupported direction controls.':
      'Nama publik berisi kontrol arah yang tidak didukung.',
    'Public name is too large when encoded.': 'Nama publik terlalu besar saat dikodekan.',
    'Public name must be 80 characters or fewer.':
      'Nama publik harus terdiri dari 80 karakter atau kurang.',
    'This optional name helps people recognize you in chats and contacts. You can change or remove it later.':
      'Nama opsional ini membantu orang mengenali Anda dalam chat dan kontak. Anda dapat mengubah atau menghapusnya nanti.',
    'Your public name is shared as chat-directory metadata. It is not included in your recovery phrase and does not affect account security.':
      'Nama publik Anda dibagikan sebagai metadata direktori chat. Nama ini tidak disertakan dalam frasa pemulihan dan tidak memengaruhi keamanan akun.',
    '{{count}} characters maximum.': 'Maksimum {{count}} karakter.',
    'Unlock Spectra to connect your secure call':
      'Buka kunci Spectra untuk menghubungkan panggilan aman Anda',
    'PIN input': 'Input PIN',
    'Mnemonic must be 12 or 24 words': 'Mnemonik harus terdiri dari 12 atau 24 kata',
    'Invalid word: "{{word}}"': 'Kata tidak valid: "{{word}}"',
    'Invalid mnemonic checksum': 'Checksum mnemonik tidak valid',
  },
  chat: {
    'Start Secret Chat': 'Mulai Chat Rahasia',
    'Choose a contact or start with an address': 'Pilih kontak atau mulai dengan alamat',
    'Starting from {{account}}': 'Memulai dari {{account}}',
    'Add by address': 'Tambahkan melalui alamat',
    'Add a contact and open a private chat': 'Tambahkan kontak dan buka chat pribadi',
    'Start Chat': 'Mulai Chat',
    'Scan, add, and start a private chat': 'Pindai, tambahkan, dan mulai chat pribadi',
    'Select from contacts': 'Pilih dari kontak',
    'No saved contacts yet': 'Belum ada kontak tersimpan',
    'Add someone by address or scan their QR code to start.':
      'Tambahkan seseorang melalui alamat atau pindai kode QR mereka untuk memulai.',
    'Starting chat...': 'Memulai chat...',
    'Unable to start chat': 'Tidak dapat memulai chat',
    '{{count}} messages': '{{count}} pesan',
    '{{name}} took a screenshot': '{{name}} mengambil tangkapan layar',
    'Add attachment': 'Tambahkan lampiran',
    'Cancel reply': 'Batalkan balasan',
    'Load more': 'Muat lebih banyak',
    'Record voice note': 'Rekam catatan suara',
    'Remove attachment': 'Hapus lampiran',
    'Send message': 'Kirim pesan',
    'Toggle one-time message': 'Aktifkan/nonaktifkan pesan sekali pakai',
    'Updated {{time}}': 'Diperbarui {{time}}',
    'You took a screenshot': 'Anda mengambil tangkapan layar',
    'Edit image': 'Edit gambar',
    'Choose a contact or use a secure invitation':
      'Pilih kontak atau gunakan undangan aman',
    'Add by invitation': 'Tambahkan melalui undangan',
    'Paste a secure invitation or scan its QR code':
      'Tempel undangan aman atau pindai kode QR-nya',
    'Paste a secure invitation or scan its QR code to start.':
      'Tempel undangan aman atau pindai kode QR-nya untuk memulai.',
    'Nearby': 'Di sekitar',
    'Cancel voice note': 'Batalkan catatan suara',
    'Send voice note': 'Kirim catatan suara',
    'Play voice note': 'Putar catatan suara',
    'Pause voice note': 'Jeda catatan suara',
    'Text overlay': 'Hamparan teks',
    'Crop frame': 'Bingkai pangkas',
    'Crop top-left handle': 'Pegangan pangkas kiri atas',
    'Crop top-right handle': 'Pegangan pangkas kanan atas',
    'Crop bottom-left handle': 'Pegangan pangkas kiri bawah',
    'Crop bottom-right handle': 'Pegangan pangkas kanan bawah',
    '#Tag': '#Tag',
    'Sending attachment': 'Mengirim lampiran',
    'Preparing message': 'Menyiapkan pesan',
    'Sending message': 'Mengirim pesan',
    'Caching locally': 'Menyimpan ke cache lokal',
    'Complete': 'Selesai',
    'Encrypting and uploading {{completed}}/{{total}}':
      'Mengenkripsi dan mengunggah {{completed}}/{{total}}',
    'Sending nearby': 'Mengirim di sekitar',
    'Queued nearby': 'Dalam antrean untuk pengiriman terdekat',
    'Nearby delivery expired': 'Masa pengiriman terdekat berakhir',
    'Nearby retry limit reached': 'Batas percobaan ulang pengiriman terdekat tercapai',
    'Nearby queue full': 'Antrean pengiriman terdekat penuh',
    'Nearby delivery interrupted': 'Pengiriman terdekat terganggu',
    'Nearby receipt timed out': 'Tanda terima pengiriman terdekat habis waktu',
    'Nearby transmission failed': 'Transmisi terdekat gagal',
    'Nearby delivery failed': 'Pengiriman terdekat gagal',
  },
  contacts: {
    'EXO Account': 'Akun EXO',
    'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.':
      'Masukkan alamat pascakuantum orang yang ingin Anda tambahkan. Mereka harus membagikan alamatnya kepada Anda.',
    'Adding to': 'Menambahkan ke',
    'This contact will be saved under this EXO account on this device.':
      'Kontak ini akan disimpan di bawah akun EXO ini pada perangkat ini.',
    'Selected': 'Dipilih',
    'Switching...': 'Mengalihkan...',
    'via {{account}}': 'melalui {{account}}',
    'Please wait until the EXO account switch finishes.':
      'Harap tunggu hingga pengalihan akun EXO selesai.',
    'Paste a valid secure contact invitation.': 'Tempel undangan kontak aman yang valid.',
    'Paste a secure contact invitation or scan a contact QR code':
      'Tempel undangan kontak aman atau pindai kode QR kontak',
    'Invalid secure contact invitation': 'Undangan kontak aman tidak valid',
    'Add by secure contact invitation': 'Tambahkan melalui undangan kontak aman',
    'Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.':
      'Pindai kode QR kontak atau tempel undangan kontak aman yang dibagikan oleh orang yang ingin Anda tambahkan.',
    'Secure Contact Invitation': 'Undangan Kontak Aman',
    'Secure invitation ready': 'Undangan aman siap',
    'Invalid contact invitation': 'Undangan kontak tidak valid',
    'Scan a secure Spectra contact QR code shared by the person you want to add.':
      'Pindai kode QR kontak Spectra aman yang dibagikan oleh orang yang ingin Anda tambahkan.',
    'Paste a secure contact invitation or scan its QR code.':
      'Tempel undangan kontak aman atau pindai kode QR-nya.',
  },
  crypto: {
    'Total': 'Total',
    '~{{fee}} {{symbol}}': '~{{fee}} {{symbol}}',
    '{{symbol}} logo': 'Logo {{symbol}}',
    'USDT logo': 'Logo USDT',
  },
  markets: {
    'Trending Markets': 'Pasar Tren',
    'Live Campaigns': 'Kampanye Langsung',
    'Hot Predictions': 'Prediksi Populer',
    'See all': 'Lihat semua',
    'Vol': 'Vol.',
    'of': 'dari',
    '{{count}}m left': '{{count}} m tersisa',
    '{{count}}h left': '{{count}} j tersisa',
    '{{count}}d left': '{{count}} h tersisa',
    'No description': 'Tidak ada deskripsi',
    'No order activity yet': 'Belum ada aktivitas pesanan',
    'Untitled campaign': 'Kampanye tanpa judul',
    '{{count}} backers': '{{count}} pendukung',
    '0 (unlimited)': '0 (tanpa batas)',
    'Amount exceeds remaining allowance': 'Jumlah melebihi sisa batas',
    'Cannot contribute': 'Tidak dapat berkontribusi',
    'Connect wallet to create a campaign': 'Hubungkan dompet untuk membuat kampanye',
    'Connect wallet to create an escrow order': 'Hubungkan dompet untuk membuat pesanan eskro',
    'Connect wallet to view your campaigns': 'Hubungkan dompet untuk melihat kampanye Anda',
    'Connect wallet to view your escrow orders': 'Hubungkan dompet untuk melihat pesanan eskro Anda',
    'Describe the condition for release...': 'Jelaskan kondisi untuk pelepasan...',
    'Enter a valid market ID': 'Masukkan ID pasar yang valid',
    'Enter a valid sale ID': 'Masukkan ID penjualan yang valid',
    'Fiat price must be greater than zero': 'Harga fiat harus lebih besar dari nol',
    'Filled': 'Terpenuhi',
    'Invalid campaign ID': 'ID kampanye tidak valid',
    'Invalid order ID': 'ID pesanan tidak valid',
    'Invalid sale ID': 'ID penjualan tidak valid',
    'No escrow orders found': 'Tidak ada pesanan eskro ditemukan',
    'Partially Filled': 'Terpenuhi sebagian',
    'Yes': 'Ya',
    'You are not eligible to contribute': 'Anda tidak memenuhi syarat untuk berkontribusi',
  },
  settings: {
    'Activating secure online access': 'Mengaktifkan akses online aman',
    'Publishing secure discovery': 'Menerbitkan penemuan aman',
    'Keeping you findable': 'Menjaga agar Anda dapat ditemukan',
    'Starting a secure chat': 'Memulai obrolan aman',
    'Creating one-time contact card': 'Membuat kartu kontak sekali pakai',
    'Computing VDF proof': 'Menghitung bukti VDF',
    'Solving a sequential proof that helps prevent automated account creation.':
      'Menyelesaikan bukti berurutan yang membantu mencegah pembuatan akun otomatis.',
    'Generating VDF proof': 'Membuat bukti VDF',
    'Preparing the compact proof the server can verify efficiently.':
      'Menyiapkan bukti ringkas yang dapat diverifikasi server secara efisien.',
    'Waiting for server verification': 'Menunggu verifikasi server',
    'Retrying server verification': 'Mencoba lagi verifikasi server',
    'Proof ready. The server enforces a minimum delay before it accepts it.':
      'Bukti siap. Server menerapkan penundaan minimum sebelum menerimanya.',
    'Verifying VDF proof': 'Memverifikasi bukti VDF',
    'Sending the proof for secure verification.':
      'Mengirim bukti untuk verifikasi aman.',
    'Secure online access is ready': 'Akses online aman siap',
    'Your secure online access is active.': 'Akses online aman Anda aktif.',
    'VDF work was cancelled': 'Pekerjaan VDF dibatalkan',
    'No proof was submitted.': 'Tidak ada bukti yang dikirim.',
    'Secure access needs attention': 'Akses aman memerlukan perhatian',
    'This proof could not be completed. Check your connection and try again.':
      'Bukti ini tidak dapat diselesaikan. Periksa koneksi Anda dan coba lagi.',
    '{{percent}}% complete': '{{percent}}% selesai',
    'VDFs completed {{completed}}/{{total}}': 'VDF selesai {{completed}}/{{total}}',
    '{{rate}} VDF iterations/s': '{{rate}} iterasi VDF/dtk',
    'Measuring VDF rate…': 'Mengukur kecepatan VDF…',
    '~{{count}}s remaining': '~{{count}} dtk tersisa',
    'Cancel secure work': 'Batalkan pekerjaan aman',
    'Could not start this chat': 'Tidak dapat memulai chat ini',
    'Could not update discovery': 'Tidak dapat memperbarui penemuan',
    'Could not create contact card': 'Tidak dapat membuat kartu kontak',
    'Dismiss': 'Tutup',
    'Keep Spectra open while the security proof is verified.':
      'Biarkan Spectra tetap terbuka saat bukti keamanan diverifikasi.',
    'This removes this EXO account from this device and frees one transparent EXO slot for this recovery phrase. Existing messages for this account are erased locally. This cannot be undone.':
      'Ini menghapus akun EXO ini dari perangkat dan membebaskan satu slot EXO transparan untuk frasa pemulihan ini. Pesan yang ada untuk akun ini dihapus secara lokal. Tindakan ini tidak dapat dibatalkan.',
    'Switch to your root EXO account to create or import transparent EXO accounts.':
      'Beralihlah ke akun EXO root Anda untuk membuat atau mengimpor akun EXO transparan.',
    'Root': 'Root',
    'Failed to disable an expired Spectre session': 'Gagal menonaktifkan sesi Spectre yang kedaluwarsa',
    'Disabled by Spectre Mode': 'Dinonaktifkan oleh Mode Spectre',
    'Contact Archive': 'Arsip Kontak',
    'Encrypted contact archive': 'Arsip kontak terenkripsi',
    'Export an encrypted file you control, then import it later to preserve saved contacts.':
      'Ekspor file terenkripsi yang Anda kendalikan, lalu impor nanti untuk mempertahankan kontak tersimpan.',
    'Export and import encrypted contacts': 'Ekspor dan impor kontak terenkripsi',
    'Unable to complete Spectre activation': 'Tidak dapat menyelesaikan aktivasi Spectre',
    'One anonymous activation token can be requested every 24 hours.':
      'Satu token aktivasi anonim dapat diminta setiap 24 jam.',
    'Backend is not configured for Spectre activation':
      'Backend tidak dikonfigurasi untuk aktivasi Spectre',
    'A verified Backend session is required for Spectre activation':
      'Sesi Backend terverifikasi diperlukan untuk aktivasi Spectre',
    'Failed to refresh Spectre access': 'Gagal memperbarui akses Spectre',
    'Account deleted': 'Akun dihapus',
    'Account deletion completed': 'Penghapusan akun selesai',
    'Account deletion needs attention': 'Penghapusan akun memerlukan perhatian',
    'A verified backend session is required before deleting this account.':
      'Sesi backend terverifikasi diperlukan sebelum menghapus akun ini.',
    'Backend cleanup is paused and will be retried safely. Try checking again.':
      'Pembersihan backend dijeda dan akan dicoba ulang dengan aman. Coba periksa lagi.',
    'Backend cleanup is still running. You can retry this status check safely.':
      'Pembersihan backend masih berjalan. Anda dapat mencoba ulang pemeriksaan status ini dengan aman.',
    'Backend cleanup could not be checked. Retry when the private connection is available.':
      'Pembersihan backend tidak dapat diperiksa. Coba lagi saat koneksi privat tersedia.',
    'Backend deletion completed, but final device cleanup needs to be retried.':
      'Penghapusan backend selesai, tetapi pembersihan perangkat akhir perlu dicoba ulang.',
    'Backend deletion completed, but local key erasure could not be confirmed.':
      'Penghapusan backend selesai, tetapi penghapusan kunci lokal tidak dapat dikonfirmasi.',
    'Cleanup could not be confirmed. You can retry safely.':
      'Pembersihan tidak dapat dikonfirmasi. Anda dapat mencoba ulang dengan aman.',
    'Deleting Account': 'Menghapus Akun',
    'Deleting account records': 'Menghapus catatan akun',
    'Deleting chat relay data': 'Menghapus data relay chat',
    'Deleting encrypted objects': 'Menghapus objek terenkripsi',
    'Deletion needs attention': 'Penghapusan memerlukan perhatian',
    'Erasing local keys and data': 'Menghapus kunci dan data lokal',
    'Finalizing secure cleanup': 'Menyelesaikan pembersihan aman',
    'Keep Spectra open while each verified cleanup stage completes.':
      'Biarkan Spectra tetap terbuka saat setiap tahap pembersihan terverifikasi selesai.',
    'Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.':
      'Data lokal dihapus, tetapi pembersihan backend tidak dapat dikonfirmasi. Coba lagi saat koneksi privat tersedia.',
    'Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.':
      'Data lokal dihapus, tetapi backend tidak menerima permintaan penghapusan. Impor ulang akun untuk mencoba lagi.',
    'Local data and the accepted backend cleanup have finished.':
      'Data lokal dan pembersihan backend yang diterima telah selesai.',
    'Preparing secure deletion': 'Menyiapkan penghapusan aman',
    'Retry account deletion cleanup': 'Coba ulang pembersihan penghapusan akun',
    'Retry cleanup': 'Coba ulang pembersihan',
    'Secure account deletion stopped unexpectedly. Try again when the private connection is available.':
      'Penghapusan akun aman berhenti secara tak terduga. Coba lagi saat koneksi privat tersedia.',
    'Secure deletion in progress': 'Penghapusan aman sedang berlangsung',
    'Submitting the deletion request': 'Mengirimkan permintaan penghapusan',
    'This cannot be undone. Local sensitive data is erased before the backend deletion request starts.':
      'Tindakan ini tidak dapat dibatalkan. Data sensitif lokal dihapus sebelum permintaan penghapusan backend dimulai.',
    'This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.':
      'Tindakan ini menghapus kunci dan data lokal terlebih dahulu, lalu mengirimkan pembersihan backend melalui transport privat Anda saat ini. Layar progres tetap terlihat sampai pembersihan dikonfirmasi.',
    'This screen updates only when a cleanup stage is confirmed.':
      'Layar ini diperbarui hanya saat tahap pembersihan dikonfirmasi.',
    'The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.':
      'Backend tidak lagi mengenali token pembersihan ini. Impor ulang akun untuk memverifikasi penghapusan.',
    'The cleanup status token expired. Re-import the account to verify its status.':
      'Token status pembersihan telah kedaluwarsa. Impor ulang akun untuk memverifikasi statusnya.',
    'There is no pending backend cleanup to retry.':
      'Tidak ada pembersihan backend tertunda untuk dicoba ulang.',
    '{{count}}s elapsed': '{{count}} dtk berlalu',
    'Applying Spectre protections': 'Menerapkan perlindungan Spectre',
    'Keep this screen open while EXO prepares the secure activation handoff.':
      'Biarkan layar ini terbuka saat EXO menyiapkan serah terima aktivasi aman.',
    'Preparing Spectre Mode': 'Menyiapkan Mode Spectre',
    'Preparing your Spectre account': 'Menyiapkan akun Spectre Anda',
    'Registering the private account': 'Mendaftarkan akun privat',
    'Reserving private activation': 'Mencadangkan aktivasi privat',
    'Changes were rolled back': 'Perubahan dibatalkan',
    'Checking private access': 'Memeriksa akses privat',
    'Choose a new 6-digit PIN': 'Pilih PIN 6 digit baru',
    'Confirm New PIN': 'Konfirmasi PIN Baru',
    'Connecting your private route': 'Menghubungkan rute privat Anda',
    'Enter Current PIN': 'Masukkan PIN Saat Ini',
    'Enter New PIN': 'Masukkan PIN Baru',
    'Enter your current PIN': 'Masukkan PIN saat ini',
    'Enter your current PIN before creating a duress PIN':
      'Masukkan PIN saat ini sebelum membuat PIN darurat',
    'Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.':
      'Memasukkan PIN darurat akan mencoba menghapus data akun backend, menghapus perangkat ini, dan segera mengeluarkan Anda.',
    'EXO can continue refreshing chats in the background once Spectre is ready.':
      'EXO dapat terus memperbarui chat di latar belakang setelah Spectre siap.',
    'EXO has finished switching back from Spectre Mode.':
      'EXO selesai beralih kembali dari Mode Spectre.',
    'EXO is validating your Spectre account and required protections before the private handoff starts.':
      'EXO sedang memvalidasi akun Spectre dan perlindungan yang diperlukan sebelum serah terima privat dimulai.',
    'EXO is verifying the wallet session it uses for private network services.':
      'EXO sedang memverifikasi sesi dompet yang digunakannya untuk layanan jaringan privat.',
    'EXO stopped the Spectre flow and restored the previous safe state where it could.':
      'EXO menghentikan alur Spectre dan memulihkan keadaan aman sebelumnya sejauh yang dapat dilakukan.',
    'Failed to change PIN': 'Gagal mengubah PIN',
    'Failed to disable Spectre Mode': 'Gagal menonaktifkan Mode Spectre',
    'Failed to verify PIN': 'Gagal memverifikasi PIN',
    'Finalizing Spectre shutdown': 'Menyelesaikan penonaktifan Spectre',
    'Finishing the private handoff': 'Menyelesaikan serah terima privat',
    'Getting Spectre ready': 'Menyiapkan Spectre',
    'Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.':
      'Biarkan layar ini terbuka saat EXO menerapkan perubahan privasi yang diperlukan untuk Mode Spectre.',
    'Keep this screen open while EXO restores your regular wallet and security settings.':
      'Biarkan layar ini terbuka saat EXO memulihkan dompet dan pengaturan keamanan reguler Anda.',
    'Loading your Spectre setup': 'Memuat penyiapan Spectre Anda',
    'New PIN must be different from current PIN': 'PIN baru harus berbeda dari PIN saat ini',
    'PINs do not match': 'PIN tidak cocok',
    'Preparing your private workspace': 'Menyiapkan ruang kerja privat Anda',
    'Preparing your Spectre setup': 'Menyiapkan penyiapan Spectre Anda',
    'Re-enter your new PIN to confirm': 'Masukkan ulang PIN baru Anda untuk mengonfirmasi',
    'Restoring network and cleanup': 'Memulihkan jaringan dan pembersihan',
    'Restoring privacy protections': 'Memulihkan perlindungan privasi',
    'Restoring your main profile': 'Memulihkan profil utama Anda',
    'Review the failed step below before trying again.':
      'Tinjau langkah yang gagal di bawah ini sebelum mencoba lagi.',
    'Spectre cannot finish until Tor is connected. Try bridges or a different network.':
      'Spectre tidak dapat selesai sampai Tor terhubung. Coba jembatan atau jaringan lain.',
    'Spectre chats and contacts are still refreshing in the background.':
      'Chat dan kontak Spectre masih diperbarui di latar belakang.',
    'Spectre needs your attention': 'Spectre memerlukan perhatian Anda',
    'Spectre protections are active': 'Perlindungan Spectre aktif',
    'Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.':
      'Spectre menonaktifkan panggilan dan tindakan kripto; menghapus token push; memaksa Tor, PIN darurat, hapus saat gagal, perlindungan tangkapan layar, dan privasi pengalih aplikasi; serta secara default menetapkan pesan baru ke pengatur waktu menghilang singkat.',
    'Switching back to your main wallet': 'Beralih kembali ke dompet utama Anda',
    'Switching to your Spectre identity': 'Beralih ke identitas Spectre Anda',
    'This screen updates automatically as each Spectre stage finishes.':
      'Layar ini diperbarui secara otomatis saat setiap tahap Spectre selesai.',
    'Tor could not connect': 'Tor tidak dapat tersambung',
    'Tor must be online before Spectre can switch identities and continue.':
      'Tor harus daring sebelum Spectre dapat mengalihkan identitas dan melanjutkan.',
    'Tor routing applies only inside Spectra. Device-wide network routing is unchanged.':
      'Perutean Tor hanya berlaku di dalam Spectra. Perutean jaringan seluruh perangkat tidak berubah.',
    'Verify Primary PIN': 'Verifikasi PIN Utama',
    'Verify your identity to change PIN': 'Verifikasi identitas Anda untuk mengubah PIN',
    'Verifying private access': 'Memverifikasi akses privat',
    'Your main wallet is restored': 'Dompet utama Anda dipulihkan',
    'Your PIN has been changed successfully.': 'PIN Anda berhasil diubah.',
    'Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.':
      'Dompet Spectre dan terowongan Tor Anda siap. Chat dan kontak dapat selesai diperbarui di latar belakang.',
    'Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.':
      'Dompet Spectre Anda aktif. EXO sedang mengalihkan cakupan penyimpanan dan memuat data lokal untuk profil privat ini.',
    'Erase Account Permanently?': 'Hapus Akun Secara Permanen?',
    'This cannot be undone. Backend data and local sensitive data will be erased for this account.':
      'Tindakan ini tidak dapat dibatalkan. Data backend dan data sensitif lokal akan dihapus untuk akun ini.',
    'Erase Everything': 'Hapus Semuanya',
    'Cloud Session Required': 'Sesi Cloud Diperlukan',
    'Unlock or reconnect to the backend before deleting the account.':
      'Buka kunci atau sambungkan kembali ke backend sebelum menghapus akun.',
    'Account deletion failed. Try again after checking your connection.':
      'Penghapusan akun gagal. Coba lagi setelah memeriksa koneksi Anda.',
    'Account Deletion Failed': 'Penghapusan Akun Gagal',
    'Confirm Account Deletion': 'Konfirmasi Penghapusan Akun',
    'Enter your PIN to continue to the final destructive confirmation.':
      'Masukkan PIN Anda untuk melanjutkan ke konfirmasi akhir penghapusan akun secara permanen.',
    'Account Deletion': 'Penghapusan Akun',
    '{{count}}s elapsed - this may take 30-240 seconds with bridges':
      '{{count}} dtk berlalu — ini mungkin memerlukan 30–240 detik dengan jembatan',
  },
  profile: {
    'Show VDF progress': 'Tampilkan progres VDF',
    'Proofs still run in the background when this is off.':
      'Bukti tetap berjalan di latar belakang saat ini dimatikan.',
    'Public name contains unsupported characters':
      'Nama publik berisi karakter yang tidak didukung',
    'Public name is too large': 'Nama publik terlalu panjang',
    'Public name must be {{max}} characters or fewer':
      'Nama publik harus terdiri dari {{max}} karakter atau kurang',
    'Unable to use this public name': 'Tidak dapat menggunakan nama publik ini',
    'Change Photo': 'Ubah Foto',
    'Chat bundle not on server — others cannot find you':
      'Paket chat tidak ada di server — orang lain tidak dapat menemukan Anda',
    'Chat bundle registered on server': 'Paket chat terdaftar di server',
    'Chat identity not available. Please restart the app.':
      'Identitas chat tidak tersedia. Harap mulai ulang aplikasi.',
    'Checking chat bundle...': 'Memeriksa paket chat...',
    'Checking identity link...': 'Memeriksa tautan identitas...',
    'Could not link identity. Please try again.':
      'Tidak dapat menautkan identitas. Silakan coba lagi.',
    'Could not refresh session. Check your connection.':
      'Tidak dapat memperbarui sesi. Periksa koneksi Anda.',
    'Edit Profile': 'Edit Profil',
    'Identity linked to server': 'Identitas ditautkan ke server',
    'Identity not linked — messaging is disabled':
      'Identitas tidak ditautkan — pesan dinonaktifkan',
    'Member since {{date}}': 'Anggota sejak {{date}}',
    'Security Status': 'Status Keamanan',
    'Server session active': 'Sesi server aktif',
    'Server session expired — features may not work':
      'Sesi server kedaluwarsa — fitur mungkin tidak berfungsi',
    'This name is visible to your contacts': 'Nama ini terlihat oleh kontak Anda',
    'Unknown error': 'Kesalahan tidak diketahui',
    'Profile photos cannot be changed while Spectre Mode is active.':
      'Foto profil tidak dapat diubah saat Mode Spectre aktif.',
    'Photo disabled in Spectre Mode': 'Foto dinonaktifkan dalam Mode Spectre',
    'Account Label': 'Label Akun',
    'Name this account': 'Beri nama akun ini',
    'This is a local label to help you identify this account. It is not your public chat name.':
      'Ini adalah label lokal untuk membantu Anda mengenali akun ini. Ini bukan nama chat publik Anda.',
    'Public profile names cannot be edited while Spectre Mode is active.':
      'Nama profil publik tidak dapat diedit saat Mode Spectre aktif.',
    'Public Name': 'Nama Publik',
    'Public name contains invalid text.': 'Nama publik berisi teks tidak valid.',
    'Public name contains unsupported control characters.':
      'Nama publik berisi karakter kontrol yang tidak didukung.',
    'Public name contains unsupported direction controls.':
      'Nama publik berisi kontrol arah yang tidak didukung.',
    'Public name is too large when encoded.': 'Nama publik terlalu besar saat dikodekan.',
    'Public name must be 80 characters or fewer.':
      'Nama publik harus terdiri dari 80 karakter atau kurang.',
    'Optional public name for chats': 'Nama publik opsional untuk chat',
    'Publication needs attention. Retry when you are online.':
      'Publikasi memerlukan perhatian. Coba lagi saat Anda daring.',
    'Published': 'Dipublikasikan',
    'Publishing public name...': 'Menerbitkan nama publik...',
    'Public profile metadata is read-only while Spectre Mode is active.':
      'Metadata profil publik bersifat hanya baca saat Mode Spectre aktif.',
    'Retry Publication': 'Coba Ulang Publikasi',
    'This repeatable name is public chat-directory metadata. People who have not saved you under another name can see it in chats and contacts. It appears in notifications only when both sides enable that privacy trade-off.':
      'Nama yang dapat digunakan berulang ini adalah metadata direktori chat publik. Orang yang belum menyimpan Anda dengan nama lain dapat melihatnya di chat dan kontak. Nama ini muncul di notifikasi hanya bila kedua pihak mengaktifkan kompromi privasi tersebut.',
    'This public name is saved on this device and will publish when your chat identity is linked.':
      'Nama publik ini disimpan di perangkat ini dan akan diterbitkan saat identitas chat Anda ditautkan.',
    'Waiting for chat readiness. Automatic retries are scheduled.':
      'Menunggu chat siap. Percobaan ulang otomatis dijadwalkan.',
    'Save Public Name': 'Simpan Nama Publik',
    'Preparing secure contact invitation…': 'Menyiapkan undangan kontak aman…',
    'Preparing secure contact card…': 'Menyiapkan kartu kontak aman…',
    'Preparing secure share…': 'Menyiapkan berbagi aman…',
    'Create a one-time card to show your QR code.':
      'Buat kartu sekali pakai untuk menampilkan kode QR Anda.',
    'Create one-time contact card': 'Buat kartu kontak sekali pakai',
    'Publish for 5 minutes': 'Terbitkan selama 5 menit',
    'Your account is discoverable for 5 minutes.':
      'Akun Anda dapat ditemukan selama 5 menit.',
    'Your account is already discoverable.': 'Akun Anda sudah dapat ditemukan.',
    'Your one-time contact card is still active.':
      'Kartu kontak sekali pakai Anda masih aktif.',
    'Open one-time contact card': 'Buka kartu kontak sekali pakai',
    'One-time contact card ready': 'Kartu kontak sekali pakai siap',
    'Expires in {{minutes}} min': 'Kedaluwarsa dalam {{minutes}} mnt',
    'One-time contact card': 'Kartu kontak sekali pakai',
    'Share this QR code before it expires.':
      'Bagikan kode QR ini sebelum kedaluwarsa.',
    'A one-time contact card expires after one hour and can be used once.':
      'Kartu kontak sekali pakai kedaluwarsa setelah satu jam dan hanya dapat digunakan sekali.',
    'Chat identity is not ready yet.': 'Identitas chat belum siap.',
  },
  tor: {
    'Connected to Spectre': 'Terhubung ke Spectre',
  },
} satisfies LocaleTranslationOverrides

export default translations

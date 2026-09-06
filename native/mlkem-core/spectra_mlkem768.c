/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

#include "spectra_mlkem768.h"

#include "kem.h"
#include "randombytes.h"
#include "spectra_secure_wipe.h"

#include <string.h>

int spectra_mlkem768_keypair(
  uint8_t *public_key,
  size_t public_key_len,
  uint8_t *secret_key,
  size_t secret_key_len
) {
  uint8_t coins[64];

  if (public_key == NULL || secret_key == NULL) {
    return 0;
  }
  if (
    public_key_len != SPECTRA_MLKEM768_PUBLICKEYBYTES
    || secret_key_len != SPECTRA_MLKEM768_SECRETKEYBYTES
    || public_key_len != PQCLEAN_MLKEM768_CLEAN_CRYPTO_PUBLICKEYBYTES
    || secret_key_len != PQCLEAN_MLKEM768_CLEAN_CRYPTO_SECRETKEYBYTES
  ) {
    return 0;
  }

  if (randombytes(coins, sizeof(coins)) != 0) {
    spectra_secure_wipe(coins, sizeof(coins));
    return 0;
  }
  const int rc = PQCLEAN_MLKEM768_CLEAN_crypto_kem_keypair_derand(
    public_key,
    secret_key,
    coins
  );
  spectra_secure_wipe(coins, sizeof(coins));
  if (rc != 0) {
    spectra_secure_wipe(public_key, public_key_len);
    spectra_secure_wipe(secret_key, secret_key_len);
    return 0;
  }
  return 1;
}

int spectra_mlkem768_encaps(
  const uint8_t *public_key,
  size_t public_key_len,
  uint8_t *ciphertext,
  size_t ciphertext_len,
  uint8_t *shared_secret,
  size_t shared_secret_len
) {
  uint8_t coins[32];

  if (public_key == NULL || ciphertext == NULL || shared_secret == NULL) {
    return 0;
  }
  if (
    public_key_len != SPECTRA_MLKEM768_PUBLICKEYBYTES
    || ciphertext_len != SPECTRA_MLKEM768_CIPHERTEXTBYTES
    || shared_secret_len != SPECTRA_MLKEM768_SHAREDSECRETBYTES
    || public_key_len != PQCLEAN_MLKEM768_CLEAN_CRYPTO_PUBLICKEYBYTES
    || ciphertext_len != PQCLEAN_MLKEM768_CLEAN_CRYPTO_CIPHERTEXTBYTES
    || shared_secret_len != PQCLEAN_MLKEM768_CLEAN_CRYPTO_BYTES
  ) {
    return 0;
  }

  if (randombytes(coins, sizeof(coins)) != 0) {
    spectra_secure_wipe(coins, sizeof(coins));
    return 0;
  }
  const int rc = PQCLEAN_MLKEM768_CLEAN_crypto_kem_enc_derand(
    ciphertext,
    shared_secret,
    public_key,
    coins
  );
  spectra_secure_wipe(coins, sizeof(coins));
  if (rc != 0) {
    spectra_secure_wipe(shared_secret, shared_secret_len);
    spectra_secure_wipe(ciphertext, ciphertext_len);
    return 0;
  }
  return 1;
}

int spectra_mlkem768_decaps(
  const uint8_t *secret_key,
  size_t secret_key_len,
  const uint8_t *ciphertext,
  size_t ciphertext_len,
  uint8_t *shared_secret,
  size_t shared_secret_len
) {
  uint8_t secret_copy[SPECTRA_MLKEM768_SECRETKEYBYTES];

  if (secret_key == NULL || ciphertext == NULL || shared_secret == NULL) {
    return 0;
  }
  if (
    secret_key_len != SPECTRA_MLKEM768_SECRETKEYBYTES
    || ciphertext_len != SPECTRA_MLKEM768_CIPHERTEXTBYTES
    || shared_secret_len != SPECTRA_MLKEM768_SHAREDSECRETBYTES
    || secret_key_len != PQCLEAN_MLKEM768_CLEAN_CRYPTO_SECRETKEYBYTES
    || ciphertext_len != PQCLEAN_MLKEM768_CLEAN_CRYPTO_CIPHERTEXTBYTES
    || shared_secret_len != PQCLEAN_MLKEM768_CLEAN_CRYPTO_BYTES
  ) {
    return 0;
  }

  memcpy(secret_copy, secret_key, SPECTRA_MLKEM768_SECRETKEYBYTES);
  const int rc = PQCLEAN_MLKEM768_CLEAN_crypto_kem_dec(
    shared_secret,
    ciphertext,
    secret_copy
  );
  spectra_secure_wipe(secret_copy, sizeof(secret_copy));
  if (rc != 0) {
    spectra_secure_wipe(shared_secret, shared_secret_len);
    return 0;
  }
  return 1;
}

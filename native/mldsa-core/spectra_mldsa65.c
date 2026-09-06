/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

#include "spectra_mldsa65.h"

#include "api.h"
#include "spectra_secure_wipe.h"

#include <string.h>

int spectra_mldsa65_verify(
  const uint8_t *public_key,
  size_t public_key_len,
  const uint8_t *signature,
  size_t signature_len,
  const uint8_t *message,
  size_t message_len
) {
  if (public_key == NULL || signature == NULL) {
    return 0;
  }
  if (message == NULL && message_len != 0) {
    return 0;
  }
  if (
    public_key_len != SPECTRA_MLDSA65_PUBLICKEYBYTES
    || signature_len != SPECTRA_MLDSA65_SIGNATUREBYTES
    || message_len > SPECTRA_MLDSA65_MAX_MESSAGE_BYTES
  ) {
    return 0;
  }
  if (
    public_key_len != PQCLEAN_MLDSA65_CLEAN_CRYPTO_PUBLICKEYBYTES
    || signature_len != PQCLEAN_MLDSA65_CLEAN_CRYPTO_BYTES
  ) {
    return 0;
  }

  return PQCLEAN_MLDSA65_CLEAN_crypto_sign_verify(
    signature,
    signature_len,
    message,
    message_len,
    public_key
  ) == 0 ? 1 : 0;
}

int spectra_mldsa65_sign(
  const uint8_t *secret_key,
  size_t secret_key_len,
  const uint8_t *message,
  size_t message_len,
  uint8_t *signature,
  size_t signature_len
) {
  uint8_t secret_copy[SPECTRA_MLDSA65_SECRETKEYBYTES];
  size_t written = 0;

  if (secret_key == NULL || signature == NULL) {
    return 0;
  }
  if (message == NULL && message_len != 0) {
    return 0;
  }
  if (
    secret_key_len != SPECTRA_MLDSA65_SECRETKEYBYTES
    || signature_len != SPECTRA_MLDSA65_SIGNATUREBYTES
    || message_len > SPECTRA_MLDSA65_MAX_MESSAGE_BYTES
    || secret_key_len != PQCLEAN_MLDSA65_CLEAN_CRYPTO_SECRETKEYBYTES
    || signature_len != PQCLEAN_MLDSA65_CLEAN_CRYPTO_BYTES
  ) {
    return 0;
  }

  memcpy(secret_copy, secret_key, SPECTRA_MLDSA65_SECRETKEYBYTES);
  written = signature_len;
  const int ok = PQCLEAN_MLDSA65_CLEAN_crypto_sign_signature(
    signature,
    &written,
    message,
    message_len,
    secret_copy
  ) == 0 && written == SPECTRA_MLDSA65_SIGNATUREBYTES;
  spectra_secure_wipe(secret_copy, sizeof(secret_copy));
  if (!ok) {
    spectra_secure_wipe(signature, signature_len);
    return 0;
  }
  return 1;
}

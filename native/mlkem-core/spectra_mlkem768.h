/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

#ifndef SPECTRA_MLKEM768_H
#define SPECTRA_MLKEM768_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SPECTRA_MLKEM768_PUBLICKEYBYTES 1184
#define SPECTRA_MLKEM768_SECRETKEYBYTES 2400
#define SPECTRA_MLKEM768_CIPHERTEXTBYTES 1088
#define SPECTRA_MLKEM768_SHAREDSECRETBYTES 32

/* Returns 1 on success, 0 on failure. Wipes its coins after use. */
int spectra_mlkem768_keypair(
  uint8_t *public_key,
  size_t public_key_len,
  uint8_t *secret_key,
  size_t secret_key_len
);

/* Returns 1 on success, 0 on failure. */
int spectra_mlkem768_encaps(
  const uint8_t *public_key,
  size_t public_key_len,
  uint8_t *ciphertext,
  size_t ciphertext_len,
  uint8_t *shared_secret,
  size_t shared_secret_len
);

/* Returns 1 on success, 0 on failure. Wipes its secret-key working copy. */
int spectra_mlkem768_decaps(
  const uint8_t *secret_key,
  size_t secret_key_len,
  const uint8_t *ciphertext,
  size_t ciphertext_len,
  uint8_t *shared_secret,
  size_t shared_secret_len
);

#ifdef __cplusplus
}
#endif

#endif

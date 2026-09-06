/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

#ifndef SPECTRA_MLDSA65_H
#define SPECTRA_MLDSA65_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SPECTRA_MLDSA65_PUBLICKEYBYTES 1952
#define SPECTRA_MLDSA65_SECRETKEYBYTES 4032
#define SPECTRA_MLDSA65_SIGNATUREBYTES 3309
#define SPECTRA_MLDSA65_MAX_MESSAGE_BYTES (1u << 20)

/* Returns 1 if valid, 0 if invalid. Never returns 1 for malformed input. */
int spectra_mldsa65_verify(
  const uint8_t *public_key,
  size_t public_key_len,
  const uint8_t *signature,
  size_t signature_len,
  const uint8_t *message,
  size_t message_len
);

/* Returns 1 on success, 0 on failure. Wipes its secret-key working copy. */
int spectra_mldsa65_sign(
  const uint8_t *secret_key,
  size_t secret_key_len,
  const uint8_t *message,
  size_t message_len,
  uint8_t *signature,
  size_t signature_len
);

#ifdef __cplusplus
}
#endif

#endif

/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

#include "spectra_secure_wipe.h"

#define __STDC_WANT_LIB_EXT1__ 1
#include <string.h>

#if defined(__APPLE__)
#include <sys/types.h>
#endif

void spectra_secure_wipe(void *ptr, size_t n) {
  if (ptr == NULL || n == 0) {
    return;
  }
#if defined(__APPLE__)
  memset_s(ptr, n, 0, n);
#elif defined(__GLIBC__)
  explicit_bzero(ptr, n);
#else
  /* Android Bionic does not provide explicit_bzero. memset_explicit exists
   * only from API 34, while this project still compiles against API 24. */
  volatile unsigned char *bytes = (volatile unsigned char *)ptr;
  while (n > 0) {
    *bytes++ = 0;
    n--;
  }
#endif
}

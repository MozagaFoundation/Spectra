/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

#include "randombytes.h"
#include "spectra_secure_wipe.h"

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

#if defined(__APPLE__)
#include <Security/SecRandom.h>
#elif defined(__linux__) || defined(__ANDROID__)
#include <errno.h>
#include <sys/syscall.h>
#include <unistd.h>
#else
#error "Spectra native PQ CSPRNG requires Apple or Linux/Android"
#endif

/* PQClean ignores randombytes errors. Abort rather than return unfilled bytes. */
static int fill_csprng(uint8_t *output, size_t n) {
#if defined(__APPLE__)
  return SecRandomCopyBytes(kSecRandomDefault, n, output) == errSecSuccess ? 0 : -1;
#else
  size_t filled = 0;
  while (filled < n) {
#ifdef __NR_getrandom
    const ssize_t got = syscall(__NR_getrandom, output + filled, n - filled, 0);
#elif defined(SYS_getrandom)
    const ssize_t got = syscall(SYS_getrandom, output + filled, n - filled, 0);
#else
#error "getrandom syscall is required"
#endif
    if (got < 0) {
      if (errno == EINTR) {
        continue;
      }
      return -1;
    }
    if (got == 0) {
      return -1;
    }
    filled += (size_t)got;
  }
  return 0;
#endif
}

int randombytes(uint8_t *output, size_t n) {
  if (n == 0) {
    return 0;
  }
  if (output == NULL) {
    return -1;
  }
  if (fill_csprng(output, n) != 0) {
    spectra_secure_wipe(output, n);
    abort();
  }
  return 0;
}

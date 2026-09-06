/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

#ifndef SPECTRA_SECURE_WIPE_H
#define SPECTRA_SECURE_WIPE_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

void spectra_secure_wipe(void *ptr, size_t n);

#ifdef __cplusplus
}
#endif

#endif

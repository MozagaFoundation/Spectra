/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PBKDF2Module, NSObject)

RCT_EXTERN_METHOD(deriveKey:(NSString *)pin
                  salt:(NSString *)salt
                  iterations:(nonnull NSNumber *)iterations
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

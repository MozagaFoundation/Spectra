/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AttachmentFileProtection, NSObject)

RCT_EXTERN_METHOD(
  protectPath:(NSString *)path
  withResolver:(RCTPromiseResolveBlock)resolve
  withRejecter:(RCTPromiseRejectBlock)reject
)

@end

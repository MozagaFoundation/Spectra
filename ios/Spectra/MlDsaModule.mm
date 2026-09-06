/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

#import <React/RCTBridgeModule.h>
#import <SpectraMldsaCore/spectra_mldsa65.h>
#import <SpectraPqCommon/spectra_secure_wipe.h>

#include <stdlib.h>

@interface MlDsaModule : NSObject <RCTBridgeModule>
@end

@implementation MlDsaModule

RCT_EXPORT_MODULE(MlDsaModule)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0);
}

RCT_REMAP_METHOD(
  verify,
  verify:(NSString *)messageBase64
  signature:(NSString *)signatureBase64
  publicKey:(NSString *)publicKeyBase64
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
) {
  (void)reject;
  NSData *message = [[NSData alloc] initWithBase64EncodedString:messageBase64 ?: @"" options:0];
  NSData *signature = [[NSData alloc] initWithBase64EncodedString:signatureBase64 ?: @"" options:0];
  NSData *publicKey = [[NSData alloc] initWithBase64EncodedString:publicKeyBase64 ?: @"" options:0];
  if (message == nil || signature == nil || publicKey == nil) {
    resolve(@NO);
    return;
  }

  const int valid = spectra_mldsa65_verify(
    (const uint8_t *)publicKey.bytes,
    (size_t)publicKey.length,
    (const uint8_t *)signature.bytes,
    (size_t)signature.length,
    (const uint8_t *)message.bytes,
    (size_t)message.length
  );
  resolve(valid ? @YES : @NO);
}

RCT_REMAP_METHOD(
  sign,
  sign:(NSString *)messageBase64
  secretKey:(NSString *)secretKeyBase64
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
) {
  NSData *message = [[NSData alloc] initWithBase64EncodedString:messageBase64 ?: @"" options:0];
  NSMutableData *secretKey = [[NSMutableData alloc] initWithBase64EncodedString:secretKeyBase64 ?: @"" options:0];
  if (message == nil || secretKey == nil || secretKey.length != SPECTRA_MLDSA65_SECRETKEYBYTES) {
    if (secretKey != nil) {
      spectra_secure_wipe(secretKey.mutableBytes, (size_t)secretKey.length);
    }
    reject(@"MLDSA_SIGN", @"native ML-DSA-65 sign failed", nil);
    return;
  }

  uint8_t *signature = (uint8_t *)malloc(SPECTRA_MLDSA65_SIGNATUREBYTES);
  if (signature == NULL) {
    spectra_secure_wipe(secretKey.mutableBytes, (size_t)secretKey.length);
    reject(@"MLDSA_SIGN", @"native ML-DSA-65 sign failed", nil);
    return;
  }
  const int ok = spectra_mldsa65_sign(
    (const uint8_t *)secretKey.mutableBytes,
    SPECTRA_MLDSA65_SECRETKEYBYTES,
    (const uint8_t *)message.bytes,
    (size_t)message.length,
    signature,
    SPECTRA_MLDSA65_SIGNATUREBYTES
  );
  spectra_secure_wipe(secretKey.mutableBytes, (size_t)secretKey.length);
  if (!ok) {
    spectra_secure_wipe(signature, SPECTRA_MLDSA65_SIGNATUREBYTES);
    free(signature);
    reject(@"MLDSA_SIGN", @"native ML-DSA-65 sign failed", nil);
    return;
  }
  NSData *signatureData = [NSData dataWithBytes:signature length:SPECTRA_MLDSA65_SIGNATUREBYTES];
  spectra_secure_wipe(signature, SPECTRA_MLDSA65_SIGNATUREBYTES);
  free(signature);
  resolve([signatureData base64EncodedStringWithOptions:0]);
}

@end

/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

#import <React/RCTBridgeModule.h>
#import <SpectraMlkemCore/spectra_mlkem768.h>
#import <SpectraPqCommon/spectra_secure_wipe.h>

#include <stdlib.h>

@interface MlKemModule : NSObject <RCTBridgeModule>
@end

@implementation MlKemModule

RCT_EXPORT_MODULE(MlKemModule)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0);
}

RCT_REMAP_METHOD(
  generateKeyPair,
  generateKeyPairWithResolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
) {
  uint8_t *public_key = (uint8_t *)malloc(SPECTRA_MLKEM768_PUBLICKEYBYTES);
  uint8_t *secret_key = (uint8_t *)malloc(SPECTRA_MLKEM768_SECRETKEYBYTES);
  if (public_key == NULL || secret_key == NULL) {
    free(public_key);
    free(secret_key);
    reject(@"MLKEM_KEYGEN", @"native ML-KEM-768 keygen failed", nil);
    return;
  }

  const int ok = spectra_mlkem768_keypair(
    public_key,
    SPECTRA_MLKEM768_PUBLICKEYBYTES,
    secret_key,
    SPECTRA_MLKEM768_SECRETKEYBYTES
  );
  if (!ok) {
    spectra_secure_wipe(public_key, SPECTRA_MLKEM768_PUBLICKEYBYTES);
    spectra_secure_wipe(secret_key, SPECTRA_MLKEM768_SECRETKEYBYTES);
    free(public_key);
    free(secret_key);
    reject(@"MLKEM_KEYGEN", @"native ML-KEM-768 keygen failed", nil);
    return;
  }

  NSData *publicKeyData = [NSData dataWithBytes:public_key length:SPECTRA_MLKEM768_PUBLICKEYBYTES];
  NSMutableData *secretKeyData = [NSMutableData dataWithBytes:secret_key length:SPECTRA_MLKEM768_SECRETKEYBYTES];
  spectra_secure_wipe(public_key, SPECTRA_MLKEM768_PUBLICKEYBYTES);
  spectra_secure_wipe(secret_key, SPECTRA_MLKEM768_SECRETKEYBYTES);
  free(public_key);
  free(secret_key);
  NSString *secretKeyBase64 = [secretKeyData base64EncodedStringWithOptions:0];
  spectra_secure_wipe(secretKeyData.mutableBytes, (size_t)secretKeyData.length);
  resolve(@{
    @"publicKey": [publicKeyData base64EncodedStringWithOptions:0],
    @"privateKey": secretKeyBase64,
  });
}

RCT_REMAP_METHOD(
  encapsulate,
  encapsulate:(NSString *)publicKeyBase64
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
) {
  NSData *publicKey = [[NSData alloc] initWithBase64EncodedString:publicKeyBase64 ?: @"" options:0];
  if (publicKey == nil || publicKey.length != SPECTRA_MLKEM768_PUBLICKEYBYTES) {
    reject(@"MLKEM_ENCAPS", @"native ML-KEM-768 encaps failed", nil);
    return;
  }

  uint8_t *ciphertext = (uint8_t *)malloc(SPECTRA_MLKEM768_CIPHERTEXTBYTES);
  uint8_t *shared_secret = (uint8_t *)malloc(SPECTRA_MLKEM768_SHAREDSECRETBYTES);
  if (ciphertext == NULL || shared_secret == NULL) {
    free(ciphertext);
    free(shared_secret);
    reject(@"MLKEM_ENCAPS", @"native ML-KEM-768 encaps failed", nil);
    return;
  }

  const int ok = spectra_mlkem768_encaps(
    (const uint8_t *)publicKey.bytes,
    (size_t)publicKey.length,
    ciphertext,
    SPECTRA_MLKEM768_CIPHERTEXTBYTES,
    shared_secret,
    SPECTRA_MLKEM768_SHAREDSECRETBYTES
  );
  if (!ok) {
    spectra_secure_wipe(shared_secret, SPECTRA_MLKEM768_SHAREDSECRETBYTES);
    free(ciphertext);
    free(shared_secret);
    reject(@"MLKEM_ENCAPS", @"native ML-KEM-768 encaps failed", nil);
    return;
  }

  NSData *ciphertextData = [NSData dataWithBytes:ciphertext length:SPECTRA_MLKEM768_CIPHERTEXTBYTES];
  NSMutableData *sharedSecretData = [NSMutableData dataWithBytes:shared_secret length:SPECTRA_MLKEM768_SHAREDSECRETBYTES];
  spectra_secure_wipe(shared_secret, SPECTRA_MLKEM768_SHAREDSECRETBYTES);
  free(ciphertext);
  free(shared_secret);
  NSString *sharedSecretBase64 = [sharedSecretData base64EncodedStringWithOptions:0];
  spectra_secure_wipe(sharedSecretData.mutableBytes, (size_t)sharedSecretData.length);
  resolve(@{
    @"ciphertext": [ciphertextData base64EncodedStringWithOptions:0],
    @"sharedSecret": sharedSecretBase64,
  });
}

RCT_REMAP_METHOD(
  decapsulate,
  decapsulate:(NSString *)ciphertextBase64
  secretKey:(NSString *)secretKeyBase64
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
) {
  NSData *ciphertext = [[NSData alloc] initWithBase64EncodedString:ciphertextBase64 ?: @"" options:0];
  NSMutableData *secretKey = [[NSMutableData alloc] initWithBase64EncodedString:secretKeyBase64 ?: @"" options:0];
  if (
    ciphertext == nil
    || secretKey == nil
    || ciphertext.length != SPECTRA_MLKEM768_CIPHERTEXTBYTES
    || secretKey.length != SPECTRA_MLKEM768_SECRETKEYBYTES
  ) {
    if (secretKey != nil) {
      spectra_secure_wipe(secretKey.mutableBytes, (size_t)secretKey.length);
    }
    reject(@"MLKEM_DECAPS", @"native ML-KEM-768 decaps failed", nil);
    return;
  }

  uint8_t *shared_secret = (uint8_t *)malloc(SPECTRA_MLKEM768_SHAREDSECRETBYTES);
  if (shared_secret == NULL) {
    spectra_secure_wipe(secretKey.mutableBytes, (size_t)secretKey.length);
    reject(@"MLKEM_DECAPS", @"native ML-KEM-768 decaps failed", nil);
    return;
  }
  const int ok = spectra_mlkem768_decaps(
    (const uint8_t *)secretKey.mutableBytes,
    SPECTRA_MLKEM768_SECRETKEYBYTES,
    (const uint8_t *)ciphertext.bytes,
    (size_t)ciphertext.length,
    shared_secret,
    SPECTRA_MLKEM768_SHAREDSECRETBYTES
  );
  spectra_secure_wipe(secretKey.mutableBytes, (size_t)secretKey.length);
  if (!ok) {
    spectra_secure_wipe(shared_secret, SPECTRA_MLKEM768_SHAREDSECRETBYTES);
    free(shared_secret);
    reject(@"MLKEM_DECAPS", @"native ML-KEM-768 decaps failed", nil);
    return;
  }
  NSMutableData *sharedSecretData = [NSMutableData dataWithBytes:shared_secret length:SPECTRA_MLKEM768_SHAREDSECRETBYTES];
  spectra_secure_wipe(shared_secret, SPECTRA_MLKEM768_SHAREDSECRETBYTES);
  free(shared_secret);
  NSString *sharedSecretBase64 = [sharedSecretData base64EncodedStringWithOptions:0];
  spectra_secure_wipe(sharedSecretData.mutableBytes, (size_t)sharedSecretData.length);
  resolve(sharedSecretBase64);
}

@end

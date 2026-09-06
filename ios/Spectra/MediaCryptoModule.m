/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MediaCryptoModule, NSObject)

RCT_EXTERN_METHOD(sha256:(NSString *)data
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sha256File:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(encryptAesGcm:(NSString *)key
                  plaintext:(NSString *)plaintext
                  associatedData:(NSString *)associatedData
                  jobId:(NSString *)jobId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(encryptAesGcmFile:(NSString *)key
                  plaintextPath:(NSString *)plaintextPath
                  destCiphertextPath:(NSString *)destCiphertextPath
                  associatedData:(NSString *)associatedData
                  jobId:(NSString *)jobId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(decryptAesGcm:(NSString *)key
                  ciphertext:(NSString *)ciphertext
                  nonce:(NSString *)nonce
                  tag:(NSString *)tag
                  associatedData:(NSString *)associatedData
                  jobId:(NSString *)jobId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(decryptAesGcmFile:(NSString *)key
                  ciphertextPath:(NSString *)ciphertextPath
                  destPlaintextPath:(NSString *)destPlaintextPath
                  nonce:(NSString *)nonce
                  tag:(NSString *)tag
                  associatedData:(NSString *)associatedData
                  jobId:(NSString *)jobId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(writeMediaBlob:(NSString *)headerJson
                  ciphertextPath:(NSString *)ciphertextPath
                  nonce:(NSString *)nonce
                  tag:(NSString *)tag
                  destPath:(NSString *)destPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(decryptMediaBlobFile:(NSString *)key
                  blobPath:(NSString *)blobPath
                  destPlaintextPath:(NSString *)destPlaintextPath
                  associatedData:(NSString *)associatedData
                  jobId:(NSString *)jobId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deriveSafetyNumberFingerprint:(NSString *)keyMaterial
                  identityId:(NSString *)identityId
                  version:(NSInteger)version
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancel:(NSString *)jobId)

RCT_EXTERN_METHOD(cancelAll)

@end

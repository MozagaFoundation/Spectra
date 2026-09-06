/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

#import <QuartzCore/QuartzCore.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <SpectraVdfCore/spectra_vdf_core.h>

#include <atomic>
#include <cmath>
#include <vector>

@class VdfModule;

@interface SpectraVdfJob : NSObject {
@public
  std::atomic_bool cancelled;
  CFTimeInterval lastProgressAt;
}
@property(nonatomic, copy) NSString *jobId;
@property(nonatomic, copy) NSString *phase;
@property(nonatomic, weak) VdfModule *module;
@end

@implementation SpectraVdfJob
- (instancetype)init {
  self = [super init];
  if (self != nil) {
    cancelled.store(false);
    lastProgressAt = 0;
  }
  return self;
}
@end

@interface VdfModule : RCTEventEmitter <RCTBridgeModule>
@property(nonatomic, strong) dispatch_queue_t workerQueue;
@property(nonatomic, strong) SpectraVdfJob *activeJob;
- (void)emitProgressForJob:(NSString *)jobId
                 completed:(uint32_t)completed
                      total:(uint32_t)total;
@end

static int vdfIsCancelled(void *context) {
  SpectraVdfJob *job = (__bridge SpectraVdfJob *)context;
  return job != nil && job->cancelled.load(std::memory_order_relaxed);
}

static void vdfProgress(
  void *context,
  uint32_t completedIterations,
  uint32_t totalIterations
) {
  SpectraVdfJob *job = (__bridge SpectraVdfJob *)context;
  if (job == nil) return;
  const CFTimeInterval now = CACurrentMediaTime();
  if (
    completedIterations != totalIterations &&
    job->lastProgressAt > 0 &&
    now - job->lastProgressAt < 0.25
  ) {
    return;
  }
  job->lastProgressAt = now;
  dispatch_async(dispatch_get_main_queue(), ^{
    [job.module emitProgressForJob:job.jobId
                        completed:completedIterations
                             total:totalIterations];
  });
}

@implementation VdfModule

RCT_EXPORT_MODULE(VdfModule)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  self = [super init];
  if (self != nil) {
    _workerQueue = dispatch_queue_create("org.spectramozaga.vdf", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[@"SpectraVdfProgress"];
}

RCT_REMAP_METHOD(
  evaluate,
  evaluate:(NSString *)jobId
  modulusHex:(NSString *)modulusHex
  baseHex:(NSString *)baseHex
  iterations:(nonnull NSNumber *)iterations
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
) {
  [self runJob:jobId
    modulusHex:modulusHex
       baseHex:baseHex
      primeHex:nil
    iterations:iterations
       resolve:resolve
        reject:reject];
}

RCT_REMAP_METHOD(
  prove,
  prove:(NSString *)jobId
  modulusHex:(NSString *)modulusHex
  baseHex:(NSString *)baseHex
  primeHex:(NSString *)primeHex
  iterations:(nonnull NSNumber *)iterations
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
) {
  [self runJob:jobId
    modulusHex:modulusHex
       baseHex:baseHex
      primeHex:primeHex
    iterations:iterations
       resolve:resolve
        reject:reject];
}

RCT_EXPORT_METHOD(cancel:(NSString *)jobId) {
  @synchronized(self) {
    SpectraVdfJob *job = self.activeJob;
    if ([job.jobId isEqualToString:jobId]) {
      job->cancelled.store(true, std::memory_order_relaxed);
    }
  }
}

- (void)invalidate {
  @synchronized(self) {
    SpectraVdfJob *job = self.activeJob;
    if (job != nil) job->cancelled.store(true, std::memory_order_relaxed);
  }
  [super invalidate];
}

- (void)emitProgressForJob:(NSString *)jobId
                 completed:(uint32_t)completed
                      total:(uint32_t)total {
  NSString *phase;
  @synchronized(self) {
    SpectraVdfJob *job = self.activeJob;
    if (![job.jobId isEqualToString:jobId]) return;
    phase = job.phase;
  }
  [self sendEventWithName:@"SpectraVdfProgress"
                     body:@{
                       @"jobId": jobId,
                       @"phase": phase ?: @"evaluate",
                       @"completedIterations": @(completed),
                       @"totalIterations": @(total),
                     }];
}

- (void)runJob:(NSString *)jobId
     modulusHex:(NSString *)modulusHex
        baseHex:(NSString *)baseHex
       primeHex:(NSString *)primeHex
     iterations:(NSNumber *)iterations
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject {
  const double rawIterations = iterations.doubleValue;
  if (
    ![self isValidJobId:jobId] ||
    !std::isfinite(rawIterations) ||
    std::floor(rawIterations) != rawIterations ||
    rawIterations < 1 ||
    rawIterations > 20000000
  ) {
    reject(@"ERR_VDF_INPUT", @"Invalid VDF request", nil);
    return;
  }
  SpectraVdfJob *job = [SpectraVdfJob new];
  job.jobId = jobId;
  job.phase = primeHex == nil ? @"evaluate" : @"prove";
  job.module = self;
  @synchronized(self) {
    if (self.activeJob != nil) {
      reject(@"ERR_VDF_BUSY", @"Another VDF solve is already running", nil);
      return;
    }
    self.activeJob = job;
  }
  dispatch_async(self.workerQueue, ^{
    const NSUInteger outputCapacity = modulusHex.length + 1;
    std::vector<char> output(outputCapacity);
    const spectra_vdf_status status = primeHex == nil
      ? spectra_vdf_evaluate(
          modulusHex.UTF8String,
          baseHex.UTF8String,
          static_cast<uint32_t>(rawIterations),
          output.data(),
          output.size(),
          (__bridge void *)job,
          vdfIsCancelled,
          vdfProgress
        )
      : spectra_vdf_prove(
          modulusHex.UTF8String,
          baseHex.UTF8String,
          primeHex.UTF8String,
          static_cast<uint32_t>(rawIterations),
          output.data(),
          output.size(),
          (__bridge void *)job,
          vdfIsCancelled,
          vdfProgress
        );
    dispatch_async(dispatch_get_main_queue(), ^{
      @synchronized(self) {
        if (self.activeJob == job) self.activeJob = nil;
      }
      if (status == SPECTRA_VDF_STATUS_OK) {
        resolve([NSString stringWithUTF8String:output.data()]);
      } else if (status == SPECTRA_VDF_STATUS_CANCELLED) {
        reject(@"ERR_VDF_CANCELLED", @"VDF solving was cancelled", nil);
      } else if (status == SPECTRA_VDF_STATUS_INVALID_INPUT) {
        reject(@"ERR_VDF_INPUT", @"Native VDF rejected the request", nil);
      } else {
        reject(@"ERR_VDF_NATIVE", @"Native VDF solve failed", nil);
      }
    });
  });
}

- (BOOL)isValidJobId:(NSString *)jobId {
  if (jobId.length == 0 || jobId.length > 128) return NO;
  return
    [jobId rangeOfString:@"\0"].location == NSNotFound &&
    [jobId rangeOfCharacterFromSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]].location ==
      NSNotFound;
}

@end

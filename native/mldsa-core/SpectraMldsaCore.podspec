require 'json'

Pod::Spec.new do |s|
  s.name             = 'SpectraMldsaCore'
  s.version          = '1.0.0'
  s.summary          = 'PQClean FIPS 204 ML-DSA-65 verify and sign for Spectra.'
  s.homepage         = 'https://mozaga.org'
  s.license          = { type: 'AGPL-3.0-only OR LicenseRef-Spectra-Commercial' }
  s.authors          = { 'MOZAGA FOUNDATION' => 'security@mozaga.org' }
  s.source           = { git: '' }
  s.platform         = :ios, '15.1'
  s.dependency 'SpectraPqCommon'
  s.source_files     = [
    'spectra_mldsa65.{c,h}',
    'vendor/pqclean/common/crypto_declassify.h',
    'vendor/pqclean/common/randombytes.h',
    'vendor/pqclean/crypto_sign/ml-dsa-65/clean/*.{c,h}',
  ]
  s.exclude_files    = 'vendor/pqclean/common/fips202.{c,h}'
  s.public_header_files = 'spectra_mldsa65.h'
  s.pod_target_xcconfig = {
    'CLANG_C_LANGUAGE_STANDARD' => 'c99',
    'GCC_OPTIMIZATION_LEVEL' => '3',
    'GCC_SYMBOLS_PRIVATE_EXTERN' => 'YES',
    'GCC_INLINES_ARE_PRIVATE_EXTERN' => 'YES',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/../pq-common" "${PODS_TARGET_SRCROOT}/vendor/pqclean/common" "${PODS_TARGET_SRCROOT}/vendor/pqclean/crypto_sign/ml-dsa-65/clean" "${PODS_ROOT}/Headers/Public/SpectraPqCommon"',
    'OTHER_CFLAGS' => '$(inherited) -include "${PODS_TARGET_SRCROOT}/../pq-common/fips202_prefix.h"',
  }
end

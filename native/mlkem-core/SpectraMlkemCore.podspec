require 'json'

Pod::Spec.new do |s|
  s.name             = 'SpectraMlkemCore'
  s.version          = '1.0.0'
  s.summary          = 'PQClean FIPS 203 ML-KEM-768 keygen/encaps/decaps for Spectra.'
  s.homepage         = 'https://mozaga.org'
  s.license          = { type: 'AGPL-3.0-only OR LicenseRef-Spectra-Commercial' }
  s.authors          = { 'MOZAGA FOUNDATION' => 'security@mozaga.org' }
  s.source           = { git: '' }
  s.platform         = :ios, '15.1'
  s.dependency 'SpectraPqCommon'
  s.source_files     = [
    'spectra_mlkem768.{c,h}',
    'vendor/pqclean/common/compat.h',
    'vendor/pqclean/common/crypto_declassify.h',
    'vendor/pqclean/common/randombytes.h',
    'vendor/pqclean/crypto_kem/ml-kem-768/clean/*.{c,h}',
  ]
  s.exclude_files    = 'vendor/pqclean/common/fips202.{c,h}'
  s.public_header_files = 'spectra_mlkem768.h'
  s.pod_target_xcconfig = {
    'CLANG_C_LANGUAGE_STANDARD' => 'c99',
    'GCC_OPTIMIZATION_LEVEL' => '3',
    'GCC_SYMBOLS_PRIVATE_EXTERN' => 'YES',
    'GCC_INLINES_ARE_PRIVATE_EXTERN' => 'YES',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/../pq-common" "${PODS_TARGET_SRCROOT}/vendor/pqclean/common" "${PODS_TARGET_SRCROOT}/vendor/pqclean/crypto_kem/ml-kem-768/clean" "${PODS_ROOT}/Headers/Public/SpectraPqCommon"',
    'OTHER_CFLAGS' => '$(inherited) -include "${PODS_TARGET_SRCROOT}/../pq-common/fips202_prefix.h"',
  }
end

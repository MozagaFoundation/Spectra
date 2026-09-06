require 'json'

Pod::Spec.new do |s|
  s.name             = 'SpectraPqCommon'
  s.version          = '1.0.0'
  s.summary          = 'Shared CSPRNG, wipe, and FIPS 202 for Spectra post-quantum native cores.'
  s.homepage         = 'https://mozaga.org'
  s.license          = { type: 'AGPL-3.0-only OR LicenseRef-Spectra-Commercial' }
  s.authors          = { 'MOZAGA FOUNDATION' => 'security@mozaga.org' }
  s.source           = { git: '' }
  s.platform         = :ios, '15.1'
  s.source_files     = [
    'randombytes_platform.c',
    'randombytes.h',
    'spectra_secure_wipe.{c,h}',
    'fips202.{c,h}',
    'fips202_prefix.h',
  ]
  s.public_header_files = 'spectra_secure_wipe.h', 'randombytes.h'
  s.frameworks = 'Security'
  s.pod_target_xcconfig = {
    'CLANG_C_LANGUAGE_STANDARD' => 'c99',
    'GCC_OPTIMIZATION_LEVEL' => '3',
    'GCC_SYMBOLS_PRIVATE_EXTERN' => 'YES',
    'GCC_INLINES_ARE_PRIVATE_EXTERN' => 'YES',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}"',
    # Quoted vendor includes ignore HEADER_SEARCH_PATHS; force the prefix.
    'OTHER_CFLAGS' => '$(inherited) -include "${PODS_TARGET_SRCROOT}/fips202_prefix.h"',
  }
end

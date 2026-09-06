require 'json'

Pod::Spec.new do |s|
  s.name             = 'SpectraVdfCore'
  s.version          = '1.0.0'
  s.summary          = 'Portable native arithmetic for Spectra VDF evaluation.'
  s.homepage         = 'https://mozaga.org'
  s.license          = { type: 'AGPL-3.0-only OR LicenseRef-Spectra-Commercial' }
  s.authors          = { 'MOZAGA FOUNDATION' => 'security@mozaga.org' }
  s.source           = { git: '' }
  s.platform         = :ios, '15.1'
  s.source_files     = 'spectra_vdf_core.{c,h}', 'vendor/libtommath/*.{c,h}'
  s.public_header_files = 'spectra_vdf_core.h'
  s.pod_target_xcconfig = {
    'CLANG_C_LANGUAGE_STANDARD' => 'c11',
    'GCC_OPTIMIZATION_LEVEL' => '3',
  }
end

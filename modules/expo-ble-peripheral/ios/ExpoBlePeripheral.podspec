require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoBlePeripheral'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.homepage       = package['homepage']
  s.license        = package['license']
  s.author         = package['author']
  s.source         = { git: '' }
  s.platform       = :ios, '15.0'
  s.swift_version  = '5.4'
  s.source_files   = '**/*.swift'
  s.frameworks     = 'CoreBluetooth'

  s.dependency 'ExpoModulesCore'
end

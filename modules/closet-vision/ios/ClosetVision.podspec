Pod::Spec.new do |s|
  s.name           = 'ClosetVision'
  s.version        = '1.0.0'
  s.summary        = 'On-device image analysis for Closet'
  s.description    = 'Wraps the iOS Vision framework: person detection for avatar photos.'
  s.license        = 'UNLICENSED'
  s.author         = 'Closet'
  s.homepage       = 'https://github.com/mlcousek/Closet'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/mlcousek/Closet.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

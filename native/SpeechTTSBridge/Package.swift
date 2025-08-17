// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "SpeechTTSBridge",
  platforms: [ .macOS(.v12) ],
  products: [
    .executable(name: "SpeechTTSBridge", targets: ["SpeechTTSBridge"]) 
  ],
  targets: [
    .executableTarget(
      name: "SpeechTTSBridge",
      path: "Sources"
    )
  ]
)



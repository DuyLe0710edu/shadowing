// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AppleTranslateBridge",
    platforms: [
        .macOS(.v15) // Required for Translation framework
    ],
    products: [
        .executable(
            name: "AppleTranslateBridge",
            targets: ["AppleTranslateBridge"]
        ),
    ],
    targets: [
        .executableTarget(
            name: "AppleTranslateBridge",
            dependencies: []
        ),
    ]
)
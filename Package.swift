// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Upward",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Upward", targets: ["Upward"])],
    targets: [
        .target(name: "UpwardCore"),
        .executableTarget(name: "Upward", dependencies: ["UpwardCore"], linkerSettings: [
            .linkedFramework("AppKit"), .linkedFramework("IOKit")
        ]),
        .testTarget(name: "UpwardCoreTests", dependencies: ["UpwardCore"])
    ],
    swiftLanguageModes: [.v5]
)

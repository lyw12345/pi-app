// swift-tools-version: 5.9
import PackageDescription

// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "PiWorkbench",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(
      name: "PiWorkbench",
      path: "Sources/PiWorkbench"
    ),
    // Test target requires Xcode (XCTest not included in CommandLineTools).
    // Run tests with: swift test --specifier macosx (requires Xcode installed).
    .testTarget(
      name: "PiWorkbenchTests",
      dependencies: ["PiWorkbench"],
      path: "Tests/PiWorkbenchTests"
    ),
  ]
)

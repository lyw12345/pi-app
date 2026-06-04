import AppKit
import Foundation

enum ServerState: Equatable {
  case idle
  case starting
  case ready
  case failed(String)
}

@MainActor
final class ServerManager: ObservableObject {
  static let shared = ServerManager()

  @Published private(set) var state: ServerState = .idle
  @Published private(set) var webURL = URL(string: "http://127.0.0.1:30141/")!

  private var process: Process?
  private var deepLinkSessionId: String?
  private weak var webViewRef: PiWebView?

  private let port: Int
  private let host = "127.0.0.1"
  private let piWebRoot: URL
  private let nodeURL: URL?

  private init() {
    port = Int(ProcessInfo.processInfo.environment["PORT"] ?? "30141") ?? 30141
    piWebRoot = Self.resolvePiWebRoot()
    nodeURL = Self.resolveNode()
    webURL = URL(string: "http://\(host):\(port)/")!
  }

  func attachWebView(_ webView: PiWebView) {
    webViewRef = webView
    if let sessionId = deepLinkSessionId {
      deepLinkSessionId = nil
      loadSession(sessionId, in: webView)
    }
  }

  func navigateToSession(_ sessionId: String) {
    if let webView = webViewRef {
      loadSession(sessionId, in: webView)
    } else {
      deepLinkSessionId = sessionId
    }
  }

  private func loadSession(_ sessionId: String, in webView: PiWebView) {
    var components = URLComponents(url: webURL, resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "session", value: sessionId)]
    if let url = components.url {
      webView.load(url)
    }
  }

  func start() async {
    state = .starting
    stop()
    if let message = spawn() {
      state = .failed(message)
      return
    }
    let ok = await waitForHealth(timeoutSeconds: 60)
    if ok {
      state = .ready
    } else {
      stop()
      state = .failed("pi-web 在 60 秒内未就绪，请检查端口 \(port) 是否被占用")
    }
  }

  func restart() async {
    await start()
    if case .ready = state, let webView = webViewRef {
      webView.load(webURL)
    }
  }

  func stop() {
    if let process, process.isRunning {
      process.terminate()
      process.waitUntilExit()
    }
    process = nil
  }

  func openAgentDirectory() {
    let agentDir = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent(".pi/agent", isDirectory: true)
    try? FileManager.default.createDirectory(at: agentDir, withIntermediateDirectories: true)
    NSWorkspace.shared.open(agentDir)
  }

  func showAbout() async {
    let healthURL = URL(string: "http://\(host):\(port)/api/health")!
    var piWebVersion = "—"
    var piVersion = "—"
    if let (data, _) = try? await URLSession.shared.data(from: healthURL),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      if let v = json["version"] as? String { piWebVersion = v }
      if let v = json["piVersion"] as? String { piVersion = v }
    }
    let alert = NSAlert()
    alert.messageText = "Pi Workbench"
    alert.informativeText = "pi-web \(piWebVersion)\n@mariozechner/pi-coding-agent \(piVersion)"
    alert.alertStyle = .informational
    alert.addButton(withTitle: "好")
    alert.runModal()
  }

  /// Returns an error message on failure, nil on success.
  private func spawn() -> String? {
    let script = piWebRoot.appendingPathComponent("bin/pi-web.js")
    let fm = FileManager.default
    guard fm.fileExists(atPath: script.path) else {
      return "未找到 pi-web：\(script.path)\n请用 ditto 重新安装 Pi.app"
    }
    guard let nodeURL else {
      return "未找到 Node。请用最新 dist/macos/Pi.app 覆盖安装（内嵌 Node）"
    }
    guard fm.fileExists(atPath: nodeURL.path) else {
      return "未找到 Node：\(nodeURL.path)"
    }

    let proc = Process()
    proc.executableURL = nodeURL
    proc.arguments = [script.path]
    var env = ProcessInfo.processInfo.environment
    env["HOST"] = host
    env["PORT"] = String(port)
    env["NODE"] = nodeURL.path
    proc.environment = env
    proc.currentDirectoryURL = piWebRoot
    do {
      try proc.run()
      process = proc
      return nil
    } catch {
      return "启动 pi-web 失败：\(error.localizedDescription)"
    }
  }

  private func waitForHealth(timeoutSeconds: Int) async -> Bool {
    let deadline = Date().addingTimeInterval(TimeInterval(timeoutSeconds))
    let healthURL = URL(string: "http://\(host):\(port)/api/health")!
    while Date() < deadline {
      if await probeHealth(url: healthURL) { return true }
      try? await Task.sleep(nanoseconds: 500_000_000)
    }
    return false
  }

  private func probeHealth(url: URL) async -> Bool {
    var request = URLRequest(url: url)
    request.timeoutInterval = 2
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return false }
      guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
      return json["ok"] as? Bool == true
    } catch {
      return false
    }
  }

  private static func resourcesURL() -> URL? {
    if let url = Bundle.main.resourceURL {
      return url
    }
    let bundlePath = Bundle.main.bundlePath
    guard !bundlePath.isEmpty else { return nil }
    return URL(fileURLWithPath: bundlePath, isDirectory: true)
      .appendingPathComponent("Contents/Resources", isDirectory: true)
  }

  private static func bundledPiWebRoot() -> URL? {
    guard let resources = resourcesURL() else { return nil }
    let root = resources.appendingPathComponent("pi-web", isDirectory: true)
    let script = root.appendingPathComponent("bin/pi-web.js")
    if FileManager.default.fileExists(atPath: script.path) {
      return root.standardizedFileURL
    }
    return nil
  }

  private static func bundledNodeURL() -> URL? {
    guard let resources = resourcesURL() else { return nil }
    let node = resources
      .appendingPathComponent("node", isDirectory: true)
      .appendingPathComponent("bin/node")
    if FileManager.default.fileExists(atPath: node.path) {
      return node
    }
    return nil
  }

  private static func isAppBundle() -> Bool {
    Bundle.main.bundlePath.hasSuffix(".app")
  }

  private static func resolvePiWebRoot() -> URL {
    if let bundled = bundledPiWebRoot() {
      return bundled
    }
    if !isAppBundle(),
       let raw = ProcessInfo.processInfo.environment["PI_WEB_ROOT"],
       !raw.isEmpty
    {
      return URL(fileURLWithPath: raw, isDirectory: true)
    }
    let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
    let candidates = [
      cwd.appendingPathComponent("../..", isDirectory: true),
      cwd.appendingPathComponent("..", isDirectory: true),
      cwd,
    ]
    for url in candidates {
      let script = url.appendingPathComponent("bin/pi-web.js")
      if FileManager.default.fileExists(atPath: script.path) {
        return url.standardizedFileURL
      }
    }
    return cwd
  }

  private static func resolveNode() -> URL? {
    if let bundled = bundledNodeURL() {
      return bundled
    }
    if !isAppBundle(),
       let raw = ProcessInfo.processInfo.environment["NODE"],
       !raw.isEmpty
    {
      let url = URL(fileURLWithPath: raw)
      if FileManager.default.fileExists(atPath: url.path) { return url }
    }
    let candidates = [
      "/opt/homebrew/bin/node",
      "/usr/local/bin/node",
      "/usr/bin/node",
    ]
    for path in candidates {
      if FileManager.default.isExecutableFile(atPath: path) {
        return URL(fileURLWithPath: path)
      }
    }
    for dir in ProcessInfo.processInfo.environment["PATH"]?.split(separator: ":") ?? [] {
      let url = URL(fileURLWithPath: String(dir)).appendingPathComponent("node")
      if FileManager.default.isExecutableFile(atPath: url.path) { return url }
    }
    return nil
  }
}

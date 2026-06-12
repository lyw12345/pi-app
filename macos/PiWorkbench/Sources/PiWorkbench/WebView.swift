import SwiftUI
import WebKit

final class PiWebView: WKWebView, WKNavigationDelegate {
  private let bridge: PiNativeBridge

  static func make() -> PiWebView {
    let config = WKWebViewConfiguration()
    let controller = WKUserContentController()
    let script = WKUserScript(
      source: PiNativeBridge.injectionScript,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: true
    )
    controller.addUserScript(script)
    config.userContentController = controller

    let bridge = PiNativeBridge()
    let webView = PiWebView(bridge: bridge, configuration: config)
    controller.add(bridge, name: "piNative")
    bridge.webView = webView
    return webView
  }

  private init(bridge: PiNativeBridge, configuration: WKWebViewConfiguration) {
    self.bridge = bridge
    super.init(frame: .zero, configuration: configuration)
    navigationDelegate = self
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func load(_ url: URL) {
    load(URLRequest(url: url))
  }

  // MARK: - WKNavigationDelegate

  nonisolated func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    // Allow the initial page load and same-origin navigations.
    guard let requestURL = navigationAction.request.url,
          navigationAction.navigationType == .linkActivated
    else {
      decisionHandler(.allow)
      return
    }

    // Only intercept external URLs (not our own server).
    guard let serverURL = webView.url, requestURL.host != serverURL.host || requestURL.port != serverURL.port else {
      decisionHandler(.allow)
      return
    }

    // Open external links in the system default browser.
    Task { @MainActor in
      NSWorkspace.shared.open(requestURL)
    }
    decisionHandler(.cancel)
  }
}

struct WebViewRepresentable: NSViewRepresentable {
  @EnvironmentObject private var server: ServerManager
  private let webView = PiWebView.make()

  func makeNSView(context: Context) -> PiWebView {
    server.attachWebView(webView)
    return webView
  }

  func updateNSView(_ nsView: PiWebView, context: Context) {
    guard case .ready = server.state else { return }
    if nsView.url == nil {
      nsView.load(server.webURL)
    }
  }
}

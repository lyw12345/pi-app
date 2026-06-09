import Foundation
import WebKit

/// Hidden WKWebView used to fetch URLs for the web-fetch extension (P4).
///
/// Shares the WKProcessPool with the main `PiWebView` so cookies and storage
/// are shared. The fetcher is never visible to the user.
@MainActor
final class HiddenWebFetcher: NSObject, WKNavigationDelegate {
  private let webView: WKWebView
  private var continuation: CheckedContinuation<WebFetchResult, Error>?
  private var timeoutTask: Task<Void, Never>?
  private var options: WebFetchOptions?

  struct WebFetchOptions {
    var waitUntil: String  // "load" | "domcontentloaded" | "networkidle"
    var timeoutMs: Int
  }

  struct WebFetchResult {
    var markdown: String
    var length: Int
    var title: String
    var finalUrl: String
  }

  /// JS extractor script: walks the accessibility tree, returns flat Markdown.
  /// Injected at document end on the hidden WebView.
  static let extractorScript = """
  (function() {
    // Wait for network idle if needed
    function extract() {
      const out = [];
      function walk(node, depth) {
        if (!node) return;
        const role = node.getAttribute('role') || node.tagName.toLowerCase();
        const text = (node.innerText || '').trim();
        if (node.tagName === 'H1' || role === 'heading' && node.getAttribute('aria-level') === '1') {
          out.push('# ' + text);
          out.push('');
        } else if (/^H[2-6]$/.test(node.tagName)) {
          const level = parseInt(node.tagName[1], 10);
          out.push('#'.repeat(level) + ' ' + text);
          out.push('');
        } else if (node.tagName === 'A' && text) {
          out.push('[' + text + ']');
        } else if (node.tagName === 'BUTTON' && text) {
          out.push('[Button] ' + text);
        } else if (node.tagName === 'IMG' && node.alt) {
          out.push('![' + node.alt + ']()');
        } else if (node.tagName === 'LI' && text) {
          out.push('- ' + text);
        } else if (node.tagName === 'P' && text) {
          out.push(text);
          out.push('');
        } else if (text && text.length > 1 && depth < 3) {
          // Generic content at low depth
          out.push(text);
        }
        for (const child of node.children) walk(child, depth + 1);
      }
      walk(document.body, 0);
      const md = out.join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
      return {
        markdown: md,
        length: md.length,
        title: document.title,
        finalUrl: location.href
      };
    }
    window.__webFetchResult = extract();
  })();
  """

  /// Shared WKProcessPool so cookies/storage are shared with the main web view.
  static let sharedProcessPool = WKProcessPool()

  override init() {
    let config = WKWebViewConfiguration()
    config.processPool = Self.sharedProcessPool
    let controller = WKUserContentController()
    let script = WKUserScript(
      source: Self.extractorScript,
      injectionTime: .atDocumentEnd,
      forMainFrameOnly: true
    )
    controller.addUserScript(script)
    config.userContentController = controller
    self.webView = WKWebView(frame: .zero, configuration: config)
    super.init()
    webView.navigationDelegate = self
  }

  /// Fetch the URL and return its extracted content.
  /// Throws on timeout, navigation failure, or extractor returning null.
  func fetch(url: URL, options: WebFetchOptions) async throws -> WebFetchResult {
    // Cancel any in-flight request
    if let cont = continuation {
      cont.resume(throwing: CancellationError())
      continuation = nil
    }
    webView.stopLoading()

    self.options = options

    return try await withCheckedThrowingContinuation { cont in
      self.continuation = cont
      self.timeoutTask?.cancel()
      self.timeoutTask = Task { [weak self] in
        try? await Task.sleep(nanoseconds: UInt64(options.timeoutMs) * 1_000_000)
        guard let self = self else { return }
        if let cont = self.continuation {
          self.continuation = nil
          cont.resume(throwing: NSError(
            domain: "HiddenWebFetcher",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "fetch timeout after \(options.timeoutMs)ms"]
          ))
          self.webView.stopLoading()
        }
      }
      webView.load(URLRequest(url: url))
    }
  }

  // MARK: - WKNavigationDelegate

  nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    Task { @MainActor in
      // For "load" mode, run extractor immediately.
      // For "domcontentloaded", we already got here. For "networkidle", wait a bit.
      let wait = self.options?.waitUntil ?? "networkidle"
      if wait == "networkidle" {
        // Poll for network idle
        try? await Task.sleep(nanoseconds: 500_000_000)  // 500ms grace
        self.runExtractor()
      } else {
        self.runExtractor()
      }
    }
  }

  nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    Task { @MainActor in
      self.resume(error: error)
    }
  }

  nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    Task { @MainActor in
      self.resume(error: error)
    }
  }

  private func runExtractor() {
    webView.evaluateJavaScript("JSON.stringify(window.__webFetchResult || {})") { [weak self] result, error in
      guard let self = self else { return }
      if let error = error {
        self.resume(error: error)
        return
      }
      guard let json = result as? String, let data = json.data(using: .utf8) else {
        self.resume(error: NSError(
          domain: "HiddenWebFetcher",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "extractor returned no result"]
        ))
        return
      }
      do {
        guard
          let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let markdown = obj["markdown"] as? String,
          let length = obj["length"] as? Int,
          let title = obj["title"] as? String,
          let finalUrl = obj["finalUrl"] as? String
        else {
          self.resume(error: NSError(
            domain: "HiddenWebFetcher",
            code: 3,
            userInfo: [NSLocalizedDescriptionKey: "extractor returned malformed data"]
          ))
          return
        }
        let result = WebFetchResult(
          markdown: markdown,
          length: length,
          title: title,
          finalUrl: finalUrl
        )
        self.resume(success: result)
      } catch {
        self.resume(error: error)
      }
    }
  }

  private func resume(success result: WebFetchResult) {
    timeoutTask?.cancel()
    timeoutTask = nil
    if let cont = continuation {
      continuation = nil
      cont.resume(returning: result)
    }
  }

  private func resume(error err: Error) {
    timeoutTask?.cancel()
    timeoutTask = nil
    if let cont = continuation {
      continuation = nil
      cont.resume(throwing: err)
    }
  }
}

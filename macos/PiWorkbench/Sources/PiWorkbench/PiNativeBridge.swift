import AppKit
import UserNotifications
import WebKit

@MainActor
final class PiNativeBridge: NSObject, WKScriptMessageHandler {
  weak var webView: WKWebView?
  private let hiddenFetcher = HiddenWebFetcher()

  static let injectionScript = """
  (function() {
    if (window.piNative && window.piNative.version) return;
    const pending = new Map();
    let seq = 0;
    function call(method, args) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        window.webkit.messageHandlers.piNative.postMessage({ id, method, args: args || {} });
      });
    }
    window.__piNativeResolve = function(id, result, error) {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    };
    window.piNative = {
      version: "0.1.0",
      pickWorkspaceDirectory: () => call("pickWorkspaceDirectory"),
      pickFiles: () => call("pickFiles"),
      showNotification: (input) => { call("showNotification", input); },
      openPath: (path) => call("openPath", { path }),
      restartServer: () => call("restartServer"),
      webFetch: (url, options) => call("webFetch", { url, options: options || {} }),
      preventSleep: () => call("preventSleep"),
      allowSleep: () => call("allowSleep"),
      setKeepAwakeAlways: (enabled) => call("setKeepAwakeAlways", { enabled: !!enabled }),
      getPowerState: () => call("getPowerState"),
    };
  })();
  """

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "piNative",
          let body = message.body as? [String: Any],
          let id = body["id"] as? Int,
          let method = body["method"] as? String
    else { return }

    let args = body["args"] as? [String: Any] ?? [:]

    Task { @MainActor in
      do {
        let result = try await self.handle(method: method, args: args)
        self.resolve(id: id, result: result, error: nil)
      } catch {
        self.resolve(id: id, result: nil, error: error.localizedDescription)
      }
    }
  }

  @MainActor
  private func handle(method: String, args: [String: Any]) async throws -> Any? {
    switch method {
    case "pickWorkspaceDirectory":
      return await pickWorkspaceDirectory()
    case "pickFiles":
      return await pickFiles()
    case "showNotification":
      showNotification(args: args)
      return nil
    case "openPath":
      if let path = args["path"] as? String {
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
      }
      return nil
    case "restartServer":
      await ServerManager.shared.restart()
      return nil
    case "webFetch":
      return try await webFetch(args: args)
    case "preventSleep":
      PowerAssertionManager.shared.acquire(mode: .autoTask)
      return nil
    case "allowSleep":
      PowerAssertionManager.shared.release(currentMode: .none)
      return nil
    case "setKeepAwakeAlways":
      let enabled = args["enabled"] as? Bool ?? false
      if enabled {
        PowerAssertionManager.shared.acquire(mode: .alwaysOn)
      } else {
        PowerAssertionManager.shared.forceRelease()
      }
      return nil
    case "getPowerState":
      let mgr = PowerAssertionManager.shared
      return [
        "isHeld": mgr.isHeld,
        "mode": mgr.mode == .autoTask ? "autoTask" : (mgr.mode == .alwaysOn ? "alwaysOn" : "none"),
      ]
    default:
      throw NSError(domain: "piNative", code: 0, userInfo: [NSLocalizedDescriptionKey: "Unknown method \(method)"])
    }
  }

  @MainActor
  private func webFetch(args: [String: Any]) async throws -> Any? {
    guard let urlString = args["url"] as? String, let url = URL(string: urlString) else {
      throw NSError(domain: "piNative", code: 10, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
    }
    let optionsDict = (args["options"] as? [String: Any]) ?? [:]
    let waitUntil = (optionsDict["waitUntil"] as? String) ?? "networkidle"
    let timeoutMs = (optionsDict["timeoutMs"] as? Int) ?? 15_000
    let options = HiddenWebFetcher.WebFetchOptions(waitUntil: waitUntil, timeoutMs: timeoutMs)
    do {
      let result = try await hiddenFetcher.fetch(url: url, options: options)
      return [
        "markdown": result.markdown,
        "length": result.length,
        "title": result.title,
        "finalUrl": result.finalUrl,
      ]
    } catch {
      // Return null to signal "not available" rather than throwing — the
      // extension will fall back to agent-browser.
      return nil
    }
  }

  @MainActor
  private func pickFiles() async -> [String]? {
    await withCheckedContinuation { continuation in
      let panel = NSOpenPanel()
      panel.canChooseDirectories = false
      panel.canChooseFiles = true
      panel.canCreateDirectories = false
      panel.allowsMultipleSelection = true
      panel.prompt = "附加"
      panel.message = "选择要附加的文件（任意位置）"
      panel.begin { response in
        guard response == .OK else {
          continuation.resume(returning: nil)
          return
        }
        let paths = panel.urls.map(\.path)
        continuation.resume(returning: paths.isEmpty ? nil : paths)
      }
    }
  }

  @MainActor
  private func pickWorkspaceDirectory() async -> String? {
    await withCheckedContinuation { continuation in
      let panel = NSOpenPanel()
      panel.canChooseDirectories = true
      panel.canChooseFiles = false
      panel.canCreateDirectories = true
      panel.allowsMultipleSelection = false
      panel.prompt = "选择"
      panel.message = "选择 Pi 工作区文件夹"
      panel.begin { response in
        guard response == .OK, let url = panel.url else {
          continuation.resume(returning: nil)
          return
        }
        do {
          let path = try WorkspaceBookmarkStore.shared.saveBookmark(for: url)
          continuation.resume(returning: path)
        } catch {
          continuation.resume(returning: url.path)
        }
      }
    }
  }

  @MainActor
  private func showNotification(args: [String: Any]) {
    let sessionId = args["sessionId"] as? String ?? ""
    let title = (args["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let body = (args["body"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let content = UNMutableNotificationContent()
    content.title = title?.isEmpty == false ? title! : "Pi"
    if let body, !body.isEmpty { content.body = body }
    content.userInfo = ["sessionId": sessionId]
    let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
    UNUserNotificationCenter.current().add(request)
  }

  private func resolve(id: Int, result: Any?, error: String?) {
    guard let webView else { return }
    let resultJS: String
    if let error {
      resultJS = "null"
      let errJS = Self.encodeJSONString(error)
      let script = "window.__piNativeResolve(\(id), \(resultJS), \(errJS));"
      webView.evaluateJavaScript(script, completionHandler: nil)
      return
    }
    if let arr = result as? [String],
       let data = try? JSONSerialization.data(withJSONObject: arr),
       let encoded = String(data: data, encoding: .utf8) {
      resultJS = encoded
    } else if let result = result as? String {
      resultJS = Self.encodeJSONString(result)
    } else {
      resultJS = "null"
    }
    let script = "window.__piNativeResolve(\(id), \(resultJS), null);"
    webView.evaluateJavaScript(script, completionHandler: nil)
  }

  private static func encodeJSONString(_ value: String) -> String {
    if let data = try? JSONSerialization.data(withJSONObject: value),
       let encoded = String(data: data, encoding: .utf8) {
      return encoded
    }
    return "null"
  }
}

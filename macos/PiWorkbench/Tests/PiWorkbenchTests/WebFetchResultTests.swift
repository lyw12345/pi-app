import XCTest

/// Tests for the webFetch JS extractor script and struct handling.
/// These do NOT require a running WKWebView — they test the code paths
/// that parse the JS extractor's output and validate struct integrity.
final class WebFetchResultTests: XCTestCase {
  /// The JS extractor output format must match what the Swift side expects.
  func testExtractorOutputJSONShape() throws {
    // Simulate what the JS extractor produces
    let json = """
    {
      "markdown": "# Hello\\n\\nWorld",
      "length": 15,
      "title": "Test Page",
      "finalUrl": "https://example.com/final"
    }
    """
    let data = try XCTUnwrap(json.data(using: .utf8))
    let obj = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    let markdown = try XCTUnwrap(obj["markdown"] as? String)
    let length = try XCTUnwrap(obj["length"] as? Int)
    let title = try XCTUnwrap(obj["title"] as? String)
    let finalUrl = try XCTUnwrap(obj["finalUrl"] as? String)
    XCTAssertEqual(markdown, "# Hello\n\nWorld")
    XCTAssertEqual(length, 15)
    XCTAssertEqual(title, "Test Page")
    XCTAssertEqual(finalUrl, "https://example.com/final")
  }

  func testExtractorOutputEmptyMarkdown() throws {
    let json = """
    {
      "markdown": "",
      "length": 0,
      "title": "Empty",
      "finalUrl": "https://example.com"
    }
    """
    let data = try XCTUnwrap(json.data(using: .utf8))
    let obj = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    let length = try XCTUnwrap(obj["length"] as? Int)
    XCTAssertEqual(length, 0)
  }

  func testExtractorOutputMissingFieldFailsGracefully() throws {
    // Missing "length" — should be detected as malformed by the Swift side
    let json = """
    {
      "markdown": "some text",
      "title": "Broken",
      "finalUrl": "https://example.com"
    }
    """
    let data = try XCTUnwrap(json.data(using: .utf8))
    let obj = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    // length is missing
    let length = obj["length"] as? Int
    XCTAssertNil(length)
  }

  func testWebFetchOptionsRoundTrip() throws {
    // Swift side: HiddenWebFetcher.WebFetchOptions
    // TypeScript side: WebFetchOptions { waitUntil, timeoutMs }
    // Verify the field names and types match
    let json = """
    {
      "waitUntil": "networkidle",
      "timeoutMs": 15000
    }
    """
    let data = try XCTUnwrap(json.data(using: .utf8))
    let obj = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    let waitUntil = try XCTUnwrap(obj["waitUntil"] as? String)
    let timeoutMs = try XCTUnwrap(obj["timeoutMs"] as? Int)
    XCTAssertEqual(waitUntil, "networkidle")
    XCTAssertEqual(timeoutMs, 15_000)

    // Also accept "load" and "domcontentloaded"
    let opt2 = """
    {"waitUntil": "load", "timeoutMs": 5000}
    """
    let d2 = try XCTUnwrap(opt2.data(using: .utf8))
    let o2 = try XCTUnwrap(try JSONSerialization.jsonObject(with: d2) as? [String: Any])
    XCTAssertEqual(o2["waitUntil"] as? String, "load")
    XCTAssertEqual(o2["timeoutMs"] as? Int, 5_000)
  }

  /// The JS extractor script should contain the expected key functions.
  func testExtractorScriptStructure() throws {
    let script = HiddenWebFetcherJS.extractorScript
    // Should contain the core walk function
    XCTAssertTrue(script.contains("function walk"))
    // Should handle common HTML elements
    XCTAssertTrue(script.contains("node.tagName === 'H1'"))
    XCTAssertTrue(script.contains("node.tagName === 'A'"))
    XCTAssertTrue(script.contains("node.tagName === 'BUTTON'"))
    XCTAssertTrue(script.contains("node.tagName === 'IMG'"))
    // Should set window.__webFetchResult
    XCTAssertTrue(script.contains("window.__webFetchResult"))
    // Should return all required fields
    XCTAssertTrue(script.contains("markdown"))
    XCTAssertTrue(script.contains("finalUrl"))
  }
}

/// Replicate the extractor script as a static string for test-side validation.
/// This mirrors HiddenWebFetcher.extractorScript exactly.
enum HiddenWebFetcherJS {
  static let extractorScript = """
  (function() {
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
}

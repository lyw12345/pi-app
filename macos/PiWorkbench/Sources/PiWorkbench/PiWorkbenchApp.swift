import SwiftUI

@main
struct PiWorkbenchApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var server = ServerManager.shared

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(server)
        .frame(minWidth: 960, minHeight: 640)
    }
    .commands {
      CommandGroup(replacing: .appInfo) {
        Button("关于 Pi") {
          Task { await server.showAbout() }
        }
        Button("打开数据文件夹") {
          server.openAgentDirectory()
        }
        Button("重启服务") {
          Task { await server.restart() }
        }
      }
    }
  }
}

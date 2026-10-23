import AppKit
import Darwin

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var window: NSWindow!
    private var gameView: GameView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.appearance = NSAppearance(named: .aqua)
        buildMenu()
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 620, height: 894),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Upward"
        window.minSize = NSSize(width: 520, height: 760)
        window.isReleasedWhenClosed = false
        window.delegate = self
        gameView = GameView(frame: NSRect(x: 0, y: 0, width: 620, height: 894))
        window.contentView = gameView
        window.center(); window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(gameView)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func buildMenu() {
        let menu = NSMenu()
        let application = NSMenuItem()
        menu.addItem(application)
        let submenu = NSMenu()
        submenu.addItem(withTitle: "About Upward", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        submenu.addItem(.separator())
        submenu.addItem(withTitle: "Quit Upward", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        application.submenu = submenu
        let windowItem = NSMenuItem()
        menu.addItem(windowItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        windowItem.submenu = windowMenu
        NSApp.mainMenu = menu; NSApp.windowsMenu = windowMenu
    }

    func windowDidResignKey(_ notification: Notification) { gameView?.pauseOnFocusLoss() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { gameView?.shutdown() }
}

@main
struct UpwardApp {
    static func main() {
        let args = CommandLine.arguments
        if args.contains("--stream-motion") { exit(streamBrowserMotion()) }
        if args.contains("--sensor-check") { exit(checkMotion()) }
        let app = NSApplication.shared
        if args.count >= 3, args[1] == "--render-preview" {
            app.appearance = NSAppearance(named: .aqua)
            let view = GameView(frame: NSRect(x: 0, y: 0, width: 620, height: 894), startsMotion: false)
            let window = NSWindow(contentRect: view.bounds, styleMask: .borderless, backing: .buffered, defer: false)
            window.contentView = view
            do {
                try view.renderPreview(to: URL(fileURLWithPath: args[2]), playing: args.contains("--playing"))
                print("Preview saved: \(args[2])")
            } catch { fputs("Preview failed: \(error)\n", stderr); exit(1) }
            return
        }
        let delegate = AppDelegate()
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}

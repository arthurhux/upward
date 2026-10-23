import AppKit
import UpwardCore

private enum Paint {
    static let background = NSColor(hex: 0xF8FAFD)
    static let field = NSColor(hex: 0xEFF4FA)
    static let ink = NSColor(hex: 0x233B53)
    static let quiet = NSColor(hex: 0x6B7F93)
    static let line = NSColor(hex: 0xD5DFEB)
    static let platform = NSColor(hex: 0x8098AC)
    static let blue = NSColor(hex: 0x3C6EE8)
}

private extension NSColor {
    convenience init(hex: UInt32) {
        self.init(srgbRed: Double((hex >> 16) & 255) / 255,
                  green: Double((hex >> 8) & 255) / 255,
                  blue: Double(hex & 255) / 255, alpha: 1)
    }
}

final class GameView: NSView {
    let game = Game()
    let motion = MotionController()
    private var timer: Timer?
    private var previousTime = ProcessInfo.processInfo.systemUptime
    private var heldKeys: Set<UInt16> = []
    private var countdownEnd: Double?
    private var calibrationResumes = false
    private var playingWithTilt = false
    private var best = UserDefaults.standard.integer(forKey: "bestHeight")
    private var lastSavedBest = 0
    private var trail: [NSPoint] = []
    private var notice = ""
    private var noticeUntil = 0.0
    private let primary = NSButton(title: "Play with arrow keys", target: nil, action: nil)
    private let enable = NSButton(title: "Retry tilt", target: nil, action: nil)
    private let pauseButton = NSButton(title: "Pause", target: nil, action: nil)
    private let calibrateButton = NSButton(title: "Calibrate", target: nil, action: nil)
    private let restartButton = NSButton(title: "Restart", target: nil, action: nil)
    private let tiltToggle = NSButton(checkboxWithTitle: "Tilt steering", target: nil, action: nil)
    private let reverseToggle = NSButton(checkboxWithTitle: "Reverse tilt", target: nil, action: nil)
    private let sensitivitySlider = NSSlider(value: 1, minValue: 0.6, maxValue: 1.5, target: nil, action: nil)

    override var acceptsFirstResponder: Bool { true }
    override var isOpaque: Bool { true }
    private var now: Double { ProcessInfo.processInfo.systemUptime }
    private var worldScale: Double { min((bounds.width - 64) / Game.width, (bounds.height - 278) / Game.height) }
    private var field: NSRect {
        let scale = worldScale
        return NSRect(x: (bounds.width - Game.width * scale) / 2, y: 168,
                      width: Game.width * scale, height: Game.height * scale)
    }

    init(frame: NSRect, startsMotion: Bool = true) {
        super.init(frame: frame)
        lastSavedBest = best
        setAccessibilityElement(true)
        setAccessibilityLabel("Upward climbing game. Arrow keys steer, space pauses, C calibrates, R restarts.")
        for button in [primary, enable, pauseButton, calibrateButton, restartButton] {
            button.bezelStyle = .rounded
            button.font = .systemFont(ofSize: 13, weight: .medium)
            button.target = self
            addSubview(button)
        }
        primary.action = #selector(primaryAction)
        primary.keyEquivalent = "\r"
        primary.bezelColor = Paint.blue
        primary.contentTintColor = .white
        enable.action = #selector(enableAction)
        pauseButton.action = #selector(pauseAction)
        calibrateButton.action = #selector(calibrateAction)
        restartButton.action = #selector(restartAction)
        for button in [tiltToggle, reverseToggle] {
            button.font = .systemFont(ofSize: 11)
            button.target = self
            button.action = #selector(modeChanged)
            addSubview(button)
        }
        tiltToggle.state = .on
        reverseToggle.state = UserDefaults.standard.bool(forKey: "reverseTilt") ? .on : .off
        let savedSensitivity = UserDefaults.standard.object(forKey: "tiltSensitivity") as? Double ?? 1
        motion.sensitivity = savedSensitivity
        sensitivitySlider.doubleValue = motion.sensitivity
        sensitivitySlider.target = self
        sensitivitySlider.action = #selector(sensitivityChanged)
        sensitivitySlider.isContinuous = true
        sensitivitySlider.setAccessibilityLabel("Tilt sensitivity")
        sensitivitySlider.toolTip = "Left: gentler steering. Right: less tilt needed."
        addSubview(sensitivitySlider)
        if startsMotion {
            motion.start()
            let clock = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in self?.tick() }
            RunLoop.main.add(clock, forMode: .common)
            timer = clock
        }
        updateControls()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layout() {
        super.layout()
        let center = field.midX
        let overlayCenter = field.midY
        primary.frame = NSRect(x: center - 118, y: overlayCenter - 43, width: 236, height: 38)
        enable.frame = NSRect(x: center - 94, y: overlayCenter - 86, width: 188, height: 32)
        let buttonWidth = 92.0
        pauseButton.frame = NSRect(x: center - 151, y: 19, width: buttonWidth, height: 30)
        calibrateButton.frame = NSRect(x: center - 46, y: 19, width: buttonWidth, height: 30)
        restartButton.frame = NSRect(x: center + 59, y: 19, width: buttonWidth, height: 30)
        tiltToggle.frame = NSRect(x: center - 151, y: 65, width: 116, height: 22)
        reverseToggle.frame = NSRect(x: center + 37, y: 65, width: 116, height: 22)
        sensitivitySlider.frame = NSRect(x: center - 65, y: 127, width: 173, height: 22)
    }

    private func tick() {
        let time = now
        let dt = min(1.0 / 20, max(0, time - previousTime))
        previousTime = time
        motion.poll()
        if let end = countdownEnd, time >= end {
            countdownEnd = nil
            if playingWithTilt && !motion.calibrate() {
                flash("Tilt disconnected. Retry tilt or switch to arrow keys.")
            } else if calibrationResumes {
                game.resume()
            } else {
                game.start()
            }
        }
        if game.state == .playing && playingWithTilt && !motion.isLive {
            game.pause(); flash("Tilt disconnected. Reconnect or turn off Tilt steering.")
        }
        let left = heldKeys.contains(123) || heldKeys.contains(0)
        let right = heldKeys.contains(124) || heldKeys.contains(2)
        let keyboard = Double((right ? 1 : 0) - (left ? 1 : 0))
        let reversed = reverseToggle.state == .on ? -1.0 : 1.0
        let steering = left || right ? keyboard : (playingWithTilt ? motion.steering * reversed : 0)
        game.tick(dt, steering: steering)
        if game.state == .playing {
            trail.append(NSPoint(x: game.x, y: game.y))
            if trail.count > 7 { trail.removeFirst() }
        }
        best = max(best, game.score)
        if game.state == .gameOver && best > lastSavedBest {
            UserDefaults.standard.set(best, forKey: "bestHeight"); lastSavedBest = best
        }
        updateControls(); needsDisplay = true
    }

    private func updateControls() {
        let overlay = game.state != .playing && countdownEnd == nil
        primary.isHidden = !overlay
        enable.isHidden = !overlay || motion.isLive || !motion.available
        tiltToggle.isEnabled = motion.isLive || playingWithTilt
        reverseToggle.isEnabled = motion.isLive
        calibrateButton.isEnabled = motion.isLive && countdownEnd == nil && game.state != .gameOver
        pauseButton.isEnabled = (game.state == .playing || game.state == .paused) && countdownEnd == nil
        pauseButton.title = game.state == .paused ? "Resume" : "Pause"
        if game.state == .paused { primary.title = "Continue climbing" }
        else if motion.isLive && tiltToggle.state == .on {
            primary.title = game.state == .gameOver ? "Calibrate & try again" : "Calibrate & play"
        } else {
            primary.title = game.state == .gameOver ? "Try again with arrow keys" : "Play with arrow keys"
        }
    }

    @objc private func primaryAction() {
        window?.makeFirstResponder(self)
        if game.state == .paused { pauseAction(); return }
        if game.state == .gameOver { game.reset(); trail.removeAll() }
        playingWithTilt = motion.isLive && tiltToggle.state == .on
        if playingWithTilt {
            calibrationResumes = false; countdownEnd = now + 3
        } else { game.start() }
        updateControls(); needsDisplay = true
    }

    @objc private func enableAction() {
        game.pause(); motion.retry(); window?.makeFirstResponder(self)
        updateControls()
    }

    @objc private func pauseAction() {
        if game.state == .playing { game.pause(); heldKeys.removeAll() }
        else if game.state == .paused {
            if playingWithTilt && !motion.isLive { flash("Retry tilt or turn off Tilt steering to continue.") }
            else { game.resume() }
        }
        window?.makeFirstResponder(self); updateControls(); needsDisplay = true
    }

    @objc private func calibrateAction() {
        guard motion.isLive, game.state != .gameOver else { return }
        calibrationResumes = game.state == .playing || game.state == .paused
        playingWithTilt = true; tiltToggle.state = .on
        game.pause(); heldKeys.removeAll(); countdownEnd = now + 3
        window?.makeFirstResponder(self); updateControls()
    }

    @objc private func restartAction() {
        countdownEnd = nil; heldKeys.removeAll(); trail.removeAll(); game.reset()
        window?.makeFirstResponder(self); updateControls(); needsDisplay = true
    }

    @objc private func modeChanged() {
        if tiltToggle.state == .on && motion.isLive {
            if game.state == .playing || game.state == .paused { calibrateAction() }
        } else { playingWithTilt = false }
        UserDefaults.standard.set(reverseToggle.state == .on, forKey: "reverseTilt")
        window?.makeFirstResponder(self)
    }

    @objc private func sensitivityChanged() {
        motion.sensitivity = sensitivitySlider.doubleValue
        UserDefaults.standard.set(motion.sensitivity, forKey: "tiltSensitivity")
        window?.makeFirstResponder(self)
        needsDisplay = true
    }

    func pauseOnFocusLoss() {
        heldKeys.removeAll()
        if countdownEnd != nil { countdownEnd = nil; flash("Calibration paused. Hold the MacBook and try again.") }
        game.pause(); updateControls(); needsDisplay = true
    }

    override func keyDown(with event: NSEvent) {
        if [UInt16(123), 124, 0, 2].contains(event.keyCode) { heldKeys.insert(event.keyCode); return }
        guard !event.isARepeat else { return }
        switch event.keyCode {
        case 49:
            if game.state == .ready || game.state == .gameOver { primaryAction() }
            else { pauseAction() }
        case 36: if game.state != .playing { primaryAction() }
        case 8: calibrateAction()
        case 15: restartAction()
        case 53: if game.state == .playing { pauseAction() }
        default: super.keyDown(with: event)
        }
    }

    override func keyUp(with event: NSEvent) { heldKeys.remove(event.keyCode) }
    override func mouseDown(with event: NSEvent) { window?.makeFirstResponder(self) }

    private func flash(_ text: String) { notice = text; noticeUntil = now + 6 }

    override func draw(_ dirtyRect: NSRect) {
        Paint.background.setFill(); bounds.fill()
        drawHeader()
        drawWorld()
        drawFooter()
        if countdownEnd != nil { drawCountdown() }
        else if game.state != .playing { drawOverlay() }
    }

    private func drawHeader() {
        text("upward", at: NSPoint(x: field.minX, y: field.maxY + 43), size: 28, weight: .semibold)
        text("One bounce at a time.", at: NSPoint(x: field.minX, y: field.maxY + 22), size: 12, color: Paint.quiet)
        let value = "\(game.score) m"
        let width = textSize(value, size: 30, weight: .medium).width
        text(value, at: NSPoint(x: field.maxX - width, y: field.maxY + 42), size: 30, weight: .medium)
        let record = "Best  \(best) m"
        text(record, at: NSPoint(x: field.maxX - textSize(record, size: 11).width, y: field.maxY + 22), size: 11, color: Paint.quiet)
    }

    private func drawWorld() {
        Paint.field.setFill()
        NSBezierPath(roundedRect: field, xRadius: 12, yRadius: 12).fill()
        NSGraphicsContext.saveGraphicsState()
        NSBezierPath(roundedRect: field, xRadius: 12, yRadius: 12).addClip()
        let transform = AffineTransform(translationByX: field.minX, byY: field.minY)
        let matrix = NSAffineTransform(transform: transform)
        matrix.scale(by: worldScale); matrix.concat()
        for mark in stride(from: Int(game.cameraY / 250) * 250, to: Int(game.cameraY + Game.height + 250), by: 250) where mark > 0 {
            let y = Double(mark) - game.cameraY
            line(from: NSPoint(x: 0, y: y), to: NSPoint(x: Game.width, y: y), color: Paint.line.withAlphaComponent(0.6), width: 0.7)
            text("\(mark / 10) m", at: NSPoint(x: 14, y: y + 7), size: 10, color: Paint.quiet.withAlphaComponent(0.65))
        }
        for p in game.platforms {
            let rect = NSRect(x: p.x, y: p.y - game.cameraY - p.bounce * 3, width: p.width, height: 4)
            (p.bounce > 0 ? Paint.blue : Paint.platform).setFill()
            NSBezierPath(roundedRect: rect, xRadius: 2, yRadius: 2).fill()
        }
        if !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            for (index, point) in trail.enumerated() {
                Paint.blue.withAlphaComponent(Double(index) * 0.014).setFill()
                let r = Double(index) + 3
                NSBezierPath(ovalIn: NSRect(x: point.x - r, y: point.y - game.cameraY - r, width: r * 2, height: r * 2)).fill()
            }
        }
        Paint.blue.withAlphaComponent(0.07).setFill()
        NSBezierPath(ovalIn: NSRect(x: game.x - 19, y: game.y - game.cameraY - 19, width: 38, height: 38)).fill()
        Paint.blue.setFill()
        NSBezierPath(ovalIn: NSRect(x: game.x - Game.radius, y: game.y - game.cameraY - Game.radius,
                                  width: Game.radius * 2, height: Game.radius * 2)).fill()
        NSGraphicsContext.restoreGraphicsState()
    }

    private func drawFooter() {
        text("Sensitivity", at: NSPoint(x: field.midX - 151, y: 132), size: 11, color: Paint.quiet)
        text(String(format: "%.1f×", motion.sensitivity), at: NSPoint(x: field.midX + 123, y: 132), size: 11, color: Paint.quiet)
        let status = noticeUntil > now ? notice : motion.message
        let color = motion.isLive ? Paint.blue : Paint.quiet
        color.setFill()
        NSBezierPath(ovalIn: NSRect(x: field.minX + 2, y: 113, width: 6, height: 6)).fill()
        text(status, at: NSPoint(x: field.minX + 15, y: 108), size: bounds.width < 590 ? 10 : 11, color: Paint.quiet)
        let keyboard = "← → steer     Space pause     C calibrate     R restart"
        centered(keyboard, y: 2, size: 9, color: Paint.quiet)
        if motion.isLive {
            let middle = field.midX
            line(from: NSPoint(x: middle - 31, y: 76), to: NSPoint(x: middle + 31, y: 76), color: Paint.line, width: 2)
            let direction = motion.steering * (reverseToggle.state == .on ? -1 : 1)
            Paint.blue.setFill()
            NSBezierPath(ovalIn: NSRect(x: middle + direction * 28 - 3, y: 73, width: 6, height: 6)).fill()
        }
    }

    private func drawOverlay() {
        Paint.field.withAlphaComponent(0.91).setFill()
        NSBezierPath(roundedRect: field, xRadius: 12, yRadius: 12).fill()
        let title: String
        let subtitle: String
        switch game.state {
        case .ready:
            title = "A little higher."
            subtitle = "Find the next ledge. The ball does the bouncing."
        case .paused:
            title = "Take a breath."
            subtitle = "Your climb is right where you left it."
        default:
            title = "You reached \(game.score) m."
            subtitle = "There's always another bounce."
        }
        let middle = field.midY
        centered(title, y: middle + 60, size: 30, weight: .semibold)
        centered(subtitle, y: middle + 28, size: bounds.width < 590 ? 11 : 12, color: Paint.quiet)
        let hint = motion.isLive ? "Pick up your MacBook. Tilt gently left and right." : "Your arrow keys work while tilt connects."
        centered(hint, y: middle - 119, size: bounds.width < 590 ? 10 : 11, color: Paint.quiet)
        // A simple circle over a ledge is the entire game, even on the start screen.
        Paint.blue.setFill()
        NSBezierPath(ovalIn: NSRect(x: field.midX - 10, y: middle + 130, width: 20, height: 20)).fill()
        line(from: NSPoint(x: field.midX - 38, y: middle + 115), to: NSPoint(x: field.midX + 38, y: middle + 115), color: Paint.platform, width: 3)
    }

    private func drawCountdown() {
        Paint.field.withAlphaComponent(0.94).setFill()
        NSBezierPath(roundedRect: field, xRadius: 12, yRadius: 12).fill()
        centered("Hold your MacBook comfortably.", y: field.midY + 58, size: 22, weight: .medium)
        centered("This position will be your center.", y: field.midY + 30, size: 12, color: Paint.quiet)
        let remaining = max(1, Int(ceil((countdownEnd ?? now) - now)))
        centered(String(remaining), y: field.midY - 52, size: 60, weight: .light, color: Paint.blue)
    }

    private func textSize(_ string: String, size: Double, weight: NSFont.Weight = .regular) -> NSSize {
        (string as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: size, weight: weight)])
    }

    private func text(_ string: String, at point: NSPoint, size: Double, weight: NSFont.Weight = .regular, color: NSColor = Paint.ink) {
        (string as NSString).draw(at: point, withAttributes: [.font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color])
    }

    private func centered(_ string: String, y: Double, size: Double, weight: NSFont.Weight = .regular, color: NSColor = Paint.ink) {
        text(string, at: NSPoint(x: field.midX - textSize(string, size: size, weight: weight).width / 2, y: y), size: size, weight: weight, color: color)
    }

    private func line(from: NSPoint, to: NSPoint, color: NSColor, width: Double) {
        let path = NSBezierPath(); path.move(to: from); path.line(to: to)
        path.lineWidth = width; path.lineCapStyle = .round; color.setStroke(); path.stroke()
    }

    func renderPreview(to url: URL, playing: Bool) throws {
        if playing {
            game.start()
            for _ in 0..<72 { game.tick(1.0 / 120, steering: 0.18) }
        }
        updateControls(); layoutSubtreeIfNeeded()
        guard let bitmap = bitmapImageRepForCachingDisplay(in: bounds) else { throw CocoaError(.fileWriteUnknown) }
        cacheDisplay(in: bounds, to: bitmap)
        guard let data = bitmap.representation(using: .png, properties: [:]) else { throw CocoaError(.fileWriteUnknown) }
        try data.write(to: url)
    }

    func shutdown() {
        timer?.invalidate(); timer = nil; motion.stop()
        UserDefaults.standard.set(best, forKey: "bestHeight")
    }
}

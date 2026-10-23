import Foundation

public struct Ledge: Equatable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var bounce: Double = 0

    public init(x: Double, y: Double, width: Double) {
        self.x = x; self.y = y; self.width = width
    }
}

public enum PlayState { case ready, playing, paused, gameOver }

/// All positions use a 480 × 640 world, with positive Y pointing upward.
public final class Game {
    public static let width = 480.0
    public static let height = 640.0
    public static let radius = 11.0
    public static let gravity = 1_150.0
    public static let jumpSpeed = 580.0
    public static let maxSpeed = 290.0
    public static let startY = 71.0

    public private(set) var state: PlayState = .ready
    public private(set) var x = 240.0
    public private(set) var y = Game.startY
    public private(set) var vx = 0.0
    public private(set) var vy = 0.0
    public private(set) var cameraY = 0.0
    public private(set) var peak = Game.startY
    public private(set) var platforms: [Ledge] = []
    public private(set) var landings = 0
    public var score: Int { max(0, Int((peak - Self.startY) / 10)) }
    private var rng: UInt64
    private let initialSeed: UInt64

    public init(seed: UInt64 = UInt64.random(in: 1...UInt64.max)) {
        initialSeed = seed == 0 ? 1 : seed; rng = initialSeed
        reset()
    }

    public func reset() {
        state = .ready; x = 240; y = Self.startY; vx = 0; vy = 0
        cameraY = 0; peak = Self.startY; landings = 0; rng = initialSeed
        platforms = [Ledge(x: 155, y: 60, width: 170)]
        generatePlatforms()
    }

    public func start() {
        if state == .ready { state = .playing; vy = Self.jumpSpeed }
    }

    public func pause() { if state == .playing { state = .paused } }
    public func resume() { if state == .paused { state = .playing } }

    public func tick(_ dt: Double, steering: Double) {
        guard state == .playing, dt > 0, dt.isFinite, steering.isFinite else { return }
        // Substeps prevent missed ledges even on a slow frame.
        let duration = min(dt, 0.1)
        let steps = Int(ceil(duration / (1.0 / 120.0)))
        let step = duration / Double(steps)
        for _ in 0..<steps {
            guard state == .playing else { break }
            advance(step, steering: min(1, max(-1, steering)))
        }
    }

    private func advance(_ dt: Double, steering: Double) {
        // Fast acceleration and braking avoid adding another long smoothing tail
        // after the sensor filter. Maximum travel speed stays the same.
        vx += (steering * Self.maxSpeed - vx) * (1 - exp(-40 * dt))
        x += vx * dt
        if x < Self.radius { x = Self.radius; vx = 0 }
        if x > Self.width - Self.radius { x = Self.width - Self.radius; vx = 0 }
        let oldBottom = y - Self.radius
        vy -= Self.gravity * dt
        y += vy * dt
        if vy < 0 {
            // Land only while crossing a platform from above.
            for i in platforms.indices.reversed() {
                let p = platforms[i]
                if oldBottom >= p.y && y - Self.radius <= p.y &&
                    x + Self.radius > p.x && x - Self.radius < p.x + p.width {
                    y = p.y + Self.radius; vy = Self.jumpSpeed
                    platforms[i].bounce = 1; landings += 1
                    break
                }
            }
        }
        for i in platforms.indices { platforms[i].bounce = max(0, platforms[i].bounce - dt * 4) }
        peak = max(peak, y)
        cameraY = max(cameraY, y - Self.height * 0.49)
        generatePlatforms()
        platforms.removeAll { $0.y < cameraY - 60 }
        if y + Self.radius < cameraY { state = .gameOver }
    }

    private func random() -> Double {
        rng = rng &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
        return Double(rng >> 11) / Double(UInt64(1) << 53)
    }

    private func generatePlatforms() {
        while let last = platforms.last, last.y < cameraY + Self.height + 180 {
            let gap = 73 + random() * 25
            let width = max(84, 128 - last.y / 350) + random() * 16
            let center = last.x + last.width / 2
            // At most 115 points of horizontal travel between consecutive ledges.
            let nextCenter = min(Self.width - width / 2 - 24,
                                 max(width / 2 + 24, center + (random() * 2 - 1) * 115))
            platforms.append(Ledge(x: nextCenter - width / 2, y: last.y + gap, width: width))
        }
    }
}

/// Accelerometer pitch axes follow the reverse-engineered AppleSPU report format.
/// Roll uses X and Z so holding the display at a different angle does not steer.
public struct TiltFilter {
    public private(set) var angle = 0.0
    public private(set) var neutral = 0.0
    public private(set) var hasSample = false
    public var sensitivity = 1.0
    private var lastTime: Double?
    private var gyroRate = 0.0
    private var gyroTime = -Double.infinity
    private var latestGravityAngle = 0.0

    public init() {}

    public mutating func gyro(y: Double, at time: Double) {
        guard y.isFinite, time.isFinite else { return }
        gyroRate = y; gyroTime = time
    }

    public mutating func acceleration(x: Double, y: Double, z: Double, at time: Double) {
        guard x.isFinite, y.isFinite, z.isFinite, time.isFinite else { return }
        let magnitude = sqrt(x*x + y*y + z*z)
        guard magnitude > 0.3, magnitude < 2, hypot(x, z) > 0.1 else { return }
        let measured = atan2(-x, -z) * 180 / .pi
        latestGravityAngle = measured
        if let previous = lastTime {
            let dt = max(0, min(0.05, time - previous))
            if time - gyroTime < 0.12 {
                // Gravity corrects gyro drift; the gyro supplies quick movements.
                // atan2(-gravityX, -gravityZ) changes opposite to a positive
                // right-handed rotation around sensor Y. Using +gyroRate makes
                // the sensors fight each other during the initial movement.
                let predicted = angle - gyroRate * dt
                angle = predicted + Self.delta(measured, predicted) * (1 - exp(-dt / 0.045))
            } else {
                angle += Self.delta(measured, angle) * (1 - exp(-dt / 0.018))
            }
        } else { angle = measured }
        lastTime = time; hasSample = true
    }

    @discardableResult public mutating func calibrate() -> Bool {
        guard hasSample else { return false }
        angle = latestGravityAngle
        neutral = angle
        return true
    }

    public var steering: Double {
        let difference = Self.delta(angle, neutral)
        let gain = sensitivity.isFinite ? min(1.5, max(0.6, sensitivity)) : 1
        let deadZone = 0.5
        let fullTilt = 28 / gain
        let value = min(1, max(0, abs(difference) - deadZone) / (fullTilt - deadZone))
        // Keep fine control around center, while allowing deliberate large tilts
        // to reach the same maximum speed needed for distant ledges.
        return pow(value, 1.4) * (difference < 0 ? -1 : 1)
    }

    private static func delta(_ a: Double, _ b: Double) -> Double {
        var difference = (a - b).truncatingRemainder(dividingBy: 360)
        if difference > 180 { difference -= 360 }
        if difference < -180 { difference += 360 }
        return difference
    }
}

import XCTest
@testable import UpwardCore

final class GameTests: XCTestCase {
    func testBallBouncesAutomaticallyAndPassesUpThroughLedges() {
        let game = Game(seed: 42)
        game.start()
        let initialY = game.y
        game.tick(0.1, steering: 0)
        XCTAssertGreaterThan(game.y, initialY)
        XCTAssertEqual(game.landings, 0, "Ascending through a ledge must not trigger a bounce")
        for _ in 0..<180 { game.tick(1.0 / 120, steering: 0) }
        XCTAssertGreaterThan(game.landings, 0)
    }

    func testGeneratedPlatformsAreReachable() {
        let apex = Game.jumpSpeed * Game.jumpSpeed / (2 * Game.gravity)
        for seed in 1...100 {
            let game = Game(seed: UInt64(seed))
            for (lower, upper) in zip(game.platforms, game.platforms.dropFirst()) {
                let rise = upper.y - lower.y
                XCTAssertGreaterThan(rise, 0)
                XCTAssertLessThan(rise, apex)
                let landingTime = (Game.jumpSpeed + sqrt(pow(Game.jumpSpeed, 2) - 2 * Game.gravity * rise)) / Game.gravity
                let distance = abs((upper.x + upper.width / 2) - (lower.x + lower.width / 2))
                XCTAssertLessThan(distance, Game.maxSpeed * (landingTime - 0.15))
                XCTAssertGreaterThanOrEqual(upper.x, 0)
                XCTAssertLessThanOrEqual(upper.x + upper.width, Game.width)
            }
        }
    }

    func testAutopilotCanClimbForOneMinuteAndWorldStaysBounded() {
        let game = Game(seed: 42)
        game.start()
        var target = game.platforms[1]
        var previousLandings = 0
        var previousScore = 0
        for _ in 0..<7_200 {
            let offset = target.x + target.width / 2 - game.x
            game.tick(1.0 / 120, steering: min(1, max(-1, offset / 55)))
            if game.landings != previousLandings {
                previousLandings = game.landings
                let landed = game.platforms.min(by: { abs($0.y - (game.y - Game.radius)) < abs($1.y - (game.y - Game.radius)) })!
                if let next = game.platforms.first(where: { $0.y > landed.y + 1 }) { target = next }
            }
            XCTAssertGreaterThanOrEqual(game.score, previousScore)
            previousScore = game.score
            if game.state == .gameOver { break }
        }
        XCTAssertEqual(game.state, .playing)
        XCTAssertGreaterThan(game.landings, 60)
        XCTAssertGreaterThan(game.score, 500)
        XCTAssertGreaterThan(game.cameraY, 4_000)
        XCTAssertLessThan(game.platforms.count, 16)
    }

    func testPauseFreezeAndRestart() {
        let game = Game(seed: 7)
        game.start(); game.tick(0.1, steering: 1); game.pause()
        let x = game.x, y = game.y
        game.tick(0.1, steering: -1)
        XCTAssertEqual(game.x, x); XCTAssertEqual(game.y, y)
        game.resume(); game.tick(0.1, steering: -1)
        XCTAssertNotEqual(game.y, y)
        game.reset()
        XCTAssertEqual(game.state, .ready)
        XCTAssertEqual(game.score, 0)
        XCTAssertEqual(game.x, 240)
        XCTAssertEqual(game.cameraY, 0)
    }

    func testMissingLedgesEndsRunAndScoreKeepsItsPeak() {
        let game = Game(seed: 9)
        game.start()
        var peakScore = 0
        for _ in 0..<2_000 {
            game.tick(1.0 / 120, steering: 1)
            peakScore = max(peakScore, game.score)
            if game.state == .gameOver { break }
        }
        XCTAssertEqual(game.state, .gameOver)
        XCTAssertEqual(game.score, peakScore)
        XCTAssertGreaterThan(game.score, 0)
        XCTAssertLessThanOrEqual(game.x, Game.width - Game.radius)
    }

    func testInvalidInputCannotCorruptPhysics() {
        let game = Game(seed: 1)
        game.start()
        game.tick(.nan, steering: 0); game.tick(0.02, steering: .infinity)
        game.tick(-1, steering: 0)
        XCTAssertEqual(game.y, Game.startY)
        game.tick(10, steering: 0)
        XCTAssertLessThan(game.y - Game.startY, 60, "A long stall must not fast-forward the player into a fall")
    }

    func testSteeringRespondsAndBrakesWithinFiftyMilliseconds() {
        let game = Game(seed: 1)
        game.start()
        game.tick(0.05, steering: 1)
        XCTAssertGreaterThan(game.vx, Game.maxSpeed * 0.8)
        game.tick(0.05, steering: 0)
        XCTAssertLessThan(game.vx, Game.maxSpeed * 0.2, "Returning to center should stop the ball promptly")
    }
}

final class TiltTests: XCTestCase {
    func testNeutralPositionAndDeadZone() {
        var tilt = TiltFilter()
        XCTAssertFalse(tilt.calibrate())
        tilt.acceleration(x: -sin(0.2), y: 0, z: -cos(0.2), at: 1)
        XCTAssertTrue(tilt.calibrate())
        XCTAssertEqual(tilt.steering, 0, accuracy: 0.001)
        for i in 1...100 {
            tilt.acceleration(x: -sin(0.205), y: 0, z: -cos(0.205), at: 1 + Double(i) / 100)
        }
        XCTAssertEqual(tilt.steering, 0, accuracy: 0.001)
    }

    func testTiltsSteerInBothDirectionsAndSaturate() {
        var tilt = TiltFilter()
        tilt.acceleration(x: 0, y: 0, z: -1, at: 0); tilt.calibrate()
        for i in 1...100 { tilt.acceleration(x: -0.5, y: 0, z: -0.866, at: Double(i) / 100) }
        XCTAssertEqual(tilt.steering, 1)
        for i in 101...300 { tilt.acceleration(x: 0.5, y: 0, z: -0.866, at: Double(i) / 100) }
        XCTAssertEqual(tilt.steering, -1)
    }

    func testGyroscopeIsFusedAndGravityCorrectsDrift() {
        var tilt = TiltFilter()
        tilt.acceleration(x: 0, y: 0, z: -1, at: 0); tilt.calibrate()
        tilt.gyro(y: -100, at: 0.01)
        tilt.acceleration(x: 0, y: 0, z: -1, at: 0.01)
        XCTAssertGreaterThan(tilt.angle, 0.75)
        for i in 2...300 {
            let time = Double(i) / 100
            tilt.gyro(y: 0, at: time)
            tilt.acceleration(x: 0, y: 0, z: -1, at: time)
        }
        XCTAssertEqual(tilt.angle, 0, accuracy: 0.01)
    }

    func testGyroAndGravityAgreeDuringAQuickTilt() {
        var tilt = TiltFilter()
        tilt.acceleration(x: 0, y: 0, z: -1, at: 0)
        tilt.calibrate()
        // A right-handed rotation around sensor Y produces the opposite sign
        // in atan2(-gravityX, -gravityZ). Both sensors must predict the same roll.
        for i in 1...12 {
            let time = Double(i) / 100
            let radians = Double(i) * .pi / 180
            tilt.gyro(y: -100, at: time)
            tilt.acceleration(x: -sin(radians), y: 0, z: -cos(radians), at: time)
            XCTAssertGreaterThan(tilt.angle, 0, "The first motion must not initially steer the wrong way")
        }
        XCTAssertEqual(tilt.angle, 12, accuracy: 0.5)
    }

    func testAccelerometerFallbackRespondsWithinOneHundredMilliseconds() {
        var tilt = TiltFilter()
        tilt.acceleration(x: 0, y: 0, z: -1, at: 0)
        tilt.calibrate()
        for i in 1...10 {
            let degrees = min(8, Double(i))
            let radians = degrees * .pi / 180
            tilt.acceleration(x: -sin(radians), y: 0, z: -cos(radians), at: Double(i) / 100)
        }
        XCTAssertGreaterThan(tilt.angle, 7.2)
    }

    func testSmallTiltsAllowFinePositioning() {
        var tilt = TiltFilter()
        tilt.acceleration(x: 0, y: 0, z: -1, at: 0)
        tilt.calibrate()
        let radians = 5.0 * .pi / 180
        for i in 1...100 {
            tilt.acceleration(x: -sin(radians), y: 0, z: -cos(radians), at: Double(i) / 100)
        }
        XCTAssertGreaterThan(tilt.steering, 0.01)
        XCTAssertLessThan(tilt.steering, 0.1, "A five-degree movement should allow a small correction")
    }

    func testSensitivityAdjustsTravelWithoutAddingLatency() {
        var tilt = TiltFilter()
        tilt.acceleration(x: 0, y: 0, z: -1, at: 0)
        tilt.calibrate()
        let radians = 10.0 * .pi / 180
        for i in 1...100 {
            tilt.acceleration(x: -sin(radians), y: 0, z: -cos(radians), at: Double(i) / 100)
        }
        let defaultSteering = tilt.steering
        let angle = tilt.angle
        tilt.sensitivity = 0.6
        XCTAssertLessThan(tilt.steering, defaultSteering)
        tilt.sensitivity = 1.5
        XCTAssertGreaterThan(tilt.steering, defaultSteering)
        XCTAssertEqual(tilt.angle, angle, "Sensitivity must not delay or alter the tilt estimate")
    }

    func testQuickDirectionChangesDoNotKeepSteeringTheOldWay() {
        var tilt = TiltFilter()
        tilt.acceleration(x: 0, y: 0, z: -1, at: 0)
        tilt.calibrate()
        for i in 1...12 {
            let radians = Double(i) * .pi / 180
            tilt.gyro(y: -100, at: Double(i) / 100)
            tilt.acceleration(x: -sin(radians), y: 0, z: -cos(radians), at: Double(i) / 100)
        }
        for i in 1...24 {
            let time = 0.12 + Double(i) / 100
            let radians = (12 - Double(i)) * .pi / 180
            tilt.gyro(y: 100, at: time)
            tilt.acceleration(x: -sin(radians), y: 0, z: -cos(radians), at: time)
        }
        XCTAssertEqual(tilt.angle, -12, accuracy: 0.5)
        XCTAssertLessThan(tilt.steering, 0)
    }

    func testInvalidSamplesAreIgnored() {
        var tilt = TiltFilter()
        tilt.acceleration(x: .nan, y: 0, z: -1, at: 1)
        tilt.acceleration(x: 0, y: 0, z: 0, at: 2)
        XCTAssertFalse(tilt.hasSample)
        XCTAssertEqual(tilt.steering, 0)
    }
}

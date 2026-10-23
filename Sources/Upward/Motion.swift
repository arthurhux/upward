import Foundation
import IOKit
import IOKit.hid
import Darwin
import UpwardCore

// AppleSPU usages and Q16 report layout documented by olvvier:
// https://github.com/olvvier/apple-silicon-accelerometer (see THIRD_PARTY_NOTICES.md).
final class HIDMotionReader {
    final class Channel {
        let device: IOHIDDevice
        let usage: Int
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
        weak var owner: HIDMotionReader?
        init(device: IOHIDDevice, usage: Int, owner: HIDMotionReader) {
            self.device = device; self.usage = usage; self.owner = owner
        }
        deinit { buffer.deallocate() }
    }

    private var channels: [Channel] = []
    private var driverSettings: [(io_service_t, String, CFTypeRef)] = []
    var onSample: ((Int, Double, Double, Double, Double) -> Void)?
    private(set) var diagnostics: [String] = []
    private(set) var foundAccelerometer = false
    private(set) var accelCount = 0
    private(set) var gyroCount = 0

    func start() {
        guard channels.isEmpty else { return }
        diagnostics = []
        var iterator: io_iterator_t = 0
        let result = IOServiceGetMatchingServices(kIOMainPortDefault,
                                                 IOServiceMatching("AppleSPUHIDDevice"), &iterator)
        guard result == KERN_SUCCESS else {
            diagnostics.append("Sensor enumeration failed: \(result)"); return
        }
        defer { IOObjectRelease(iterator) }
        while case let service = IOIteratorNext(iterator), service != 0 {
            defer { IOObjectRelease(service) }
            let page = property(service, "PrimaryUsagePage") as? Int ?? 0
            let usage = property(service, "PrimaryUsage") as? Int ?? 0
            guard page == 0xFF00, usage == 3 || usage == 9 else { continue }
            if usage == 3 { foundAccelerometer = true }
            guard let device = IOHIDDeviceCreate(kCFAllocatorDefault, service) else { continue }
            let opened = IOHIDDeviceOpen(device, IOOptionBits(kIOHIDOptionsTypeNone))
            guard opened == kIOReturnSuccess else {
                diagnostics.append("\(usage == 3 ? "Accelerometer" : "Gyroscope") access: \(opened)")
                continue
            }
            let channel = Channel(device: device, usage: usage, owner: self)
            channels.append(channel)
            IOHIDDeviceRegisterInputReportCallback(device, channel.buffer, 4096, { context, result, _, _, _, bytes, length in
                guard result == kIOReturnSuccess, length == 22, let context else { return }
                let channel = Unmanaged<Channel>.fromOpaque(context).takeUnretainedValue()
                func value(_ offset: Int) -> Double {
                    let raw = UInt32(bytes[offset]) | (UInt32(bytes[offset+1]) << 8) |
                              (UInt32(bytes[offset+2]) << 16) | (UInt32(bytes[offset+3]) << 24)
                    return Double(Int32(bitPattern: raw)) / 65536
                }
                guard let reader = channel.owner else { return }
                if channel.usage == 3 { reader.accelCount += 1 } else { reader.gyroCount += 1 }
                reader.onSample?(channel.usage, value(6), value(10), value(14),
                                 ProcessInfo.processInfo.systemUptime)
            }, Unmanaged.passUnretained(channel).toOpaque())
            IOHIDDeviceScheduleWithRunLoop(device, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
        }
        if !channels.isEmpty { wakeMotionDrivers() }
    }

    private func property(_ service: io_service_t, _ key: String) -> CFTypeRef? {
        IORegistryEntryCreateCFProperty(service, key as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue()
    }

    private func wakeMotionDrivers() {
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault,
                                          IOServiceMatching("AppleSPUHIDDriver"), &iterator) == KERN_SUCCESS else { return }
        defer { IOObjectRelease(iterator) }
        while case let service = IOIteratorNext(iterator), service != 0 {
            defer { IOObjectRelease(service) }
            let usage = property(service, "PrimaryUsage") as? Int ?? 0
            let page = property(service, "PrimaryUsagePage") as? Int ?? 0
            guard page == 0xFF00, channels.contains(where: { $0.usage == usage }) else { continue }
            for (key, value) in [("SensorPropertyReportingState", 1), ("SensorPropertyPowerState", 1),
                                  ("ReportInterval", 10000)] {
                let previous = property(service, key) ?? NSNumber(value: key == "ReportInterval" ? 8000 : 0)
                if IORegistryEntrySetCFProperty(service, key as CFString, NSNumber(value: value)) == KERN_SUCCESS {
                    IOObjectRetain(service)
                    driverSettings.append((service, key, previous))
                }
            }
        }
    }

    func stop() {
        for channel in channels {
            IOHIDDeviceUnscheduleFromRunLoop(channel.device, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
            IOHIDDeviceRegisterInputReportCallback(channel.device, channel.buffer, 4096, nil, nil)
            IOHIDDeviceClose(channel.device, IOOptionBits(kIOHIDOptionsTypeNone))
        }
        channels.removeAll()
        for (service, key, value) in driverSettings.reversed() {
            IORegistryEntrySetCFProperty(service, key as CFString, value)
            IOObjectRelease(service)
        }
        driverSettings.removeAll()
    }

    deinit { stop() }
}

/// All readings remain in this process. No background service or elevated helper.
final class MotionController {
    private let reader = HIDMotionReader()
    private var filter = TiltFilter()
    private var lastAccel = 0.0
    private var lastGyro = 0.0
    private var startedAt = 0.0
    private(set) var message = "Checking motion sensors…"
    var sensitivity: Double {
        get { filter.sensitivity }
        set { filter.sensitivity = newValue.isFinite ? min(1.5, max(0.6, newValue)) : 1 }
    }
    var steering: Double { filter.steering }
    var isLive: Bool { ProcessInfo.processInfo.systemUptime - lastAccel < 0.5 }
    var hasGyro: Bool { ProcessInfo.processInfo.systemUptime - lastGyro < 0.5 }
    var available: Bool { reader.foundAccelerometer }

    func start() {
        startedAt = ProcessInfo.processInfo.systemUptime
        reader.onSample = { [weak self] usage, x, y, z, time in
            guard let self else { return }
            if usage == 9 {
                self.lastGyro = time
                self.filter.gyro(y: y, at: time)
            } else {
                self.lastAccel = time
                self.filter.acceleration(x: x, y: y, z: z, at: time)
            }
        }
        reader.start()
        message = available ? "Connecting to tilt sensors…" : "No compatible motion sensor found"
    }

    func poll() {
        if isLive {
            message = hasGyro ? "Accelerometer + gyroscope connected" : "Accelerometer connected"
        } else if available && ProcessInfo.processInfo.systemUptime - startedAt > 1 {
            message = "No live tilt readings. Retry tilt or use arrow keys."
        }
    }

    @discardableResult func calibrate() -> Bool {
        guard isLive else { return false }
        return filter.calibrate()
    }

    func retry() {
        let savedSensitivity = sensitivity
        reader.stop(); filter = TiltFilter(); lastAccel = 0; lastGyro = 0
        sensitivity = savedSensitivity
        start()
    }

    func stop() { reader.stop() }
    deinit { stop() }
}

func checkMotion() -> Int32 {
    let reader = HIDMotionReader()
    var acceleration = (0.0, 0.0, 0.0)
    reader.onSample = { usage, x, y, z, _ in
        if usage == 3 { acceleration = (x, y, z) }
    }
    reader.start()
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 3))
    print("Accelerometer found: \(reader.foundAccelerometer)")
    print("Accelerometer samples: \(reader.accelCount); gyro samples: \(reader.gyroCount)")
    for diagnostic in reader.diagnostics { print(diagnostic) }
    if reader.accelCount > 0 { print("Acceleration (g): \(acceleration)") }
    let success = reader.accelCount > 0
    reader.stop()
    return success ? 0 : 1
}

/// NDJSON output for the loopback-only browser bridge. Calibration belongs to
/// each browser session, so this publishes orientation without a neutral offset.
func streamBrowserMotion() -> Int32 {
    let reader = HIDMotionReader()
    var roll = TiltFilter()
    var pitch = 0.0
    var sampleTime = 0.0
    var sequence = 0
    var lastReconnect = ProcessInfo.processInfo.systemUptime
    reader.onSample = { usage, x, y, z, time in
        if usage == 9 { roll.gyro(y: y, at: time) }
        else {
            roll.acceleration(x: x, y: y, z: z, at: time)
            let measured = atan2(y, hypot(x, z)) * 180 / .pi
            let dt = min(0.05, max(0, time - sampleTime))
            pitch = sampleTime == 0 ? measured : pitch + (measured - pitch) * (1 - exp(-dt / 0.018))
            sampleTime = time
        }
    }
    reader.start()
    let loop = CFRunLoopGetMain()
    signal(SIGTERM, SIG_IGN); signal(SIGINT, SIG_IGN); signal(SIGPIPE, SIG_IGN)
    let termination = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    let interruption = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    termination.setEventHandler { CFRunLoopStop(loop) }
    interruption.setEventHandler { CFRunLoopStop(loop) }
    termination.resume(); interruption.resume()
    let timer = Timer(timeInterval: 1.0 / 60, repeats: true) { _ in
        sequence += 1
        let now = ProcessInfo.processInfo.systemUptime
        let live = sampleTime > 0 && now - sampleTime < 0.5
        if !live && now - lastReconnect > 2 {
            // Recover after sleep, or when another reader closes the same device.
            reader.stop(); reader.start(); lastReconnect = now
        }
        let packet: [String: Any] = ["type": "motion", "connected": live,
            // Browser controls use right-edge-down as positive steering.
            "available": reader.foundAccelerometer, "roll": -roll.angle, "pitch": pitch,
            "sequence": sequence, "sampleTime": sampleTime]
        guard var data = try? JSONSerialization.data(withJSONObject: packet) else { return }
        data.append(10)
        let result = data.withUnsafeBytes { Darwin.write(STDOUT_FILENO, $0.baseAddress!, $0.count) }
        if result < 0 { CFRunLoopStop(loop) }
    }
    RunLoop.main.add(timer, forMode: .common)
    CFRunLoopRun()
    timer.invalidate(); reader.stop(); termination.cancel(); interruption.cancel()
    return 0
}

/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import Foundation
import IPtProxy

#if DEBUG
private let IPT_PROXY_LOG_LEVEL = "DEBUG"
#else
private let IPT_PROXY_LOG_LEVEL = "NOTICE"
#endif

private func debugLog(_ message: String) {
#if DEBUG
  NSLog("[IPtProxy] %@", message)
#endif
}

private func infoLog(_ message: String) {
  NSLog("[IPtProxy] %@", message)
}

private func warnLog(_ message: String) {
  NSLog("[IPtProxy] [WARN] %@", message)
}

private func errorLog(_ message: String) {
  NSLog("[IPtProxy] [ERROR] %@", message)
}

class TransportEventHandler: NSObject, IPtProxyOnTransportEventsProtocol {
  func connected(_ name: String?) {
    infoLog("[EVENT] Transport connected")
  }

  func error(_ name: String?, error: Error?) {
    if let error = error {
      warnLog("[EVENT] Transport error: \(error.localizedDescription)")
    } else {
      warnLog("[EVENT] Transport error")
    }
  }

  func stopped(_ name: String?, error: Error?) {
    if let error = error {
      warnLog("[EVENT] Transport stopped with error: \(error.localizedDescription)")
    } else {
      infoLog("[EVENT] Transport stopped")
    }
  }
}

@objc(IPtProxyModule)
class IPtProxyModule: NSObject {
  private static let controllerLock = NSLock()
  private static var sharedController: IPtProxyController?
  private static let sharedEventHandler = TransportEventHandler()

  override init() {
    super.init()
    debugLog("IPtProxyModule initialized (iOS)")
    debugLog("Lyrebird version: \(IPtProxyLyrebirdVersion())")
    debugLog("Snowflake version: \(IPtProxySnowflakeVersion())")
  }

  private func stateDir() -> String? {
    let fm = FileManager.default
    guard let appSupportDir = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
      errorLog("Could not resolve Application Support directory")
      return nil
    }
    let ptDirUrl = appSupportDir.appendingPathComponent("pt_state", isDirectory: true)
    let ptDir = ptDirUrl.path

    if !fm.fileExists(atPath: ptDir) {
      do {
        try fm.createDirectory(at: ptDirUrl, withIntermediateDirectories: true, attributes: nil)
        debugLog("Created state directory")
      } catch {
        errorLog("Failed to create state directory: \(error.localizedDescription)")
        return nil
      }
    }

    let testFileUrl = ptDirUrl.appendingPathComponent(".writetest")
    do {
      try Data("test".utf8).write(to: testFileUrl, options: .atomic)
      try? fm.removeItem(at: testFileUrl)
      debugLog("State directory is writable: \(ptDir)")
    } catch {
      errorLog("State directory is not writable: \(error.localizedDescription)")
      return nil
    }

    return ptDir
  }

  private func ensureController() -> IPtProxyController? {
    Self.controllerLock.lock()
    defer { Self.controllerLock.unlock() }

    if let controller = Self.sharedController {
      debugLog("Reusing shared controller")
      return controller
    }

    debugLog("Creating shared controller")
    guard let dir = stateDir() else {
      errorLog("No state directory — cannot create controller")
      return nil
    }

    var controller = IPtProxyNewController(
      dir,
      true,
      false,
      IPT_PROXY_LOG_LEVEL,
      Self.sharedEventHandler
    )

    if controller == nil {
      warnLog("IPtProxyNewController() returned nil with transport events; retrying without event handler")
      controller = IPtProxyNewController(dir, true, false, IPT_PROXY_LOG_LEVEL, nil)
    }

    if let controller {
      debugLog("Controller created successfully")
      Self.sharedController = controller
      return controller
    }

    errorLog("IPtProxyNewController() returned nil")
    return nil
  }

  @objc
  func startObfs4(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    debugLog("startObfs4()")
    guard let c = ensureController() else {
      reject("ERR_INIT", "Failed to initialize IPtProxy controller", nil)
      return
    }
    do {
      infoLog("Starting obfs4 transport")
      try c.start(IPtProxyObfs4, proxy: "")
      let port = c.port(IPtProxyObfs4)
      debugLog("obfs4 started on local port \(port)")
      resolve(["port": port])
    } catch {
      errorLog("obfs4 start failed: \(error.localizedDescription)")
      reject("ERR_START", "Failed to start obfs4: \(error.localizedDescription)", error)
    }
  }

  @objc
  func startSnowflake(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    debugLog("startSnowflake()")
    guard let c = ensureController() else {
      reject("ERR_INIT", "Failed to initialize IPtProxy controller", nil)
      return
    }
    let iceServers = "stun:stun.l.google.com:19302,stun:stun.l.google.com:5349"
    let brokerUrl = "https://snowflake-broker.torproject.net/"
    let frontDomains = "cdn.sstatic.net,www.phpmyadmin.net"

    debugLog("Configuring snowflake transport")

    c.snowflakeIceServers = iceServers
    c.snowflakeBrokerUrl = brokerUrl
    c.snowflakeFrontDomains = frontDomains

    do {
      infoLog("Starting snowflake transport")
      try c.start(IPtProxySnowflake, proxy: "")
      let port = c.port(IPtProxySnowflake)
      debugLog("snowflake started on local port \(port)")
      resolve(["port": port])
    } catch {
      errorLog("snowflake start failed: \(error.localizedDescription)")
      reject("ERR_START", "Failed to start snowflake: \(error.localizedDescription)", error)
    }
  }

  @objc
  func startWebtunnel(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    debugLog("startWebtunnel()")
    guard let c = ensureController() else {
      reject("ERR_INIT", "Failed to initialize IPtProxy controller", nil)
      return
    }
    do {
      infoLog("Starting webtunnel transport")
      try c.start(IPtProxyWebtunnel, proxy: "")
      let port = c.port(IPtProxyWebtunnel)
      debugLog("webtunnel started on local port \(port)")
      resolve(["port": port])
    } catch {
      errorLog("webtunnel start failed: \(error.localizedDescription)")
      reject("ERR_START", "Failed to start webtunnel: \(error.localizedDescription)", error)
    }
  }

  @objc
  func stopTransports(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    debugLog("stopTransports()")
    Self.controllerLock.lock()
    let controller = Self.sharedController
    Self.controllerLock.unlock()

    guard let c = controller else {
      debugLog("No controller — nothing to stop")
      resolve(nil)
      return
    }
    let transportNames = [IPtProxyObfs4, IPtProxySnowflake, IPtProxyWebtunnel]
    for transport in transportNames {
      let port = c.port(transport)
      if port > 0 {
        infoLog("Stopping transport")
        c.stop(transport)
        debugLog("Transport stopped")
      } else {
        debugLog("Transport not running, skipping")
      }
    }
    debugLog("All transports stopped")
    resolve(nil)
  }

  @objc
  static func requiresMainQueueSetup() -> Bool { false }
}

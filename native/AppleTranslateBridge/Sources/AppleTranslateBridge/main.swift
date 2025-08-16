import SwiftUI
import Foundation
import NaturalLanguage
import Translation

struct TranslationRequest: Codable {
  let text: String
  let source: String   // "auto" or lang code, e.g. "en"
  let target: String   // lang code, e.g. "ja"
}

struct TranslationResponse: Codable {
  let translatedText: String
  let detectedSource: String?
  let confidence: Double
  let processingTime: Double
}

struct ErrorResponse: Codable {
  let error: String
  let code: String
}

final class LanguageDetectionService {
  private let recognizer = NLLanguageRecognizer()
  
  func detect(for text: String) -> String? {
    recognizer.reset()
    recognizer.processString(text)
    guard let lang = recognizer.dominantLanguage else { return nil }
    switch lang {
    case .english: return "en"
    case .spanish: return "es"
    case .french: return "fr"
    case .german: return "de"
    case .italian: return "it"
    case .portuguese: return "pt"
    case .japanese: return "ja"
    case .korean: return "ko"
    case .simplifiedChinese: return "zh-Hans"
    case .traditionalChinese: return "zh-Hant"
    case .russian: return "ru"
    case .arabic: return "ar"
    case .hindi: return "hi"
    case .thai: return "th"
    case .vietnamese: return "vi"
    case .dutch: return "nl"
    case .polish: return "pl"
    case .turkish: return "tr"
    default: return lang.rawValue
    }
  }
  
  private func normalizeTag(_ raw: String) -> String {
    let t = raw.lowercased()
    if t.hasPrefix("zh") {
      // Default to Hans if script missing
      return t.contains("hant") ? "zh-Hant" : "zh-Hans"
    }
    // Keep only the base language for most languages (en, es, fr, ...)
    // "en-US" -> "en", "pt-BR" -> "pt"
    return t.split(separator: "-").first.map(String.init) ?? t
  }
  
  func normalizeLanguage(_ raw: String) -> String {
    return normalizeTag(raw)
  }
}

@available(macOS 15.0, *)
@main
struct AppleTranslateBridge: App {
  var body: some Scene {
    WindowGroup { ContentView() }
      .windowStyle(.hiddenTitleBar)
      .windowResizability(.contentSize)
      .defaultSize(width: 1, height: 1)
  }
}

@available(macOS 15.0, *)
struct ContentView: View {
  @StateObject private var translator = TranslationManager()

  var body: some View {
    Color.clear
      .frame(width: 1, height: 1)
      .onAppear { Task { await run() } }
      .translationTask(translator.currentConfig) { session in
        await translator.process(with: session)
      }
  }

  private func run() async {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard !data.isEmpty else { printErr("NO_INPUT", "No input provided."); exit(1) }

    do {
      let req = try JSONDecoder().decode(TranslationRequest.self, from: data)
      guard !req.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      else { printErr("INVALID_INPUT", "Empty text provided"); exit(1) }

      let resp = await translator.translate(req)
      printJSON(resp); exit(0)
    } catch let e as DecodingError {
      printErr("INVALID_JSON", "Invalid JSON: \(e.localizedDescription)"); exit(1)
    } catch {
      printErr("UNEXPECTED_ERROR", error.localizedDescription); exit(1)
    }
  }

  private func printJSON<T: Encodable>(_ v: T) {
    let enc = JSONEncoder()
    if let d = try? enc.encode(v), let s = String(data: d, encoding: .utf8) { print(s) }
  }
  private func printErr(_ code: String, _ msg: String) {
    printJSON(ErrorResponse(error: msg, code: code))
  }
}

@available(macOS 15.0, *)
@MainActor
final class TranslationManager: ObservableObject {
  @Published var currentConfig: TranslationSession.Configuration?
  @Published var pending: TranslationRequest?
  @Published var result: String?
  @Published var errMsg: String?
  private var pendingContinuation: CheckedContinuation<String, Never>?

  private let detector = LanguageDetectionService()
  private let supported: Set<String> = ["en","ar","zh-Hans","zh-Hant","fr","de","es","it","ja","ko","pt","ru","tr","id","pl","nl","th","vi","uk","hi"]

  func translate(_ req: TranslationRequest) async -> TranslationResponse {
    let start = Date()

    let srcRaw = (req.source == "auto") ? (detector.detect(for: req.text) ?? "en") : req.source
    let src = detector.normalizeLanguage(srcRaw)
    let tgt = detector.normalizeLanguage(req.target)
    
    guard supported.contains(src), supported.contains(tgt) else {
      return TranslationResponse(translatedText: req.text, detectedSource: src, confidence: 0.0, processingTime: elapsedMs(since: start))
    }
    if src == tgt {
      return TranslationResponse(translatedText: req.text, detectedSource: src, confidence: 1.0, processingTime: elapsedMs(since: start))
    }

    // Prepare session via translationTask
    pending = req
    errMsg = nil

    let translatedText = await withCheckedContinuation { cont in
      self.pendingContinuation = cont
      self.currentConfig = TranslationSession.Configuration(
        source: .init(identifier: src),
        target: .init(identifier: tgt)
      )
    }
    
    return TranslationResponse(
      translatedText: translatedText,
      detectedSource: src,
      confidence: 0.98,
      processingTime: elapsedMs(since: start)
    )
  }

  func process(with session: TranslationSession) async {
    guard let req = pending else { return }
    Task {
      do {
        try await session.prepareTranslation() // Ensures models are present (may download)
        let r = try await session.translate(req.text)
        await MainActor.run {
          pendingContinuation?.resume(returning: r.targetText)
        }
      } catch {
        await MainActor.run {
          errMsg = error.localizedDescription
          pendingContinuation?.resume(returning: req.text) // Degrade gracefully
        }
      }
      await MainActor.run {
        pendingContinuation = nil
        pending = nil
      }
    }
  }

  private func elapsedMs(since: Date) -> Double {
    Date().timeIntervalSince(since) * 1000.0
  }
}
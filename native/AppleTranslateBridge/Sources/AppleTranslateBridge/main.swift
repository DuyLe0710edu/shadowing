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
    case .simplifiedChinese, .traditionalChinese: return "zh"
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

  private let detector = LanguageDetectionService()
  private let supported = ["en","ar","zh","fr","de","es","it","ja","ko","pt","ru","tr","id","pl","nl","th","vi","uk","hi"]

  func translate(_ req: TranslationRequest) async -> TranslationResponse {
    let start = Date()

    let src = (req.source == "auto") ? (detector.detect(for: req.text) ?? "en") : req.source
    guard supported.contains(src), supported.contains(req.target) else {
      return TranslationResponse(translatedText: req.text, detectedSource: src, confidence: 0.0, processingTime: elapsedMs(since: start))
    }
    if src == req.target {
      return TranslationResponse(translatedText: req.text, detectedSource: src, confidence: 1.0, processingTime: elapsedMs(since: start))
    }

    // Prepare session via translationTask
    pending = req
    result = nil
    errMsg = nil
    currentConfig = TranslationSession.Configuration(
      source: .init(identifier: src),
      target: .init(identifier: req.target)
    )

    var tries = 0
    while result == nil && errMsg == nil && tries < 200 {
      try? await Task.sleep(nanoseconds: 50_000_000) // 50 ms
      tries += 1
    }

    return TranslationResponse(
      translatedText: result ?? req.text,
      detectedSource: src,
      confidence: (result != nil ? 0.95 : 0.1),
      processingTime: elapsedMs(since: start)
    )
  }

  func process(with session: TranslationSession) async {
    guard let req = pending else { return }
    Task {
      do {
        try await session.prepareTranslation()
        let r = try await session.translate(req.text)
        await MainActor.run { result = r.targetText }
      } catch {
        await MainActor.run {
          errMsg = error.localizedDescription
          result = req.text
        }
      }
    }
  }

  private func elapsedMs(since: Date) -> Double {
    Date().timeIntervalSince(since) * 1000.0
  }
}
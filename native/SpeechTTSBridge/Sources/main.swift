import Foundation
import AVFoundation

struct Args {
  let id: String
  let text: String
  let lang: String?
  let rate: Float?
  let pitch: Float?
  let volume: Float?
}

func parseArgs() -> Args? {
  var id: String = UUID().uuidString
  var text: String = ""
  var lang: String? = nil
  var rate: Float? = nil
  var pitch: Float? = nil
  var volume: Float? = nil
  var it = CommandLine.arguments.dropFirst().makeIterator()
  while let k = it.next() {
    switch k {
    case "--id": id = it.next() ?? id
    case "--text": text = it.next() ?? text
    case "--lang": lang = it.next()
    case "--rate": rate = Float(it.next() ?? "")
    case "--pitch": pitch = Float(it.next() ?? "")
    case "--volume": volume = Float(it.next() ?? "")
    default: break
    }
  }
  guard !text.isEmpty else { return nil }
  return Args(id: id, text: text, lang: lang, rate: rate, pitch: pitch, volume: volume)
}

final class SynthDelegate: NSObject, AVSpeechSynthesizerDelegate {
  let id: String
  init(id: String) { self.id = id }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
    print("\n{\"type\":\"start\",\"id\":\"")
  }
}

// Minimal stream with word boundary events
class WordBoundarySynth: NSObject, AVSpeechSynthesizerDelegate {
  private let synth = AVSpeechSynthesizer()
  private let args: Args
  private var nsText: NSString
  init(args: Args) {
    self.args = args
    self.nsText = args.text as NSString
    super.init()
    synth.delegate = self
  }
  func start() {
    let u = AVSpeechUtterance(string: args.text)
    if let lang = args.lang { u.voice = AVSpeechSynthesisVoice(language: lang) }
    u.rate = args.rate ?? AVSpeechUtteranceDefaultSpeechRate
    if let p = args.pitch { u.pitchMultiplier = p }
    if let v = args.volume { u.volume = v }
    print("{\"type\":\"start\",\"id\":\"\(args.id)\"}")
    synth.speak(u)
    RunLoop.current.run()
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, willSpeakRangeOfSpeechString characterRange: NSRange, utterance: AVSpeechUtterance) {
    let start = characterRange.location
    let end = characterRange.location + characterRange.length
    print("{\"type\":\"word\",\"id\":\"\(args.id)\",\"start\":\(start),\"end\":\(end)}")
    fflush(stdout)
  }
  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    print("{\"type\":\"done\",\"id\":\"\(args.id)\"}")
    fflush(stdout)
    exit(0)
  }
  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    print("{\"type\":\"done\",\"id\":\"\(args.id)\"}")
    fflush(stdout)
    exit(0)
  }
}

guard let args = parseArgs() else {
  fputs("{\"type\":\"error\",\"error\":\"missing text\"}\n", stderr)
  exit(1)
}

let runner = WordBoundarySynth(args: args)
runner.start()



import Foundation
import Vision
import AppKit

struct OCRResult: Codable {
    let text: String
    let confidence: Int
    let wordCount: Int
}

struct OCRError: Codable {
    let error: String
}

@available(macOS 10.15, *)
func recognizeText(at imagePath: String, languages: [String] = []) -> OCRResult? {
    guard let imageURL = URL(string: "file://" + imagePath),
          let imageData = try? Data(contentsOf: imageURL),
          let cgImage = createCGImage(from: imageData) else {
        return nil
    }
    
    var recognizedTexts: [String] = []
    var maxConfidence: Float = 0.0
    let semaphore = DispatchSemaphore(value: 0)
    
    let request = VNRecognizeTextRequest { request, error in
        defer { semaphore.signal() }
        
        if let error = error {
            fputs("Vision error: \(error.localizedDescription)\n", stderr)
            return
        }
        
        guard let observations = request.results as? [VNRecognizedTextObservation] else {
            return
        }
        
        for observation in observations {
            guard let topCandidate = observation.topCandidates(1).first else { continue }
            recognizedTexts.append(topCandidate.string)
            maxConfidence = max(maxConfidence, topCandidate.confidence)
        }
    }
    
    // Configure recognition settings
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    
    // Set recognition languages if provided
    if !languages.isEmpty {
        // Map common language codes to Vision framework codes
        let visionLanguages = languages.compactMap { lang -> String? in
            switch lang.lowercased() {
            case "en", "english": return "en"
            case "zh", "ch_sim", "chinese", "zh-hans": return "zh-Hans"
            case "zh-hant", "ch_tra": return "zh-Hant"
            case "ja", "japanese": return "ja"
            case "ko", "korean": return "ko"
            case "es", "spanish": return "es"
            case "fr", "french": return "fr"
            case "de", "german": return "de"
            case "it", "italian": return "it"
            case "pt", "portuguese": return "pt"
            case "ru", "russian": return "ru"
            case "ar", "arabic": return "ar"
            default: return lang // Pass through unknown codes
            }
        }
        
        if !visionLanguages.isEmpty {
            request.recognitionLanguages = visionLanguages
        }
    }
    
    // Perform the OCR request
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    
    do {
        try handler.perform([request])
        semaphore.wait()
    } catch {
        fputs("Failed to perform OCR: \(error.localizedDescription)\n", stderr)
        return nil
    }
    
    let finalText = recognizedTexts.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    let confidence = Int(maxConfidence * 100)
    
    return OCRResult(
        text: finalText,
        confidence: confidence,
        wordCount: recognizedTexts.count
    )
}

func createCGImage(from data: Data) -> CGImage? {
    guard let imageSource = CGImageSourceCreateWithData(data as CFData, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
        return nil
    }
    return cgImage
}


func printUsage() {
    print("Usage: VisionOCRBridge <image_path> [language_codes...]")
    print("Example: VisionOCRBridge /path/to/image.png en zh ja")
    print("Supported languages: en, zh, ja, ko, es, fr, de, it, pt, ru, ar")
}

// Main execution
@available(macOS 10.15, *)
func performOCR() {
    let arguments = CommandLine.arguments
    
    guard arguments.count >= 2 else {
        printUsage()
        exit(1)
    }
    
    let imagePath = arguments[1]
    let languages = Array(arguments.dropFirst(2))
    
    // Check if file exists
    guard FileManager.default.fileExists(atPath: imagePath) else {
        let error = OCRError(error: "Image file not found: \(imagePath)")
        if let jsonData = try? JSONEncoder().encode(error),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
        exit(1)
    }
    
    // Perform OCR
    if let result = recognizeText(at: imagePath, languages: languages) {
        do {
            let jsonData = try JSONEncoder().encode(result)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                print(jsonString)
            }
        } catch {
            let errorResult = OCRError(error: "Failed to encode result: \(error.localizedDescription)")
            if let jsonData = try? JSONEncoder().encode(errorResult),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                print(jsonString)
            }
            exit(1)
        }
    } else {
        let error = OCRError(error: "Failed to recognize text from image")
        if let jsonData = try? JSONEncoder().encode(error),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
        exit(1)
    }
}

func main() {
    if #available(macOS 10.15, *) {
        performOCR()
    } else {
        let error = OCRError(error: "Vision framework requires macOS 10.15 or later")
        if let jsonData = try? JSONEncoder().encode(error),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
        exit(1)
    }
}

main()

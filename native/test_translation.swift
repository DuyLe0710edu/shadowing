#!/usr/bin/env swift

import Foundation
import Translation

@available(macOS 15.0, *)
func testTranslation() async {
    print("Testing Translation framework availability...")
    
    let config = TranslationSession.Configuration(
        source: Locale.Language(identifier: "en"),
        target: Locale.Language(identifier: "ja")
    )
    
    print("Configuration created: \(config)")
    print("Translation framework is accessible")
}

if #available(macOS 15.0, *) {
    Task {
        await testTranslation()
        exit(0)
    }
    RunLoop.main.run()
} else {
    print("macOS 15.0+ required")
    exit(1)
}


func testTranslation2() {
    let config = TranslationSession.Configuration(
        source: Locale.Language(identifier: "en"),
        target: Locale.Language(identifier: "ja")
    )

    let session = TranslationSession(configuration: config)
    let result = session.translate(text: "Hello, good morning how are you doing ?")
    print(result)
}
import Foundation
import Speech

let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
print(recognizer != nil ? "Speech works" : "Speech fails")

import sys
import threading
import json
import urllib.request
import urllib.parse
from PyQt6.QtWidgets import QApplication, QLabel, QMainWindow, QWidget, QPushButton, QVBoxLayout
from PyQt6.QtCore import Qt, pyqtSignal, QObject, QTimer
import speech_recognition as sr

is_paused = False
clear_context_flag = False

class Communicator(QObject):
    update_text = pyqtSignal(str)
    clear_text = pyqtSignal()

class Overlay(QMainWindow):
    def __init__(self):
        super().__init__()
        # Removed WindowTransparentForInput so buttons can be clicked
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | 
                            Qt.WindowType.WindowStaysOnTopHint | 
                            Qt.WindowType.WindowDoesNotAcceptFocus)
        
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
        
        # Main container
        self.container = QWidget()
        self.container.setStyleSheet("background-color: rgba(0, 0, 0, 180); border-radius: 15px;")
        
        self.layout = QVBoxLayout()
        self.layout.setContentsMargins(20, 20, 20, 20)
        
        # Pause Button
        self.pause_btn = QPushButton("Pause")
        self.pause_btn.setFixedSize(100, 30)
        self.pause_btn.setStyleSheet("background-color: #444; color: white; border-radius: 5px; font-weight: bold;")
        self.pause_btn.clicked.connect(self.toggle_pause)
        
        self.layout.addWidget(self.pause_btn, 0, Qt.AlignmentFlag.AlignHCenter)
        
        # Text Label
        self.label = QLabel("", self)
        self.label.setStyleSheet("color: white; background-color: transparent;")
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label.setWordWrap(True)
        # Lock the horizontal width to 1000px so it only adapts vertically
        self.container.setFixedWidth(1000)
        
        self.layout.addWidget(self.label)
        self.container.setLayout(self.layout)
        self.setCentralWidget(self.container)
        
        self.comm = Communicator()
        self.comm.update_text.connect(self.set_text)
        self.comm.clear_text.connect(self.clear_text)
        
        self.clear_timer = QTimer()
        self.clear_timer.setSingleShot(True)
        self.clear_timer.timeout.connect(self.clear_text)
        
        self.recenter()

    def toggle_pause(self):
        global is_paused
        is_paused = not is_paused
        if is_paused:
            self.pause_btn.setText("Resume")
            self.comm.update_text.emit(format_text("Microphone Paused", "Click Resume to continue..."))
        else:
            self.pause_btn.setText("Pause")
            self.clear_text()
            self.comm.update_text.emit(format_text("Listening in English..."))

    def recenter(self):
        self.adjustSize()
        screen = QApplication.primaryScreen().geometry()
        self.move(int((screen.width() - self.width()) / 2), screen.height() - self.height() - 150)

    def set_text(self, text):
        if text.strip():
            self.label.setText(text)
            self.label.show()
            self.recenter()
            # Clear text after 2.5 seconds of silence
            if "Listening in English" not in text and "Adjusting for background noise" not in text and "Microphone Paused" not in text:
                self.clear_timer.start(2500)
            
    def clear_text(self):
        global clear_context_flag
        self.label.setText("")
        clear_context_flag = True
        self.recenter()

import urllib.request
import urllib.parse
import json

def translate(text):
    if not text: return ""
    try:
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=it&dt=t&q={urllib.parse.quote(text)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode())
            return "".join([t[0] for t in res[0]])
    except Exception as e:
        print("Translation error:", e)
        return text

import sounddevice as sd
from vosk import Model, KaldiRecognizer
import queue

translation_q = queue.Queue()

def format_text(translated, english=""):
    if not english:
        return f"<div style='text-align: center; font-family: -apple-system; font-size: 34px; font-weight: bold;'>{translated}</div>"
    return f"<div style='text-align: center; font-family: -apple-system; font-size: 34px; font-weight: bold;'>{translated}</div><div style='text-align: center; font-family: -apple-system; font-size: 18px; color: #cccccc; margin-top: 5px;'>{english}</div>"

def translation_worker(comm):
    while True:
        try:
            text_to_translate = translation_q.get()
            
            # Drain the queue to get the absolute latest partial result
            # so we don't waste time translating stale partial words
            while not translation_q.empty():
                try:
                    text_to_translate = translation_q.get_nowait()
                except queue.Empty:
                    break
                    
            if text_to_translate.strip():
                translated = translate(text_to_translate)
                comm.update_text.emit(format_text(translated, text_to_translate))
        except Exception as e:
            pass

def listen_loop(comm):
    global is_paused, clear_context_flag
    q = queue.Queue()

    def callback(indata, frames, time, status):
        if status:
            pass
        q.put(bytes(indata))

    try:
        comm.update_text.emit(format_text("Loading Voice Model..."))
        # Using the highly accurate 1.8GB model
        model = Model(model_name="vosk-model-en-us-0.22")
        rec = KaldiRecognizer(model, 16000)
        
        comm.update_text.emit(format_text("Listening in English..."))
        
        last_translated_text = ""
        full_sentence = ""
        
        with sd.RawInputStream(samplerate=16000, blocksize=1024, device=None, dtype='int16',
                               channels=1, callback=callback):
            while True:
                data = q.get()
                
                if clear_context_flag:
                    full_sentence = ""
                    last_translated_text = ""
                    clear_context_flag = False
                    
                if is_paused:
                    continue
                    
                if rec.AcceptWaveform(data):
                    # Phrase finished
                    res = json.loads(rec.Result())
                    text = res.get("text", "")
                    if text:
                        full_sentence += text + " "
                        translation_q.put(full_sentence.strip())
                else:
                    # Partial phrase
                    res = json.loads(rec.PartialResult())
                    partial = res.get("partial", "")
                    if partial and partial != last_translated_text:
                        last_translated_text = partial
                        english_text = (full_sentence + partial).strip()
                        # Prevent flickering and random noise by ignoring tiny partials (1 short word)
                        if len(partial.split()) >= 2 or len(partial) > 4:
                            translation_q.put(english_text)

    except Exception as e:
        print("Vosk/Audio Error:", e)
        comm.update_text.emit(format_text("Error starting audio. Check microphone permissions."))

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = Overlay()
    window.show()
    
    t1 = threading.Thread(target=listen_loop, args=(window.comm,), daemon=True)
    t1.start()
    
    t2 = threading.Thread(target=translation_worker, args=(window.comm,), daemon=True)
    t2.start()
    
    sys.exit(app.exec())

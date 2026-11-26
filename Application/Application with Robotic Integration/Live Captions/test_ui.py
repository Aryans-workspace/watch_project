import sys
from PyQt6.QtWidgets import QApplication, QWidget, QPushButton, QVBoxLayout, QMainWindow
from PyQt6.QtCore import Qt

app = QApplication(sys.argv)

controls = QWidget()
controls.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.Tool)
controls.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
layout = QVBoxLayout(controls)
btn = QPushButton("Pause", controls)
btn.setFixedSize(100, 30)
btn.setStyleSheet("background-color: #444; color: white;")
layout.addWidget(btn)

print(f"Widget size before show: {controls.width()}x{controls.height()}")
controls.show()
print(f"Widget size after show: {controls.width()}x{controls.height()}")

QTimer.singleShot(1000, app.quit)
sys.exit(app.exec())

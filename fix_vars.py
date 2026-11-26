import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''                self._log_training("Golden template constructed successfully.")
                calibrated_threshold = 26.0
                self._log_training(f"Calibration: Normal Mean Score=0.00, Max Normal=0.00")
                self._log_training(f"Recommended Anomaly Threshold: {calibrated_threshold}")
            else:'''

replacement = '''                self._log_training("Golden template constructed successfully.")
                calibrated_threshold = 26.0
                mean_good = 0.0
                max_good = 0.0
                layers = []
                self._log_training(f"Calibration: Normal Mean Score=0.00, Max Normal=0.00")
                self._log_training(f"Recommended Anomaly Threshold: {calibrated_threshold}")
            else:'''

content = content.replace(target, replacement)

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added layers, mean_good, max_good to pixel_ssim")

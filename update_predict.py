import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''        # Inference
        with torch.no_grad():
            pred = self.active_model(batch)

        # Parse Anomalib predictions
        anomaly_map = pred.anomaly_map.squeeze().cpu().numpy()
        pred_score = pred.pred_score.item()

        # Decision threshold mapping (heuristic normalized to 0-1)
        # PatchCore outputs unbounded distances. We use 1.0 as typical normal, >3.0 as severe defect
        normalized_score = min(1.0, max(0.0, (pred_score - 0.5) / 3.0))

        # Adjust threshold based on dust sensitivity
        # High sensitivity lowers threshold
        base_threshold = 0.40
        if dust_sens == "high":
            base_threshold = 0.25
        elif dust_sens == "low":
            base_threshold = 0.60

        verdict = "DEFECT" if normalized_score > base_threshold else "OK"
        confidence = int(normalized_score * 100) if verdict == "DEFECT" else int((1.0 - normalized_score) * 100)'''

replacement = '''        if self.active_metadata.get("backbone") == "pixel_ssim":
            import cv2
            gray = cv2.cvtColor(rgb_roi, cv2.COLOR_BGR2GRAY)
            golden = self.active_model
            diff = cv2.absdiff(gray, golden)
            blur = cv2.GaussianBlur(diff, (5, 5), 0)
            _, thresh = cv2.threshold(blur, 25, 255, cv2.THRESH_BINARY)
            
            # Create a heatmap from the binary difference
            anomaly_map = blur.astype(np.float32) / 255.0
            
            # Simple scoring: ratio of changed pixels
            changed_pixels = np.count_nonzero(thresh)
            total_pixels = thresh.size
            ratio = changed_pixels / total_pixels
            
            normalized_score = min(1.0, (ratio * 100)) # If 1% pixels change, score is 1.0 (100% defect)
            pred_score = ratio * 100
            
            base_threshold = 0.05
            if dust_sens == "high": base_threshold = 0.02
            elif dust_sens == "low": base_threshold = 0.15
            
            verdict = "DEFECT" if normalized_score > base_threshold else "OK"
            confidence = int(normalized_score * 100) if verdict == "DEFECT" else int((1.0 - normalized_score) * 100)
            
        else:
            # Inference
            with torch.no_grad():
                pred = self.active_model(batch)
    
            # Parse Anomalib predictions
            anomaly_map = pred.anomaly_map.squeeze().cpu().numpy()
            pred_score = pred.pred_score.item()
    
            # Decision threshold mapping
            normalized_score = min(1.0, max(0.0, (pred_score - 0.5) / 3.0))
    
            base_threshold = 0.40
            if dust_sens == "high":
                base_threshold = 0.25
            elif dust_sens == "low":
                base_threshold = 0.60
    
            verdict = "DEFECT" if normalized_score > base_threshold else "OK"
            confidence = int(normalized_score * 100) if verdict == "DEFECT" else int((1.0 - normalized_score) * 100)'''

content = content.replace(target, replacement)

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated predict_image for pixel_ssim")

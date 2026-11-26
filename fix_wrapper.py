import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's fix PixelSSIMModel
class_target = '''        return torch.tensor([score]), None, anomaly_map
        
    def eval(self):
        pass'''

class_replacement = '''        return torch.tensor([score]), None, anomaly_map
        
    def eval(self):
        pass

# Helper to mock Anomalib output format for run_validation
class MockPred:
    def __init__(self, score, amap):
        import torch
        self.pred_score = torch.tensor([score])
        self.anomaly_map = torch.tensor(amap).unsqueeze(0).unsqueeze(0)
'''
content = content.replace(class_target, class_replacement)

# Fix __call__ to handle batch for run_validation
call_target = '''    def __call__(self, tensor):
        # tensor is 1x3xHxW. We need to do SSIM difference against self.golden
        import torch'''

call_replacement = '''    def __call__(self, batch):
        import torch
        # Handle dict batch from run_validation
        if isinstance(batch, dict) and 'image' in batch:
            tensor = batch['image']
            out_t, _, amap = self.__call__(tensor)
            return MockPred(out_t.item(), amap)
            
        tensor = batch
        # tensor is 1x3xHxW. We need to do SSIM difference against self.golden'''

content = content.replace(call_target, call_replacement)

# Revert run_validation hack
revert_target = '''        if self.active_metadata.get("backbone") == "pixel_ssim":
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

revert_replacement = '''        # Inference
        with torch.no_grad():
            pred = self.active_model(batch)

        # Parse Anomalib predictions
        anomaly_map = pred.anomaly_map.squeeze().cpu().numpy()
        pred_score = pred.pred_score.item()

        # Decision threshold mapping (heuristic normalized to 0-1)
        normalized_score = min(1.0, max(0.0, (pred_score - 0.5) / 3.0))

        # Adjust threshold based on dust sensitivity
        base_threshold = 0.40
        if dust_sens == "high":
            base_threshold = 0.25
        elif dust_sens == "low":
            base_threshold = 0.60

        verdict = "DEFECT" if normalized_score > base_threshold else "OK"
        confidence = int(normalized_score * 100) if verdict == "DEFECT" else int((1.0 - normalized_score) * 100)'''

content = content.replace(revert_target, revert_replacement)

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed PixelSSIMModel wrapper")

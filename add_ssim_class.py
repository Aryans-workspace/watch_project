import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

# I will add a PixelSSIMModel class at the top level
ssim_class = '''
class PixelSSIMModel:
    def __init__(self, golden_np):
        self.golden = golden_np
        self.model = self
        self.training = False

    def __call__(self, tensor):
        # tensor is 1x3xHxW. We need to do SSIM difference against self.golden
        import torch
        # Convert tensor to numpy BGR image (inverse transform)
        # tf normalizes with mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
        mean = np.array([0.485, 0.456, 0.406]).reshape(3, 1, 1)
        std = np.array([0.229, 0.224, 0.225]).reshape(3, 1, 1)
        
        # Denormalize
        img_np = tensor[0].cpu().numpy()
        img_np = img_np * std + mean
        img_np = np.clip(img_np * 255.0, 0, 255).astype(np.uint8)
        
        # Convert RGB to GRAY
        import cv2
        img_bgr = cv2.cvtColor(img_np.transpose(1, 2, 0), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        
        # Resize golden if needed
        golden = self.golden
        if golden.shape != gray.shape:
            golden = cv2.resize(golden, (gray.shape[1], gray.shape[0]))
            
        # Absolute difference
        diff = cv2.absdiff(gray, golden)
        blur = cv2.GaussianBlur(diff, (5, 5), 0)
        _, thresh = cv2.threshold(blur, 20, 255, cv2.THRESH_BINARY)
        
        anomaly_map = blur.astype(np.float32) / 255.0
        
        # Calculate ratio of changed pixels
        ratio = np.count_nonzero(thresh) / thresh.size
        # Map 1% change to score 30.0 (high defect), 0% to score 20.0 (ok)
        score = 20.0 + (ratio * 100.0 * 20.0) 
        
        return torch.tensor([score]), None, anomaly_map
        
    def eval(self):
        pass

# =========================================================================
'''

content = content.replace("# =========================================================================", ssim_class, 1)

# In load_model, instantiate PixelSSIMModel instead of raw numpy array
target_load = '''        if backbone == "pixel_ssim":
            golden_path = os.path.join(model_dir, "golden.npy")
            self.active_model = np.load(golden_path)'''

replacement_load = '''        if backbone == "pixel_ssim":
            golden_path = os.path.join(model_dir, "golden.npy")
            self.active_model = PixelSSIMModel(np.load(golden_path))'''

content = content.replace(target_load, replacement_load)

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added PixelSSIMModel wrapper")

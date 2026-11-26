import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''            # Initialize Patchcore with layer1, layer2, and layer3 to balance micro-defect sensitivity and spatial invariance
            if resolution == "pixel_zoom":
                # For extreme pixel-level detail, layer1 is critical. We drop layer3 to save memory and focus purely on micro-textures.
                layers = ["layer1", "layer2"]
            else:
                layers = ["layer1", "layer2", "layer3"]

            model = Patchcore(
                backbone=backbone,
                layers=layers,
                pre_trained=True,
                coreset_sampling_ratio=coreset_ratio,
                num_neighbors=9
            )

            results_dir = os.path.join(model_dir, "results")
            os.makedirs(results_dir, exist_ok=True)
            engine = Engine(max_epochs=1, accelerator="cpu", default_root_dir=results_dir)

            self.training_state["progress_pct"] = 55
            self.training_state["message"] = "Building coreset memory bank..."

            # Fit model
            engine.fit(model=model, train_dataloaders=train_dl)

            self.training_state["progress_pct"] = 80
            self.training_state["message"] = "Calibrating decision threshold..."
            self._log_training("Coreset memory bank constructed successfully.")

            # Save the trained model weights manually
            model_path = os.path.join(model_dir, "patchcore_model.ckpt")
            torch.save(model.state_dict(), model_path)'''

replacement = '''            if backbone == "pixel_ssim":
                self._log_training("Initializing Pixel-Level Subtraction Engine (Golden Reference)...")
                layers = []
                golden = None
                count = 0
                for img_path in train_images:
                    img = cv2.imread(img_path)
                    if img is None: continue
                    img = cv2.resize(img, (img_size, img_size))
                    img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    if golden is None:
                        golden = np.zeros_like(img, dtype=np.float32)
                    golden += img.astype(np.float32)
                    count += 1
                golden = (golden / count).astype(np.uint8)
                np.save(os.path.join(model_dir, "golden.npy"), golden)
                self.training_state["progress_pct"] = 80
                self.training_state["message"] = "Golden template constructed."
                self._log_training("Golden template constructed successfully.")
            else:
                # Initialize Patchcore with layer1, layer2, and layer3 to balance micro-defect sensitivity and spatial invariance
                if resolution == "pixel_zoom":
                    layers = ["layer1", "layer2"]
                else:
                    layers = ["layer1", "layer2", "layer3"]
    
                model = Patchcore(
                    backbone=backbone,
                    layers=layers,
                    pre_trained=True,
                    coreset_sampling_ratio=coreset_ratio,
                    num_neighbors=9
                )
    
                results_dir = os.path.join(model_dir, "results")
                os.makedirs(results_dir, exist_ok=True)
                engine = Engine(max_epochs=1, accelerator="cpu", default_root_dir=results_dir)
    
                self.training_state["progress_pct"] = 55
                self.training_state["message"] = "Building coreset memory bank..."
    
                engine.fit(model=model, train_dataloaders=train_dl)
    
                self.training_state["progress_pct"] = 80
                self.training_state["message"] = "Calibrating decision threshold..."
                self._log_training("Coreset memory bank constructed successfully.")
    
                model_path = os.path.join(model_dir, "patchcore_model.ckpt")
                torch.save(model.state_dict(), model_path)'''

content = content.replace(target, replacement)

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated training for pixel_ssim")

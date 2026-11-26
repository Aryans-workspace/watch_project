# Model Weights & Checkpoints Directory

Due to GitHub's 100MB file limit, binary deep learning checkpoints (`*.pt`, `*.ckpt`) are excluded from version control.

### How to use:
1. **Trained Models**: When training a new PatchCore model using `patchcore_engine.py`, output directories will automatically be populated with `metadata.json` and `weights.pt`.
2. **Existing Models**: If you received pre-trained weights separately (e.g. via shared drive), place the corresponding `weights.pt` inside each model's subfolder (e.g., `Test_2_wide_resnet50_2_20260917_160025/weights.pt`).

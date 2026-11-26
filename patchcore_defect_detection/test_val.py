from patchcore_engine import PatchcoreEngine

engine = PatchcoreEngine()
try:
    import os
    models = os.listdir(engine.models_dir)
    ssim_models = [m for m in models if "pixel_ssim" in m]
    if ssim_models:
        model_id = ssim_models[-1]
        print("Testing load_model on", model_id)
        engine.load_model(model_id)
        print("Load model success!")
        print("Testing run_validation...")
        engine.run_validation(model_id)
        print("Run validation success!")
    else:
        print("No ssim models found")
except Exception as e:
    import traceback
    traceback.print_exc()

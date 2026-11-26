from patchcore_engine import PatchcoreEngine

engine = PatchcoreEngine()
try:
    print("Listing models:", engine.list_models())
    # Assuming 'versaceblack_custom_pixel_ssim_20261001_161607' is a model
    import os
    models = os.listdir(engine.models_dir)
    ssim_models = [m for m in models if "pixel_ssim" in m]
    if ssim_models:
        model_id = ssim_models[-1]
        print("Testing load_model on", model_id)
        engine.load_model(model_id)
        print("Load model success!")
    else:
        print("No ssim models found")
except Exception as e:
    import traceback
    traceback.print_exc()

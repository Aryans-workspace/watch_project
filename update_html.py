import re

with open('patchcore_defect_detection/templates/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''                            <div class="form-row-2col">
                                <div class="control-row">
                                    <label for="selectBackbone">Feature Extractor Backbone</label>'''

replacement = '''                            <div class="form-row-2col">
                                <div class="control-row">
                                    <label for="selectResolution">Inspection Resolution & Precision</label>
                                    <select id="selectResolution" class="select-input">
                                        <option value="standard" selected>Standard (448x448) - Optimal</option>
                                        <option value="pixel_zoom">Micro-Defect Pixel Zoom (896x896) - Extreme Detail (Lint/Hair)</option>
                                    </select>
                                </div>
                                <div class="control-row">
                                    <label for="selectBackbone">Feature Extractor Backbone</label>'''

content = content.replace(target, replacement)

# We need to add the new dropdown value to the API payload
payload_target = '''            const payload = {
                dataset_name: dsName,
                backbone: backbone,
                coreset_ratio: coreset,
                focus_mode: focusMode
            };'''

payload_replacement = '''            const payload = {
                dataset_name: dsName,
                backbone: backbone,
                coreset_ratio: coreset,
                focus_mode: focusMode,
                resolution: document.getElementById('selectResolution').value || "standard"
            };'''

content = content.replace(payload_target, payload_replacement)

with open('patchcore_defect_detection/templates/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated HTML with resolution option.")

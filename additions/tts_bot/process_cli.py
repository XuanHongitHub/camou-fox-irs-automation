# -*- coding: utf-8 -*-
"""
CLI wrapper for Auto-Crop and EXIF Injection
Can be invoked directly by Electron without HTTP dependencies.
"""

import sys
import os
import argparse
import json
from exif_engine import inject_iphone_exif
from crop_filter import crop_cr80_and_filter

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--preset", default="iPhone 14 Pro")
    parser.add_argument("--crop", action="store_true")
    args = parser.parse_args()

    input_path = os.path.abspath(args.input)
    output_path = os.path.abspath(args.output)
    
    if not os.path.exists(input_path):
        print(json.dumps({"ok": False, "error": f"File not found: {input_path}"}))
        sys.exit(1)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    temp_crop = output_path + ".tmp_crop.jpg"
    try:
        if args.crop:
            crop_cr80_and_filter(input_path, temp_crop, enhance=True)
            source_for_exif = temp_crop
        else:
            source_for_exif = input_path

        exif_info = inject_iphone_exif(source_for_exif, output_path, preset_name=args.preset)
        
        if os.path.exists(temp_crop):
            try: os.remove(temp_crop)
            except Exception: pass
            
        print(json.dumps({"ok": True, "output": output_path, "exif": exif_info}))
    except Exception as e:
        if os.path.exists(temp_crop):
            try: os.remove(temp_crop)
            except Exception: pass
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()

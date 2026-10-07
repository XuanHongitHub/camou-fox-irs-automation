# -*- coding: utf-8 -*-
"""
EXIF Normalization Engine for TTS-Bot
Injects genuine Apple iPhone camera metadata into images to bypass AI detection.
"""

import os
import io
import time
import datetime
from PIL import Image
import piexif

IPHONE_PRESETS = {
    "iPhone 14 Pro": {
        "Make": "Apple",
        "Model": "iPhone 14 Pro",
        "Software": "17.3.1",
        "LensMake": "Apple",
        "LensModel": "iPhone 14 Pro back triple camera 6.86mm f/1.78",
        "FocalLength": (686, 100),
        "FNumber": (178, 100),
        "ISOSpeedRatings": 64,
    },
    "iPhone 15 Pro": {
        "Make": "Apple",
        "Model": "iPhone 15 Pro",
        "Software": "17.4.1",
        "LensMake": "Apple",
        "LensModel": "iPhone 15 Pro back triple camera 6.76mm f/1.78",
        "FocalLength": (676, 100),
        "FNumber": (178, 100),
        "ISOSpeedRatings": 50,
    },
    "iPhone 13 Pro": {
        "Make": "Apple",
        "Model": "iPhone 13 Pro",
        "Software": "17.2.1",
        "LensMake": "Apple",
        "LensModel": "iPhone 13 Pro back triple camera 5.7mm f/1.5",
        "FocalLength": (570, 100),
        "FNumber": (150, 100),
        "ISOSpeedRatings": 80,
    }
}

def inject_iphone_exif(input_path: str, output_path: str, preset_name: str = "iPhone 14 Pro") -> dict:
    """
    Cleans all editing artifacts and injects authentic Apple EXIF metadata.
    """
    preset = IPHONE_PRESETS.get(preset_name, IPHONE_PRESETS["iPhone 14 Pro"])
    
    with Image.open(input_path) as img:
        # Convert RGBA/P to RGB if needed
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
            
        now = datetime.datetime.now()
        dt_str = now.strftime("%Y:%m:%d %H:%M:%S")
        
        # Build 0th IFD
        zeroth_ifd = {
            piexif.ImageIFD.Make: preset["Make"],
            piexif.ImageIFD.Model: preset["Model"],
            piexif.ImageIFD.Software: preset["Software"],
            piexif.ImageIFD.DateTime: dt_str,
            piexif.ImageIFD.Orientation: 1,
            piexif.ImageIFD.XResolution: (72, 1),
            piexif.ImageIFD.YResolution: (72, 1),
            piexif.ImageIFD.ResolutionUnit: 2,
        }
        
        # Build Exif IFD
        exif_ifd = {
            piexif.ExifIFD.DateTimeOriginal: dt_str,
            piexif.ExifIFD.DateTimeDigitized: dt_str,
            piexif.ExifIFD.FocalLength: preset["FocalLength"],
            piexif.ExifIFD.FNumber: preset["FNumber"],
            piexif.ExifIFD.ISOSpeedRatings: preset["ISOSpeedRatings"],
            piexif.ExifIFD.LensMake: preset["LensMake"],
            piexif.ExifIFD.LensModel: preset["LensModel"],
            piexif.ExifIFD.ExposureProgram: 2, # Normal program
            piexif.ExifIFD.MeteringMode: 5,   # Pattern
            piexif.ExifIFD.Flash: 16,          # Flash did not fire, compulsory flash mode
            piexif.ExifIFD.WhiteBalance: 0,    # Auto white balance
            piexif.ExifIFD.SceneCaptureType: 0 # Standard
        }
        
        exif_dict = {"0th": zeroth_ifd, "Exif": exif_ifd, "GPS": {}, "1st": {}, "thumbnail": None}
        exif_bytes = piexif.dump(exif_dict)
        
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        img.save(output_path, "JPEG", quality=95, exif=exif_bytes)
        
    return {
        "status": "success",
        "output_path": output_path,
        "preset": preset_name,
        "device": f"{preset['Make']} {preset['Model']}",
        "software": preset["Software"],
        "timestamp": dt_str
    }

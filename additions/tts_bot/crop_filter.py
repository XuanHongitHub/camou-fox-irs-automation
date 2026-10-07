# -*- coding: utf-8 -*-
"""
Auto-Crop & Filter Engine for TTS-Bot
Crops ID cards to standard CR80 aspect ratio (1.586:1) and enhances clarity.
"""

import os
from PIL import Image, ImageEnhance, ImageOps

CR80_RATIO = 85.6 / 53.98  # ~1.58577

def crop_cr80_and_filter(input_path: str, output_path: str, enhance: bool = True) -> dict:
    """
    Crops image to CR80 ratio and applies subtle enhancement for OCR/TikTok AI.
    """
    with Image.open(input_path) as img:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
            
        w, h = img.size
        target_ratio = CR80_RATIO
        
        # Determine orientation
        if h > w:
            # Vertical image, target vertical CR80 or rotate
            target_ratio = 1.0 / CR80_RATIO
            
        current_ratio = w / h
        
        if current_ratio > target_ratio:
            # Too wide, crop width
            new_w = int(h * target_ratio)
            left = (w - new_w) // 2
            top = 0
            right = left + new_w
            bottom = h
        else:
            # Too tall, crop height
            new_h = int(w / target_ratio)
            left = 0
            top = (h - new_h) // 2
            right = w
            bottom = top + new_h
            
        cropped = img.crop((left, top, right, bottom))
        
        if enhance:
            # Auto-contrast
            cropped = ImageOps.autocontrast(cropped, cutoff=1)
            # Enhance sharpness subtly
            sharpener = ImageEnhance.Sharpness(cropped)
            cropped = sharpener.enhance(1.15)
            # Enhance color balance slightly
            color = ImageEnhance.Color(cropped)
            cropped = color.enhance(1.05)
            
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        cropped.save(output_path, "JPEG", quality=95)
        
    return {
        "status": "success",
        "output_path": output_path,
        "original_size": (w, h),
        "cropped_size": cropped.size,
        "ratio": f"{target_ratio:.3f}"
    }

import sys
import pandas as pd
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

dir_125 = Path(r"F:\Herd\fox-auto\outputs\drive_cleaned_v2\25-09-2026_-_125_DONE")
dir_1271 = Path(r"F:\Herd\fox-auto\outputs\drive_cleaned_v2\26-09-2026_-_1271_DONE")

for d, label in [(dir_125, "LÔ 125"), (dir_1271, "LÔ 1271")]:
    print("\n" + "="*70)
    print(f"KIỂM TRA CHI TIẾT: {label} ({d.name})")
    print("="*70)
    
    orig_csv = list(d.glob("*_ORIGINAL.csv"))
    clean_csv = list(d.glob("*_CLEANED.csv"))
    
    if not orig_csv or not clean_csv:
        print(f"Thiếu file CSV trong {d}")
        continue
        
    df_orig = pd.read_csv(orig_csv[0], dtype=str).fillna('')
    df_clean = pd.read_csv(clean_csv[0], dtype=str).fillna('')
    
    print(f"Tổng số records: {len(df_orig)}")
    
    pdf_backup_dir = d / "PDF_BACKUP"
    pdf_clean_dir = d / "PDF_CLEANED"
    
    back_count = len(list(pdf_backup_dir.glob("*.pdf"))) if pdf_backup_dir.exists() else 0
    clean_count = len(list(pdf_clean_dir.glob("*.pdf"))) if pdf_clean_dir.exists() else 0
    
    print(f"PDF Backup (gốc tải về): {back_count}")
    print(f"PDF Cleaned (đã sửa local): {clean_count}")
    
    # Check how many ZIPs actually changed between ORIGINAL and CLEANED
    zip_diffs = []
    for idx in range(min(len(df_orig), len(df_clean))):
        o_row = df_orig.iloc[idx]
        c_row = df_clean.iloc[idx]
        
        o_zip = str(o_row.get('ZIP', '')).strip()
        c_zip = str(c_row.get('ZIP', '')).strip()
        
        if o_zip != c_zip:
            zip_diffs.append((
                c_row.get('NAME', ''),
                c_row.get('ADDRESS', ''),
                c_row.get('CITI', ''),
                c_row.get('BANG', ''),
                o_zip,
                c_zip
            ))
            
    print(f"Số record có ZIP thay đổi giữa ORIGINAL và CLEANED: {len(zip_diffs)}")
    print(f"Số record GIỮ NGUYÊN ZIP: {len(df_orig) - len(zip_diffs)}")
    
    print("\n10 mẫu thay đổi ZIP đầu tiên:")
    for m in zip_diffs[:10]:
        print(f"  {m[0]}: {m[1]}, {m[2]}, {m[3]} | Cũ: {m[4]} -> Mới: {m[5]}")
        
    # Check for PO Box / Disallowed ZIPs in the CLEANED file!
    disallowed = {'73301', '77001', '75221', '75222', '90009', '60690', '33101'}
    bad_in_clean = []
    for idx in range(len(df_clean)):
        c_row = df_clean.iloc[idx]
        z = str(c_row.get('ZIP', '')).strip().zfill(5)
        if z in disallowed:
            bad_in_clean.append((c_row.get('NAME', ''), c_row.get('CITI', ''), c_row.get('BANG', ''), z))
            
    print(f"\nSố record trong CLEANED vẫn dính mã ZIP PO Box cấm: {len(bad_in_clean)}")
    for b in bad_in_clean[:10]:
        print(f"  [CẢNH BÁO PO BOX] {b[0]}: {b[1]}, {b[2]} dính ZIP {b[3]}")

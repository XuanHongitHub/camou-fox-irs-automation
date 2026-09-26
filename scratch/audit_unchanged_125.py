import sys
import pandas as pd
import requests
import re
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

clean_csv = Path(r"F:\Herd\fox-auto\outputs\drive_cleaned_v2\25-09-2026_-_125_DONE\25-09-2026 - 125 DONE_CLEANED.csv")
orig_csv = Path(r"F:\Herd\fox-auto\outputs\drive_cleaned_v2\25-09-2026_-_125_DONE\25-09-2026 - 125 DONE_ORIGINAL.csv")

df_clean = pd.read_csv(clean_csv, dtype=str).fillna('')
df_orig = pd.read_csv(orig_csv, dtype=str).fillna('')

unchanged_rows = []
for idx in range(len(df_clean)):
    o_z = df_orig.iloc[idx].get('ZIP', '').strip()
    c_z = df_clean.iloc[idx].get('ZIP', '').strip()
    if o_z == c_z:
        unchanged_rows.append((idx, df_clean.iloc[idx]))

print(f"Tổng số records KHÔNG ĐỔI trong Lô 125: {len(unchanged_rows)}")

sample = unchanged_rows[:50]
lines = []
for s_id, (orig_idx, r) in enumerate(sample):
    addr = re.sub(r'\s+(?:APT|UNIT|STE|SUITE|BLDG|LOT|#|FL|RM|ROOM)\s*.*$', '', r['ADDRESS'], flags=re.IGNORECASE).strip()
    lines.append(f"{s_id},{addr},{r['CITI']},{r['BANG']},{r['ZIP']}")

csv_bytes = ("\n".join(lines) + "\n").encode('utf-8')
files = {'addressFile': ('test.csv', csv_bytes, 'text/csv')}
data = {'benchmark': 'Public_AR_Current'}

resp = requests.post('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', files=files, data=data, timeout=60)

wrong_count = 0
matches = 0
for line in resp.text.strip().split('\n'):
    if not line.strip(): continue
    parts = [p.strip().strip('"') for p in line.split('","')]
    if len(parts) >= 5:
        s_id = int(parts[0].strip('"'))
        status = parts[2].strip('"')
        orig_idx, r = sample[s_id]
        current_zip = r['ZIP'].zfill(5)
        if status == "Match":
            matches += 1
            matched_addr = parts[4].strip('"')
            m = re.search(r',\s*([A-Za-z\s.-]+),\s*([A-Za-z]{2})\s*,\s*(\d{5})$', matched_addr)
            if m:
                census_zip = m.group(3)
                if census_zip != current_zip:
                    wrong_count += 1
                    print(f"  [PHÁT HIỆN SAI] {r['NAME']}: {r['ADDRESS']}, {r['CITI']}, {r['BANG']}")
                    print(f"       -> Hiện tại đang để: {current_zip} | Thực tế chuẩn Census là: {census_zip}")

print(f"\nKết quả kiểm tra 50 mẫu 'không đổi' trong Lô 125: {matches} khớp Census, trong đó CÓ {wrong_count} CÁI BỊ SAI MÃ ZIP!")

import sys
import pandas as pd
import requests
import io
import time

sys.stdout.reconfigure(encoding='utf-8')

# Read batch 03
df = pd.read_csv(r'G:\RTTS\19-08-2026\ein_irs\BATCHES_1000_SORTED\batch_03_1000.csv', dtype=str).fillna('')
sample = df.head(100)

lines = []
for idx, r in sample.iterrows():
    # ID, street, city, state, zip
    lines.append(f"{idx},{r['ADDRESS']},{r['CITI']},{r['BANG']},{r['ZIP']}")

csv_data = "\n".join(lines) + "\n"
files = {'addressFile': ('test.csv', csv_data.encode('utf-8'), 'text/csv')}
data = {'benchmark': 'Public_AR_Current'}

print("Sending 100 rows to US Census Batch Geocoder...")
start_t = time.time()
resp = requests.post('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', files=files, data=data, timeout=60)
elapsed = time.time() - start_t
print(f"Census response status: {resp.status_code} in {elapsed:.2f}s")

matches = 0
no_matches = 0
diffs = []
for line in resp.text.strip().split('\n'):
    if not line.strip():
        continue
    parts = [p.strip('"') for p in line.split('","')]
    row_id = int(parts[0].strip('"'))
    orig_row = sample.iloc[row_id]
    status = parts[2] if len(parts) > 2 else "Error"
    if status == "Match":
        matches += 1
        matched_addr = parts[4]
        # Matched address usually ends with ZIP
        import re
        m = re.search(r'\b(\d{5})\b', matched_addr)
        if m:
            census_zip = m.group(1)
            orig_zip = orig_row['ZIP'].zfill(5)
            if census_zip != orig_zip:
                diffs.append((orig_row['NAME'], orig_row['ADDRESS'], orig_row['CITI'], orig_row['BANG'], orig_zip, census_zip))
    else:
        no_matches += 1

print(f"Results: {matches} matched, {no_matches} no-match ({matches / len(sample) * 100:.1f}% match rate)")
print(f"ZIP differences found: {len(diffs)}")
for d in diffs[:10]:
    print(f"  {d[0]}: {d[1]}, {d[2]}, {d[3]} | Old ZIP: {d[4]} -> Census ZIP: {d[5]}")

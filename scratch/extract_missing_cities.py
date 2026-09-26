import glob
import sys
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')

db = pd.read_csv(r'F:\Herd\fox-auto\irs_bot\data\us_city_zip_county.csv', dtype=str)
db_map = {(r['city'].strip().upper(), r['state'].strip().upper()): r for _, r in db.iterrows()}

batch_files = sorted(glob.glob(r'G:\RTTS\19-08-2026\ein_irs\BATCHES_1000_SORTED\batch_*.csv'))
target_files = [f for f in batch_files if not any(x in f for x in ['_01_', '_02_'])]

missing = {}
for f in target_files:
    df = pd.read_csv(f, dtype=str).fillna('')
    for idx, row in df.iterrows():
        c = row.get('CITI', '').strip().upper()
        s = row.get('BANG', '').strip().upper()
        z = row.get('ZIP', '').strip()
        cnt = row.get('county', '').strip()
        addr = row.get('ADDRESS', '').strip()
        key = (c, s)
        if key not in db_map:
            if key not in missing:
                missing[key] = []
            if len(missing[key]) < 2:
                missing[key].append((addr, z, cnt))

print(f"Total distinct missing (city, state): {len(missing)}")
for (c, s), samples in sorted(missing.items(), key=lambda x: x[0]):
    print(f"('{c}', '{s}'): {samples}")

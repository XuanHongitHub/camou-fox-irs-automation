import csv
import json

path = r"F:\Herd\fox-auto\app\dist\IRS_Bot_Full_Package\data\bug-auto\outputs\results.csv"
with open(path, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        if i >= 5:
            break
        print(f"Row {i}: record_id={row.get('record_id')} | county={row.get('step6_county')} | state={row.get('step6_state')}")
        print(f"  loc: {row.get('step6_physical_location')}")
        print(f"  pdf: {row.get('final_pdf_path')}")
        if row.get('step6_data_json'):
            try:
                data = json.loads(row['step6_data_json'])
                print(f"  data keys: {list(data.keys())}")
            except Exception as e:
                print(f"  data error: {e}")

import pymupdf
import sys

sys.stdout.reconfigure(encoding='utf-8')

f_clean = r'F:\Herd\fox-auto\outputs\drive_cleaned_v2\25-09-2026_-_125_DONE\PDF_CLEANED\COLLEEN GLASSMAN - 42-5291781 - 261836769.pdf'
doc = pymupdf.open(f_clean)
page = doc[0]
d = page.get_text('dict')
for b in d['blocks']:
    if b.get('type') == 0:
        for l in b['lines']:
            for s in l['spans']:
                if 130 < s['bbox'][1] < 230:
                    print(f"bbox={s['bbox']}, origin={s.get('origin')}, text={repr(s['text'])}")

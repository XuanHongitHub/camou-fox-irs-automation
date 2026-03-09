# ZIP -> County Dataset

`runner.py` loads `us_zip_county.csv` at runtime to resolve `countyInput`.

Schema:

```csv
zip,county
74112,Tulsa
```

You can replace this file with a full US ZIP-to-county dataset for better accuracy.
The automation will fallback to built-in minimal mappings and city/state heuristics if ZIP is not found.

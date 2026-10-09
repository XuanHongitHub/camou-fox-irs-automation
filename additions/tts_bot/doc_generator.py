# -*- coding: utf-8 -*-
"""
Unified Document & Statement Generator CLI (PyMuPDF Vector PDFs)
Supports:
  1. CP575: Official IRS CP575G EIN Confirmation Letter
  2. Verizon: Official Verizon Telecom Utility Bill / Proof of Address Statement
"""

import sys
import json
import argparse
from pathlib import Path

# Add current dir to path
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from cp575_builder import CP575Builder
from verizon_builder import VerizonStatementBuilder

def main():
    parser = argparse.ArgumentParser(description="Generate official verification PDFs (CP575, Verizon)")
    parser.add_argument("--type", choices=["cp575", "verizon", "all"], required=True, help="Document type")
    parser.add_argument("--data", type=str, help="JSON string representing profile data")
    parser.add_argument("--file", type=str, help="JSON file path representing profile data")
    parser.add_argument("--output-dir", type=str, default="outputs/documents", help="Target output directory")

    args = parser.parse_args()

    # Load profile data
    profile = {}
    if args.data:
        try:
            profile = json.loads(args.data)
        except Exception as e:
            print(json.dumps({"ok": False, "error": f"Failed to parse JSON data: {e}"}))
            sys.exit(1)
    elif args.file:
        try:
            with open(args.file, "r", encoding="utf-8") as f:
                profile = json.load(f)
        except Exception as e:
            print(json.dumps({"ok": False, "error": f"Failed to read JSON file: {e}"}))
            sys.exit(1)
    else:
        print(json.dumps({"ok": False, "error": "Either --data or --file must be provided"}))
        sys.exit(1)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    results = {}

    try:
        if args.type in ("cp575", "all"):
            builder_cp = CP575Builder()
            cp_pdf = builder_cp.build(profile, out_dir)
            results["cp575"] = {
                "ok": True,
                "filePath": str(cp_pdf.resolve()),
                "fileName": cp_pdf.name,
                "fileSize": cp_pdf.stat().st_size
            }

        if args.type in ("verizon", "all"):
            builder_vz = VerizonStatementBuilder()
            vz_pdf = builder_vz.build(profile, out_dir)
            results["verizon"] = {
                "ok": True,
                "filePath": str(vz_pdf.resolve()),
                "fileName": vz_pdf.name,
                "fileSize": vz_pdf.stat().st_size
            }

        primary_type = "cp575" if args.type == "cp575" else "verizon"
        if args.type == "all":
            print(json.dumps({"ok": True, "results": results}))
        else:
            print(json.dumps({
                "ok": True,
                "type": primary_type,
                "filePath": results[primary_type]["filePath"],
                "fileName": results[primary_type]["fileName"],
                "fileSize": results[primary_type]["fileSize"]
            }))
        sys.exit(0)

    except Exception as e:
        import traceback
        err_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(json.dumps({"ok": False, "error": str(e), "traceback": err_msg}))
        sys.exit(1)

if __name__ == "__main__":
    main()

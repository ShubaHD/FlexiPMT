#!/usr/bin/env python3
"""
Migrare sigură .oyo (pickle Python) → JSON FlexiPMT v1.

IMPORTANT:
- Rulați DOAR pe fișiere .oyo de încredere (ale dvs. / laborator).
- Nu încărcați .oyo din surse necunoscute în acest script.
- Nu modifică fișierul .oyo original.
- Browserul FlexiPMT NU face unpickle; importă doar JSON-ul rezultat.

Utilizare:
  python tools/oyo_migrate.py cale\\test.oyo [-o cale\\test.flexipmt.json]

Necesită: Python 3.10+, pandas, numpy, și acces la codul OYO-App
(pentru unpickle DataManager) SAU un mediu unde clasa e disponibilă.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import pickle
import sys
from datetime import datetime, timezone
from typing import Any


def _clean(o: Any) -> Any:
    if o is None:
        return None
    if isinstance(o, float):
        if math.isnan(o) or math.isinf(o):
            return None
        return o
    if isinstance(o, (int, str, bool)):
        return o
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if hasattr(o, "item"):
        try:
            return _clean(o.item())
        except Exception:
            return str(o)
    return str(o)


def _ensure_oyo_path() -> None:
    candidates = [
        os.environ.get("OYO_APP_PATH"),
        os.path.join(os.path.expanduser("~"), "Desktop", "OYO-App"),
        r"C:\Users\Shuba\Desktop\OYO-App",
    ]
    for c in candidates:
        if c and os.path.isdir(c) and os.path.isfile(os.path.join(c, "core", "data_manager.py")):
            if c not in sys.path:
                sys.path.insert(0, c)
            return
    print(
        "AVERTISMENT: OYO-App nu a fost găsit pe sys.path. "
        "Setați OYO_APP_PATH dacă unpickle eșuează.",
        file=sys.stderr,
    )


def migrate(oyo_path: str) -> dict:
    _ensure_oyo_path()
    abs_path = os.path.abspath(oyo_path)
    if not os.path.isfile(abs_path):
        raise FileNotFoundError(f"Fișier inexistent: {abs_path}")

    with open(abs_path, "rb") as f:
        data = pickle.load(f)

    if not isinstance(data, dict) or "data_manager" not in data:
        raise ValueError("Structură .oyo necunoscută (lipsește data_manager).")

    dm = data["data_manager"]
    rd = getattr(dm, "raw_data", None)
    if rd is None:
        raise ValueError("data_manager.raw_data lipsește.")

    raw_points = []
    records = rd.to_dict("records")
    for i, r in enumerate(records):
        p_mpa = r.get("Pressure[MPa]")
        p_kpa = r.get("pressure")
        if p_kpa is None and p_mpa is not None:
            p_kpa = float(p_mpa) * 1000.0
        vol = r.get("volume")
        raw_points.append(
            {
                "index": int(r["Number"]) if r.get("Number") is not None else i,
                "time": (str(r.get("Pass time[hh:mm:ss]", "")).strip() or None),
                "pressureMPa": _clean(p_mpa),
                "pressureKPa": _clean(p_kpa),
                "dRiMm": _clean(r.get("dRi[mm]")),
                "radiusMm": _clean(r.get("R[mm]")),
                "volumeCm3": _clean(vol),
            }
        )

    cal = getattr(dm, "calibration", {}) or {}
    # Normalizare chei
    calibration = {
        "kp": _clean(cal.get("kp", 1.0)),
        "ga": _clean(cal.get("ga", 1.0)),
        "radiusMm": _clean(cal.get("radius", 35.0)),
        "poisson": _clean(cal.get("poisson", 0.33)),
        "correctionsAlreadyApplied": True,
    }

    warnings = [
        "Conversie din pickle OYO — rulați doar pe fișiere de încredere.",
        "Kp/Ga: în OYO recent, calea de calcul nota că Kp/Ga sunt scoase din calcule; "
        "FlexiPMT nu reaplică corecții la import.",
        "pL din resultsLegacy (= max P) NU trebuie tratat ca rupere automată.",
    ]

    out = {
        "schemaVersion": 1,
        "migratedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "fileName": os.path.basename(abs_path),
            "format": "oyo-pickle-v1",
            "absolutePath": abs_path,
        },
        "rawPoints": raw_points,
        "calibration": calibration,
        "additionalParams": _clean(
            data.get("additional_params") or getattr(dm, "additional_params", {}) or {}
        ),
        "graphParams": _clean(getattr(dm, "graph_params", {}) or {}),
        "resultsLegacy": _clean(getattr(dm, "results", {}) or {}),
        "resultsIsoLegacy": _clean(getattr(dm, "results_iso", {}) or {}),
        "testMetadata": _clean(getattr(dm, "test_metadata", {}) or {}),
        "companyInfo": _clean(data.get("company_info") or {}),
        "reportConfig": _clean(data.get("report_config") or {}),
        "correctionsAlreadyApplied": True,
        "warnings": warnings,
    }
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Migrare .oyo → FlexiPMT JSON v1")
    ap.add_argument("oyo", help="Cale fișier .oyo de încredere")
    ap.add_argument("-o", "--output", help="Cale JSON de ieșire")
    ap.add_argument(
        "--trusted",
        action="store_true",
        help="Confirmă că fișierul este de încredere (obligatoriu)",
    )
    args = ap.parse_args()

    if not args.trusted:
        print(
            "Refuz: adăugați --trusted doar pentru fișiere .oyo pe care le controlați.",
            file=sys.stderr,
        )
        return 2

    doc = migrate(args.oyo)
    out = args.output
    if not out:
        base, _ = os.path.splitext(os.path.abspath(args.oyo))
        out = base + ".flexipmt.json"

    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)

    print(f"OK: {len(doc['rawPoints'])} puncte -> {out}")
    print("Importati JSON-ul in FlexiPMT (Import -> JSON migrat).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

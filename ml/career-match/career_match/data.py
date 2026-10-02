"""Loaders for the public datasets and the weak-label join. Pure functions where possible."""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ONET = DATA / "db_31_0_text"
POSTSECONDARY_TEACHERS = "25-1"  # crosswalk maps almost every CIP here; it says nothing about the career


def read_tsv(name: str) -> list[dict]:
    with open(ONET / f"{name}.txt", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def level(code: str) -> int:
    return int(re.search(r"\d{4}", code).group())


def load_catalog(path: Path, max_level: int = 4999) -> list[dict]:
    """Undergraduate courses (graduate 5000+ excluded), HNRS dropped, description falls back to title."""
    courses = json.loads(path.read_text())["courses"]
    out = []
    for c in courses:
        prefix = c["code"].split()[0]
        if prefix == "HNRS" or level(c["code"]) > max_level:
            continue
        out.append({"code": c["code"], "prefix": prefix, "title": c["title"],
                    "text": f'{c["title"]}. {c["description"] or c["title"]}'})
    return out


def parse_crosswalk_rows(rows) -> dict[str, set[str]]:
    """CIP code -> set of SOC codes, skipping NO MATCH rows and postsecondary-teacher codes."""
    cip_soc: dict[str, set[str]] = defaultdict(set)
    for cip, soc in rows:
        if soc == "99-9999" or soc.startswith(POSTSECONDARY_TEACHERS):
            continue
        cip_soc[cip].add(soc)
    return cip_soc


def load_crosswalk(path: Path) -> dict[str, set[str]]:
    import openpyxl
    ws = openpyxl.load_workbook(path, read_only=True)["CIP-SOC"]
    rows = [(r[0], r[2]) for i, r in enumerate(ws.iter_rows(values_only=True)) if i > 0 and r[0]]
    return parse_crosswalk_rows(rows)


def soc_to_prefixes(cip_soc: dict[str, set[str]], prefix_cip: dict[str, list[str]]) -> dict[str, set[str]]:
    """SOC code -> LSU prefixes whose mapped CIP codes list that SOC (the weak label)."""
    out: dict[str, set[str]] = defaultdict(set)
    for prefix, cips in prefix_cip.items():
        for cip, socs in cip_soc.items():
            if any(cip.startswith(p) for p in cips):
                for soc in socs:
                    out[soc].add(prefix)
    return out


def load_occupations() -> list[dict]:
    """O*NET occupations with the text used for matching (title, description, tasks, knowledge, software)."""
    occ = {r["O*NET-SOC Code"]: {"onet": r["O*NET-SOC Code"], "soc": r["O*NET-SOC Code"][:7],
                                 "title": r["Title"], "description": r["Description"],
                                 "tasks": [], "knowledge": [], "software": []}
           for r in read_tsv("Occupation Data")}
    for r in read_tsv("Task Statements"):
        if r["Task Type"] == "Core":
            occ[r["O*NET-SOC Code"]]["tasks"].append(r["Task"])
    for r in read_tsv("Knowledge"):
        if r["Scale ID"] == "IM" and float(r["Data Value"]) >= 3.5:
            occ[r["O*NET-SOC Code"]]["knowledge"].append(r["Element Name"])
    for r in read_tsv("Software Skills"):  # the Technology Skills content in v31
        names = occ[r["O*NET-SOC Code"]]["software"]
        if len(names) < 15 and r["Hot Technology"] == "Y":
            names.append(r["Workplace Example"])
    return list(occ.values())


def occupation_text(o: dict) -> str:
    return " ".join([o["title"] + ".", o["description"], *o["tasks"][:15],
                     "Knowledge: " + ", ".join(o["knowledge"]) + ".", "Tools: " + ", ".join(o["software"]) + "."])


def load_titles() -> list[tuple[str, str, str]]:
    """(title, onet code, source) from occupation titles, O*NET job titles (alternate titles) and reported titles."""
    out = [(r["Title"], r["O*NET-SOC Code"], "title") for r in read_tsv("Occupation Data")]
    out += [(r["Job Title"], r["O*NET-SOC Code"], "alt") for r in read_tsv("Job Titles")]
    out += [(r["Reported Job Title"], r["O*NET-SOC Code"], "reported") for r in read_tsv("Sample of Reported Titles")]
    return out

"""One-time download of public inputs into ml/career-match/data (git-ignored). Run by hand; tests never use the network."""
import io
import urllib.request
import zipfile
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
ONET_URL = "https://www.onetcenter.org/dl_files/database/db_31_0_text.zip"
CROSSWALK_URL = "https://nces.ed.gov/ipeds/cipcode/Files/CIP2020_SOC2018_Crosswalk.xlsx"
CATALOG_URL = "https://shep4proj.onrender.com/courses"  # free Render tier: first request can take ~60s


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=180) as r:
        return r.read()


if __name__ == "__main__":
    DATA.mkdir(exist_ok=True)
    if not (DATA / "db_31_0_text").exists():
        zipfile.ZipFile(io.BytesIO(get(ONET_URL))).extractall(DATA)
    if not (DATA / "cipsoc.xlsx").exists():
        (DATA / "cipsoc.xlsx").write_bytes(get(CROSSWALK_URL))
    if not (DATA / "catalog.json").exists():
        (DATA / "catalog.json").write_bytes(get(CATALOG_URL))

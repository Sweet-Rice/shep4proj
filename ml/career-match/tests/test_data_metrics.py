import json

import numpy as np

from career_match.data import level, load_catalog, parse_crosswalk_rows, soc_to_prefixes
from career_match.metrics import ndcg_at_k, precision_at_k


def test_crosswalk_drops_no_match_and_postsecondary_teachers():
    rows = [("11.0701", "15-1252"), ("11.0701", "25-1021"), ("01.0508", "99-9999")]
    assert parse_crosswalk_rows(rows) == {"11.0701": {"15-1252"}}


def test_soc_to_prefixes_uses_cip_prefix_match_and_skips_unmapped_prefix():
    cip_soc = {"11.0701": {"15-1252"}, "50.0901": {"27-2042"}}
    out = soc_to_prefixes(cip_soc, {"CSC": ["11.07"], "MUS": ["50.09"], "HNRS": []})
    assert out == {"15-1252": {"CSC"}, "27-2042": {"MUS"}}


def test_level():
    assert level("CSC 4263") == 4263


def test_precision_and_ndcg():
    scores = np.array([0.9, 0.8, 0.1, 0.05])
    rel = np.array([0, 1, 1, 0])
    assert precision_at_k(scores, rel, 2) == 0.5
    assert 0 < ndcg_at_k(scores, rel, 2) < 1
    assert ndcg_at_k(np.array([2.0, 1.0]), np.array([1, 0]), 2) == 1.0
    assert ndcg_at_k(scores, np.zeros(4), 2) == 0.0


def test_ndcg_rewards_rank_order_and_normalises():
    rel = np.array([1, 1, 0, 0])
    good = ndcg_at_k(np.array([0.9, 0.8, 0.1, 0.0]), rel, 4)
    swapped = ndcg_at_k(np.array([0.1, 0.0, 0.9, 0.8]), rel, 4)
    assert good == 1.0
    assert swapped < good
    # graded relevance: denominator is the ideal DCG, so a perfect ranking stays at 1.0
    assert ndcg_at_k(np.array([0.9, 0.8]), np.array([3.0, 1.0]), 2) == 1.0
    assert ndcg_at_k(np.array([0.8, 0.9]), np.array([3.0, 1.0]), 2) < 1.0


def test_soc_to_prefixes_matches_cip_only_at_the_start():
    cip_soc = {"14.0901": {"17-2061"}, "11.1400": {"15-1252"}}
    assert soc_to_prefixes(cip_soc, {"CMPE": ["14"]}) == {"17-2061": {"CMPE"}}


def test_soc_to_prefixes_matches_any_listed_cip():
    cip_soc = {"11.0701": {"15-1252"}, "14.0901": {"15-1252"}}
    assert soc_to_prefixes(cip_soc, {"CSC": ["11.07", "99.99"]}) == {"15-1252": {"CSC"}}


def test_load_catalog_filters_and_falls_back_to_title(tmp_path):
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps({"courses": [
        {"code": "CSC 1350", "title": "Intro", "description": "Programming."},
        {"code": "CSC 4263", "title": "Games", "description": ""},
        {"code": "CSC 7000", "title": "Grad", "description": "x"},
        {"code": "HNRS 2000", "title": "Honors", "description": "x"},
    ]}))
    out = load_catalog(path)
    assert [c["code"] for c in out] == ["CSC 1350", "CSC 4263"]
    assert out[0]["text"] == "Intro. Programming."
    assert out[1]["text"] == "Games. Games"
    assert out[1]["prefix"] == "CSC"
    assert [c["code"] for c in load_catalog(path, max_level=1999)] == ["CSC 1350"]

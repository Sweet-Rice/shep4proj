import numpy as np

from career_match.data import level, parse_crosswalk_rows, soc_to_prefixes
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

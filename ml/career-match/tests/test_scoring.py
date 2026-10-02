import numpy as np

from career_match.features import bm25_scores, tfidf_scores, zrow
from career_match.ranker import prefix_evidence
from career_match.titles import TitleMatcher, rank

COURSES = ["database design sql", "database systems sql queries", "music theory harmony",
           "music history opera", "welding safety", "welding practice"]
OCCS = ["database administrator sql", "music composer harmony"]


def test_tfidf_and_bm25_rank_matching_courses_first():
    for scores in (tfidf_scores(OCCS, COURSES), bm25_scores(OCCS, COURSES)):
        assert scores.shape == (2, 6)
        assert set(np.argsort(-scores[0])[:2]) == {0, 1}
        assert np.argsort(-scores[1])[0] == 2


def test_bm25_downweights_terms_common_to_every_course():
    scores = bm25_scores(["alpha beta"], ["alpha beta", "alpha gamma", "alpha delta"])
    assert scores[0, 0] > scores[0, 1]
    # "alpha" appears in every course so contributes ~nothing; "beta" decides the ranking
    only_common = bm25_scores(["alpha"], ["alpha beta", "alpha gamma", "alpha delta"])
    assert only_common[0, 0] < scores[0, 0] / 3


def test_zrow_standardises_each_row():
    z = zrow(np.array([[1.0, 2.0, 3.0], [10.0, 10.0, 40.0]]))
    assert np.allclose(z.mean(axis=1), 0)
    assert np.allclose(z[0].std(), 1, atol=1e-6)


def test_prefix_evidence_is_mean_of_top_values_within_prefix():
    sim = np.array([[0.1, 0.9, 0.5, 0.3, 0.0]])
    out = prefix_evidence(sim, ["A", "A", "B", "B", "B"], top=2)
    assert np.allclose(out, [[0.5, 0.5, 0.4, 0.4, 0.4]])


def test_title_fuzzy_exclude_and_best_score_per_code():
    m = TitleMatcher([("Software Developer", "15-1252.00", "title"),
                      ("Programmer", "15-1252.00", "alt"),
                      ("Welder", "51-4121.00", "title")])
    hits = m.fuzzy("software developer")
    assert max(hits, key=hits.get) == "15-1252.00"
    excluded = m.fuzzy("software developer", exclude="Software Developer")
    assert excluded["15-1252.00"] < hits["15-1252.00"]


def test_title_dense_exclude_and_hybrid_blend():
    vecs = np.array([[1.0, 0.0], [0.0, 1.0]])
    m = TitleMatcher([("a", "X", "title"), ("b", "Y", "title")], vecs)
    assert m.dense(np.array([1.0, 0.0]))["X"] == 1.0
    assert m.dense(np.array([1.0, 0.0]), exclude="a")["X"] == -1.0
    assert TitleMatcher.hybrid({"X": 1.0}, {"X": 0.5, "Y": -0.4}) == {"X": 0.75, "Y": 0.0}


def test_rank_sorts_descending_and_truncates():
    assert rank({"a": 0.1, "b": 0.9, "c": 0.5}, k=2) == [("b", 0.9), ("c", 0.5)]

"""Pairwise (occupation, course) feature stack and the learned blend."""
import numpy as np
from sklearn.linear_model import LogisticRegression

from .data import level
from .features import zrow

FEATURES = ["tfidf", "bm25", "minilm", "bge", "level"]
PREFIX_EVIDENCE = "prefix_evidence"  # unsupervised: mean top-5 minilm similarity within the course's own prefix


def prefix_evidence(sim: np.ndarray, prefixes: list[str], top: int = 5) -> np.ndarray:
    out = np.zeros_like(sim)
    arr = np.array(prefixes)
    for p in set(prefixes):
        cols = np.where(arr == p)[0]
        top_vals = np.sort(sim[:, cols], axis=1)[:, -top:]
        out[:, cols] = top_vals.mean(axis=1, keepdims=True)
    return out


def build_features(scores: dict[str, np.ndarray], courses: list[dict], with_prefix: bool) -> np.ndarray:
    lv = np.array([level(c["code"]) // 1000 for c in courses], dtype=float) / 4
    feats = [zrow(scores[k]) for k in ("tfidf", "bm25", "minilm", "bge")]
    feats.append(np.broadcast_to(lv, scores["minilm"].shape).copy())
    if with_prefix:
        feats.append(zrow(prefix_evidence(scores["minilm"], [c["prefix"] for c in courses])))
    return np.stack(feats, axis=-1)


def fit_blend(feats: np.ndarray, rel: np.ndarray, train: np.ndarray) -> LogisticRegression:
    x = feats[train].reshape(-1, feats.shape[-1])
    y = rel[train].reshape(-1)
    return LogisticRegression(C=1.0, max_iter=300).fit(x, y)


def blend_scores(model: LogisticRegression, feats: np.ndarray) -> np.ndarray:
    return model.decision_function(feats.reshape(-1, feats.shape[-1])).reshape(feats.shape[:-1])

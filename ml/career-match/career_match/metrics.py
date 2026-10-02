import numpy as np


def precision_at_k(scores: np.ndarray, rel: np.ndarray, k: int = 10) -> float:
    top = np.argsort(-scores, kind="stable")[:k]
    return float(rel[top].mean())


def ndcg_at_k(scores: np.ndarray, rel: np.ndarray, k: int = 10) -> float:
    top = np.argsort(-scores, kind="stable")[:k]
    disc = 1.0 / np.log2(np.arange(2, len(top) + 2))
    ideal = np.sort(rel)[::-1][:k]
    denom = float((ideal * disc[: len(ideal)]).sum())
    return float((rel[top] * disc).sum() / denom) if denom else 0.0

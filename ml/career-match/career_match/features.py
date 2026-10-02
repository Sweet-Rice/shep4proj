"""Occupation x course score matrices: TF-IDF, BM25 and sentence-embedding similarity."""
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer

from .data import DATA

CACHE = DATA.parent / "cache"
MODELS = {"minilm": "sentence-transformers/all-MiniLM-L6-v2", "bge": "BAAI/bge-small-en-v1.5"}
BGE_QUERY = "Represent this sentence for searching relevant passages: "


def tfidf_scores(occ_texts: list[str], course_texts: list[str]) -> np.ndarray:
    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True, min_df=2)
    vec.fit(course_texts + occ_texts)
    return (vec.transform(occ_texts) @ vec.transform(course_texts).T).toarray()


def bm25_scores(occ_texts: list[str], course_texts: list[str], k1: float = 1.5, b: float = 0.75) -> np.ndarray:
    cv = CountVectorizer(stop_words="english")
    tf = cv.fit_transform(course_texts).tocsr().astype(float)
    n = tf.shape[0]
    df = np.asarray((tf > 0).sum(axis=0)).ravel()
    idf = np.log(1 + (n - df + 0.5) / (df + 0.5))
    dl = np.asarray(tf.sum(axis=1)).ravel()
    rows = tf.tocoo()
    denom = rows.data + k1 * (1 - b + b * dl[rows.row] / dl.mean())
    w = tf.copy()
    w.data = idf[rows.col] * rows.data * (k1 + 1) / denom
    return (cv.transform(occ_texts).astype(float) @ w.T).toarray()


def embed(model_key: str, texts: list[str], tag: str, query: bool = False) -> np.ndarray:
    """Normalised embeddings, cached under cache/. `query` adds bge's retrieval instruction (query side only)."""
    path = CACHE / f"{model_key}_{tag}.npy"
    if path.exists():
        return np.load(path)
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODELS[model_key])
    if query and model_key == "bge":
        texts = [BGE_QUERY + t for t in texts]
    vecs = model.encode(texts, batch_size=128, normalize_embeddings=True, show_progress_bar=False)
    CACHE.mkdir(exist_ok=True)
    np.save(path, vecs)
    return vecs


def occupation_embeddings(model_key: str, occs: list[dict]) -> np.ndarray:
    """Mean of segment embeddings (title+description, core tasks, knowledge/tools): one vector per occupation."""
    segs, owner = [], []
    for i, o in enumerate(occs):
        parts = [f'{o["title"]}. {o["description"]}', *o["tasks"][:10],
                 "Knowledge: " + ", ".join(o["knowledge"]) + ". Tools: " + ", ".join(o["software"])]
        segs += parts
        owner += [i] * len(parts)
    vecs = embed(model_key, segs, "occ_segments", query=True)
    out = np.zeros((len(occs), vecs.shape[1]))
    np.add.at(out, np.array(owner), vecs)
    return out / np.linalg.norm(out, axis=1, keepdims=True)


def zrow(m: np.ndarray) -> np.ndarray:
    return (m - m.mean(axis=1, keepdims=True)) / (m.std(axis=1, keepdims=True) + 1e-9)

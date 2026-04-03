from datetime import timedelta

from services.signal_algorithms import (
    create_interest_vector,
    decay_interest_vector,
    update_interest_vector,
    utcnow,
)


def test_interest_vector_positive_and_negative_feedback():
    vector = create_interest_vector()
    vector = update_interest_vector(
        vector,
        "story_liked",
        topics=["geopolitics"],
        sources=["reuters.com"],
        keywords=["defense", "policy"],
    )
    liked_score = vector["topics"]["geopolitics"]
    assert liked_score > 0

    vector = update_interest_vector(
        vector,
        "topic_muted",
        topics=["geopolitics"],
        keywords=["defense"],
    )
    muted_score = vector["topics"]["geopolitics"]
    assert muted_score < liked_score


def test_interest_vector_decay_reduces_scores_over_time():
    vector = create_interest_vector()
    vector = update_interest_vector(vector, "story_liked", topics=["ai"])
    before = float(vector["topics"]["ai"])

    now = utcnow() + timedelta(days=14)
    decayed = decay_interest_vector(vector, now=now, half_life_days=14.0)
    after = float(decayed["topics"]["ai"])

    assert after < before
    assert after > 0


def test_interest_vector_weight_scale_amplifies_engagement():
    vector = create_interest_vector()
    baseline = update_interest_vector(vector, "story_dwell", topics=["macro"], weight_scale=0.5)
    boosted = update_interest_vector(vector, "story_dwell", topics=["macro"], weight_scale=2.0)

    assert float(boosted["topics"]["macro"]) > float(baseline["topics"]["macro"])

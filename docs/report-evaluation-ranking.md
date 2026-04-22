# Report Evaluation And Student Ranking

## Scope

This document defines the backend ranking and evaluation rules used by the student reports experience.

## Evaluation Types

- `praise`: 点赞/红花，可不填写文字
- `improve`: 待改进，必须填写文字
- `comment`: 普通批注，必须填写文字

## Evaluation Permissions

- Only the bound teacher of the same project group can create a report evaluation.
- Only the original evaluator can revoke an evaluation.
- Revoke is allowed only within 10 minutes after creation.
- Revoked evaluations are excluded from unread counts, student timelines, and ranking statistics.

## Ranking Formula

Student ranking is computed inside the same project group and uses these weighted factors:

- Monthly submit rate × 40%
- Monthly praise count × 40%
- Current continuous submit days × 20%

Tie-breaker:

- Earlier last submit time ranks higher when weighted scores are equal.

## Stats Returned By `/api/students/:user_id/stats`

- `continuous_submit_days`
- `monthly_submit_rate`
- `total_praise_count`
- `total_improve_count`
- `group_rank`
- `group_total`
- `rank_change`

## Consistency Strategy

- `Report` stores `praiseCount`, `improveCount`, and `commentCount` as current-state counters.
- `ReportEvaluation` is the source of truth for timeline queries, unread state, revoke checks, and monthly praise statistics.
- Counter fields on `Report` are incremented/decremented inside the same transaction as evaluation create/revoke.

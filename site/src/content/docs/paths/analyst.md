---
title: The analyst path
description: For analysts new to Pulse who know their statistics. Concepts first, then real analyses.
sidebar:
  order: 1
---

You know your statistics; you want to know how Pulse expresses them and what it returns. This path goes from the shape of a request to complete analyses.

## 1. Learn the vocabulary

Watch [Film 2: Concepts](/films/concepts/). It runs every Pulse concept on one cohort of twelve members: features add columns, filters drop rows, attributes derive values, groupers make buckets, aggregators reduce them, and windows look across rows.

## 2. Go deep on the stages you need

Each stage of a request has its own film:

| Stage | Film | What you will use it for |
|---|---|---|
| Features | [3. Features](/films/features/) | taming skew, binning, encoding categories |
| Filters | [4. Filters](/films/filters/) | choosing the records, and how nulls behave |
| Attributes | [5. Attributes](/films/attributes/) | derived scores, recodes, diagnostics |
| Aggregators | [6. Aggregators](/films/aggregators/) | counts, centre, spread, confidence intervals |
| Windows | [7. Windows](/films/windows/) | lags, changes, moving averages, ranks |
| Tests and regression | [8. Tests and regressions](/films/tests/) | is a difference real, what drives an outcome |
| Matrices | [9. Matrices](/films/matrices/) | correlation, reliability, principal components |
| Overlays | [10. Overlays](/films/overlays/) | reading a result against a margin, a baseline or a population |

## 3. Follow a complete analysis

Start with the case study closest to your work:

- [Pricing-page A/B test](/case-studies/ab-test-readout/): trust checks, a corrected scorecard, a skewed revenue metric, regression adjustment, segments.
- [Brand tracker](/case-studies/brand-tracker/): survey weighting, banner tables with significance letters, what changes when you weight and correct.
- [Credit risk model](/case-studies/credit-risk-model/): a probability-of-default scorecard, holdout validation, calibration, and the cost of leaky fields.
- [Multi-time-zone operations](/case-studies/multi-timezone-ops/): reading UTC data by each site's own business day, anomalies and daylight saving.

Each case study links the [topics](/topics/filters/) it uses, so you can jump back to the film for any operator you meet.

# Vision model training record

No new video/image model was trained or fine-tuned. `eval/clips/labels/vision-eval.csv` is header-only and the workspace contains no labeled person/video-disjoint frame scores. The synthetic smoke-test portrait is not training or accuracy data.

The unchanged bundled classifier is a frame-level CommunityForensics ViT image detector. Its source, license statement, artifact hash, crop, 440-to-384 center crop, RGB normalization, float32 NCHW input, single-logit sigmoid mapping, and limitations are documented in `docs/vision-module/MODEL_CARD.md`. Its source model card reports training on 2.7 million generated-image samples across 4,803 generators; this project has not audited the underlying image-by-image licenses or tested that claim.

## Evaluation protocol for future exports

`eval/vision/evaluate_frame_scores.py` expects one row per sampled frame, with blank `score_fake` for a no-face or abstained frame and columns `split,video_id,person_id,source_id,frame_id,label,score_fake`. Optional `compression`, `resolution`, and `quality` columns are summarized for the test split. Use a dataset whose research and model-use terms are documented, and keep its raw media and labels outside Git when appropriate.

The CLI rejects train/validation/test overlap by video, person, or source. It selects the operating threshold by maximum balanced accuracy on validation video-level maximum scores, resolving ties toward 0.5. It freezes maximum non-abstaining frame score as the video aggregation rule, then reports both frame- and video-level metrics at that validation-selected threshold on test. Example once an authorized score export exists:

```sh
python eval/vision/evaluate_frame_scores.py /path/to/frame-scores.csv \
  --dataset DATASET_NAME --revision DATASET_REVISION --license LICENSE \
  --output eval/vision/frame-classifier-report.json
```

No test split, threshold, metric, or training result is available in the current checkout. The score-reporting script does not execute ONNX inference; browser smoke tests remain a separate integration check.

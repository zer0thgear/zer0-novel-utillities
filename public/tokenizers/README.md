# Tokenizer data

Used by the prompt token counter (`lib/tokenCount.ts`). Loaded only when a
counter is shown, and only the file for the selected model.

| File | Used for | Source | License |
| --- | --- | --- | --- |
| `t5-unigram.json` | V4 / V4.5 | Pieces and scores from [`google-t5/t5-base`](https://huggingface.co/google-t5/t5-base) `tokenizer.json`. This is the same SentencePiece vocabulary every T5 v1.1 model uses. | Apache-2.0 |
| `qwen3.5-merges.txt` | V5 | [`Qwen/Qwen3.5-0.8B`](https://huggingface.co/Qwen/Qwen3.5-0.8B) `merges.txt`, unmodified. | Apache-2.0 |

Both are redistributed under the Apache License 2.0; see
`LICENSE-Apache-2.0.txt`. Regenerate them with `scripts/build-tokenizers.mjs`.

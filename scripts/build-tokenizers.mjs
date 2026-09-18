// Regenerates public/tokenizers/ from the upstream Hugging Face files.
//
//   1. Download into one folder:
//        https://huggingface.co/google-t5/t5-base/resolve/main/tokenizer.json  → t5_tokenizer.json
//        https://huggingface.co/Qwen/Qwen3.5-0.8B/resolve/main/merges.txt     → qwen_merges.txt
//        https://huggingface.co/openai/clip-vit-large-patch14/resolve/main/merges.txt → clip_merges.txt
//   2. node scripts/build-tokenizers.mjs <that folder>
//
// T5 and Qwen are Apache-2.0, CLIP is MIT (see public/tokenizers/README.md).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-tokenizers.mjs <folder with t5_tokenizer.json and qwen_merges.txt>');
  process.exit(1);
}
const out = join(import.meta.dirname, '..', 'public', 'tokenizers');
mkdirSync(out, { recursive: true });

// T5: just the Unigram pieces and scores; NovelAI's counter uses no normalizer.
const t5 = JSON.parse(readFileSync(join(src, 't5_tokenizer.json'), 'utf8'));
if (!Array.isArray(t5.model.vocab?.[0])) throw new Error('expected a Unigram (piece, score) vocab');
writeFileSync(
  join(out, 't5-unigram.json'),
  JSON.stringify({
    unkId: t5.model.unk_id,
    pieces: t5.model.vocab.map(([piece]) => piece),
    scores: t5.model.vocab.map(([, score]) => score),
  }),
);

// Qwen: merges.txt as is (a count needs only the merge ranks, not token ids).
const merges = readFileSync(join(src, 'qwen_merges.txt'), 'utf8').replace(/\r\n/g, '\n');
if (merges.startsWith('#')) throw new Error('unexpected header line in merges.txt');
writeFileSync(join(out, 'qwen3.5-merges.txt'), merges);

// CLIP: the "#version" header plus the 48,894 merges CLIP (and NovelAI) use.
const clip = readFileSync(join(src, 'clip_merges.txt'), 'utf8').replace(/\r\n/g, '\n').split('\n');
if (!clip[0].startsWith('#version')) throw new Error('expected a "#version" header in the CLIP merges');
writeFileSync(join(out, 'clip-merges.txt'), clip.slice(0, 1 + 48894).join('\n') + '\n');

console.log('wrote', out);

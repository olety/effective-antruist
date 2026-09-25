# Effective Antruist

**ARE YOU AN EFFECTIVE ANTRUIST?** Check your worth in Rat World.

Live at **[effectiveantruist.com](https://effectiveantruist.com)**.

Bentham's Bulldog wrote ["Insects Matter More Than People in the Aggregate"](https://benthams.substack.com/p/insects-matter-more-than-people). We did the maths on you. Paste a bio or what you did today. The page prices you in insects, with cited welfare ranges, and the soldiers at the door tell you what they think.

It is a parody. It began as a meme reply by [@therotobo](https://x.com/therotobo): soldiers at a door shout "BUG LIVES MATTER!" and "SAVE THE SHRIMPS!", and behind the door a trollface sits in a purple room with a rifle.

Built for Hackyard Yard #3, "One Screen": one view, no routes, solo, open source.

## How it works

```
 your bio ──► GLiNER2.5-small ──► spans ──► rules + lexicon ──┐
             (in your browser,   food, pets, donations,       │
              int8/4-bit ONNX)   employers, AI labs, ...      ▼
                                                      Worker /api/judge
                                   Jev (typed questions) ◄────┤
                                   caste · moral circle ·     │
                                   Skittles-for-shrimp ·      ▼
                                   doomer · eats meat   deterministic engine
                                                        insects per line, cited
                                                              │
                                                              ▼
                                       "HELLO my worth is 17,885,774 INSECTS"
```

1. **Spans.** GLiNER2.5-small runs in your browser on onnxruntime-web (WASM, 4 threads when the page is cross-origin isolated). The ONNX model has int8 matrices with a 4-bit embedding table: about 52 MB, and about 40 MB over the wire as gzip. It downloads once and stays in Cache Storage. Engine rules and a lexicon clean its spans: AI labs come from a closed list, merged charities are split, a pet must contain an animal. Phones and data-saver connections skip the model and use the lexicon.
2. **Verdicts.** The Worker asks Jev, TypeSafe's typed decision model, five questions about the text. Answers are cached per text, so the same bio always gets the same verdict. When Jev is unsure (0.2 to 0.8), the soldiers argue.
3. **Price.** A deterministic engine turns each span into a ledger line priced in insects. The default weights are Rethink Priorities' 2023 welfare-range medians (1 human = 76.92 insects). You can switch to the 2025 moral-parliament means or to neuron counts. The Skittles line is hypothetical and stays out of the total.

Every number has its source in [SOURCES.md](SOURCES.md). Items we could not verify are marked UNVERIFIED there and in the ledger.

## Run locally

Requires Bun. Python 3 is needed only for the optional base-model service.

```sh
bun install
bun run model        # download + quantise GLiNER2.5-small into public/model (pinned sha256)
bun test
bun run build
```

Put `JEV_KEY=...` in `.dev.vars` (gitignored). Then:

```sh
bun run worker       # builds and serves dist + the Worker on :8787
bun run dev          # Vite on :5173, proxies /api to :8787
```

Optional: `bun run gliner` starts GLiNER2.5-base as a local FastAPI service on :8765 (see `service/`). Set `GLINER_URL=http://127.0.0.1:8765` in `.dev.vars` to use it when the browser sends no spans.

Deploy: `bunx wrangler secret put JEV_KEY`, then `bun run model && bun run build && bunx wrangler deploy`.

## Credits

- **GLiNER2.5** by [Fastino](https://github.com/fastino-ai). Browser ONNX export: [nicolasembleton/gliner2.5-small-v1-onnx](https://huggingface.co/nicolasembleton/gliner2.5-small-v1-onnx). Browser host code: [Pastel-Org/gliner2.5-onnx-webgpu](https://github.com/Pastel-Org/gliner2.5-onnx-webgpu) (MIT, copied into `src/gliner/vendor/` with its notice).
- **onnxruntime-web** (Microsoft) and **@huggingface/tokenizers**.
- **Jev** by [TypeSafe](https://typesafe.ai): the verdicts.
- **Welfare ranges:** Rethink Priorities' Moral Weight Project. See SOURCES.md for every figure.
- **Art:** sticker cast generated with OpenAI gpt-image, cut out and baked to WebP by `scripts/bake_stickers.py`.
- **Sound:** effects and voice lines generated with ElevenLabs.
- **Music:** "Save The Shrimps" by [@therotobo](https://x.com/therotobo), made with Suno.
- Fonts: Anton (SIL OFL 1.1) and Permanent Marker (Apache 2.0), from Google Fonts, self-hosted.

## License

Code: [MIT](LICENSE).

This is satire. The characters are generic meme archetypes, not real people. The only real person named is Bentham's Bulldog, through the title of his own article.

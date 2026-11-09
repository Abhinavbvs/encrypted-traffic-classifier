# MetaFlow web UI

The landing site and live analyzer for this project. It runs on the repository's own model, sample captures and reports.

## Run it

From the repository root, with the project's environment active:

```bash
python web/server.py          # http://127.0.0.1:8600
```

The server loads `models/best_model.pkl` once and serves both the site and a small API:

| Route | What it does |
|---|---|
| `GET /api/health` | Model status, the 23 features, the 7 classes and the bundled captures |
| `GET /api/metrics` | `reports/metrics.json` plus `reports/cv_results.csv` |
| `GET /api/classify?sample=voip_call.pcap&threshold=0.5` | Classifies a capture from `data/sample_pcaps` |
| `POST /api/classify?threshold=0.5` | Classifies an uploaded capture (raw body, `X-Filename` header, 50 MB max) |
| `GET /api/batch?threshold=0.5` | Scores `data/processed/sample_raw_flows.csv` |

Inference goes through `src.predict.predict_pcap`, `predict_flows` and `src.llm_explainer.explain_flow`, which are the same functions the CLI and the Streamlit app use. Set `METAFLOW_EXPLAINER` to `rule_fallback`, `ollama` or `cloud` to force one explanation tier. The default, `auto`, uses the first tier that's available.

If you open the HTML files directly without the server, the pages replay `web/data/snapshot.json`. That's the same model's output, captured when the site was built.

## Rebuild after changing copy or the model

```bash
python web/build.py
```

`build.py` runs the model on every sample capture and the flow CSV, then writes all pages plus `data/snapshot.json`. Benchmark tables, demo verdicts and explanation examples always reflect the committed model.

## Re-record the walkthrough video

Start `python web/server.py` and the Streamlit app (`streamlit run app.py --server.port 8502`), then run:

```bash
pip install playwright imageio-ffmpeg && python -m playwright install chromium
python web/record_walkthrough.py
```

The video is saved to `web/media/metaflow_walkthrough.mp4`. It scrolls slowly through every page, runs the live analyzer, uploads a capture, scores the CSV, and then visits each page of the Streamlit app.

## Layout

```
web/
├── server.py               live API + static server (standard library only)
├── build.py                page generator, bakes in model output
├── record_walkthrough.py   Playwright walkthrough recorder
├── css/ js/ favicon.svg    styles, behaviour, logo
├── data/snapshot.json      offline copy of the model's output
├── media/                  walkthrough video
└── *.html                  generated pages
```

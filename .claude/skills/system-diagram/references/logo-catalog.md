# Logo catalog

Canon: `de_pjt/docs/superpowers/specs/2026-07-16-diagram-skill-design.md` §7

The vendor logo bundle already fetched into `assets/logos/*.svg` (the DE + web stack).
`logos.py` inlines each file as a base64 `data:image/svg+xml;base64,...` URI and places it
with `<image href>` (prevents `id` collisions between logos, and is safe offline and under
Artifact CSP). If a logo is missing, it falls back to a text chip (square rect + the key as
text, keeping R1).

## Current mapping (`key` → iconify path in `assets/fetch_logos.sh`)

| key | iconify path |
|---|---|
| airflow | `logos/airflow-icon` |
| crawler | `mingcute/rss-2-fill` |
| kafka | `devicon/apachekafka` |
| flink | `simple-icons/apacheflink` |
| postgres | `logos/postgresql` |
| qdrant | `logos/qdrant` |
| es | `logos/elasticsearch` |
| django | `logos/django-icon` |
| user | `mingcute/user-4-fill` |
| prometheus | `logos/prometheus` |
| grafana | `logos/grafana` |
| spark | `logos/apache-spark` |
| hadoop | `logos/hadoop` |
| redis | `logos/redis` |
| nginx | `logos/nginx` |
| docker | `logos/docker-icon` |
| kubernetes | `logos/kubernetes` |
| vue | `logos/vue` |
| kibana | `logos/kibana` |
| logstash | `logos/logstash` |

When the full-color original is oversized (file far too large), a monochrome substitute is
allowed (e.g. the `simple-icons` monochrome version for Flink).

## Adding a logo

1. Iconify priority: `https://api.iconify.design/logos/<name>.svg` (full color) →
   otherwise `simple-icons/<name>` → otherwise `devicon/<name>`.
2. Add one line to `assets/fetch_logos.sh`:
   ```bash
   get <key> <iconify-path>
   ```
3. Re-run the script: `bash assets/fetch_logos.sh` — it fetches `assets/logos/<key>.svg`.
4. If it still cannot be found, skip it. `logos.logo_svg(key, ...)` detects the missing file
   and renders the text-chip fallback automatically (R1 square corners preserved, no crash) —
   so a key absent from the catalog is safe to use in a spec.

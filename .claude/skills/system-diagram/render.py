"""오케스트레이터 + CLI. 스펙 → SVG → self-contained HTML. 기록 전 R1–R8 자기검사."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import palette  # noqa: E402
import checks  # noqa: E402
from scene import render_architecture  # noqa: E402
from sequence import render_sequence  # noqa: E402
from flow import render_flow  # noqa: E402

_CSS = f"""<style>
*{{box-sizing:border-box;}}
body{{margin:0;background:{palette.PAGE_BG};color:{palette.INK};
 font:400 16px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;}}
.wrap{{max-width:1160px;margin:0 auto;padding:48px 24px;}}
h1{{font-size:28px;font-weight:800;letter-spacing:-.02em;margin:0 0 20px;}}
.canvas{{overflow-x:auto;background:{palette.PAGE_CARD};border:1px solid {palette.PAGE_BORDER};}}
.canvas svg{{display:block;min-width:940px;}}
</style>"""


def page(title, svg):
    return f'{_CSS}\n<div class="wrap"><h1>{title}</h1><div class="canvas">{svg}</div></div>'


def render(spec):
    if spec["kind"] == "architecture":
        return render_architecture(spec)
    if spec["kind"] == "sequence":
        return render_sequence(spec)
    if spec["kind"] == "flow":
        return render_flow(spec)
    raise ValueError(f'unknown kind: {spec["kind"]}')


def write(spec, out_stem):
    svg = render(spec)
    html = page(spec.get("title", "diagram"), svg)
    violations = checks.scan(html)
    if violations:
        raise ValueError("규칙 위반:\n" + "\n".join(violations))
    html_path, svg_path = out_stem + ".html", out_stem + ".svg"
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg)
    return html_path, svg_path


def _load_spec(path):
    ns = {}
    with open(path, encoding="utf-8") as f:
        exec(compile(f.read(), path, "exec"), ns)
    return ns["SPEC"]


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python3 render.py <spec.py> <out_stem>")
        sys.exit(1)
    hp, sp = write(_load_spec(sys.argv[1]), sys.argv[2])
    print("wrote", hp, sp)

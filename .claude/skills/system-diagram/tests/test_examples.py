import os
import sys

import render

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "examples"))


def test_arch_example_renders_and_passes(tmp_path):
    import depjt_architecture as m
    hp, sp = render.write(m.SPEC, str(tmp_path / "arch"))
    import checks
    assert checks.scan(open(hp, encoding="utf-8").read()) == []
    assert open(sp, encoding="utf-8").read().count("<image") == len(m.SPEC["nodes"])


def test_seq_example_renders_and_passes(tmp_path):
    import depjt_sequence as m
    hp, sp = render.write(m.SPEC, str(tmp_path / "seq"))
    import checks
    assert checks.scan(open(hp, encoding="utf-8").read()) == []


def test_flow_example_renders_and_passes(tmp_path):
    import depjt_flow as m
    hp, sp = render.write(m.SPEC, str(tmp_path / "flow"))
    import checks
    assert checks.scan(open(hp, encoding="utf-8").read()) == []
    import xml.dom.minidom
    xml.dom.minidom.parse(sp)  # 유효 XML

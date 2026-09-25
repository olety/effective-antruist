"""Quantise the GLiNER2.5-small fp32 ONNX graph for the browser (run by scripts/build-model.ts in a uv venv).

Recipe "e4": int8 matrices plus a 4-bit embedding table. 88.6 MB (int8) -> 51.6 MB, ~40 MB gzipped.
Bench on onnxruntime-web 1.30 WASM: F1 0.767 vs 0.770 for the plain int8 build, extract speed within 6%.

  1. bypass Identity(initializer) nodes, so the tied DeBERTa pos-proj weights (24 x 384x384, ~14 MB
     fp32 that quantize_dynamic otherwise leaves in fp32) are quantised too
  2. convert the graph to opset 21 FIRST. The uint4 Gather needs opset 21, and when the quantiser
     bumps the opset itself it leaves ReduceMax with an `axes` attribute, which onnxruntime-web rejects.
     The version converter rewrites those nodes properly.
  3. quantize_dynamic QInt8 on MatMul only (MatMulInteger, the same recipe as the old int8 build)
  4. word-embedding Gather -> com.microsoft GatherBlockQuantized, uint4, block 128 along hidden, asymmetric

The output is deterministic: build-model.ts pins its sha256 and fails the build if it drifts.
Usage: python quantize-e4.py <fp32.onnx> <out.onnx>
Deps (pinned in build-model.ts): onnxruntime==1.30.0 onnx==1.23.0 onnx-ir==1.0.0
"""
import logging, os, sys, tempfile, time
import onnx
from onnx import version_converter
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

# The quantisers log every node at INFO (about 1 MB); keep warnings only.
for name in ("", "onnxruntime.quantization.matmul_nbits_quantizer"):
    logging.getLogger(name).setLevel(logging.WARNING)

src, dst = sys.argv[1], sys.argv[2]
t = time.perf_counter()
m = onnx.load(src)
g = m.graph
inits = {x.name for x in g.initializer}
outs = {o.name for o in g.output}
alias = {n.output[0]: n.input[0] for n in g.node if n.op_type == "Identity" and n.input[0] in inits and n.output[0] not in outs}
keep = [n for n in g.node if n.output[0] not in alias or n.op_type != "Identity"]
def rewire(graph):
    for n in graph.node:
        for i, x in enumerate(n.input):
            if x in alias: n.input[i] = alias[x]
        for a in n.attribute:
            if a.g: rewire(a.g)
            for sg in a.graphs: rewire(sg)
g.ClearField("node"); g.node.extend(keep); rewire(g)
m = version_converter.convert_version(m, 21)
with tempfile.TemporaryDirectory() as d:
    a, b = os.path.join(d, "prep.onnx"), os.path.join(d, "int8mm.onnx")
    onnx.save(m, a)
    quantize_dynamic(a, b, weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul"])
    q = MatMulNBitsQuantizer(onnx.load(b), bits=4, block_size=128, is_symmetric=False,
                             op_types_to_quantize=("Gather",), quant_axes=(("MatMul", 0), ("Gather", 1)))
    q.process()
    q.model.save_model_to_file(dst, use_external_data_format=False)
print(f"bypassed {len(alias)} Identity weights; quantised in {time.perf_counter() - t:.1f}s -> {dst} ({os.path.getsize(dst)/1e6:.1f} MB)", flush=True)

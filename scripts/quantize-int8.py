"""Dynamic int8 quantisation of the GLiNER2.5 ONNX graph (run by scripts/build-model.ts in a uv venv).

Usage: python quantize-int8.py <fp32.onnx> <out_int8.onnx>
"""
import sys
import time

from onnxruntime.quantization import QuantType, quantize_dynamic

src, dst = sys.argv[1], sys.argv[2]
t = time.perf_counter()
quantize_dynamic(src, dst, weight_type=QuantType.QInt8)
print(f"quantised in {time.perf_counter() - t:.1f}s -> {dst}", flush=True)

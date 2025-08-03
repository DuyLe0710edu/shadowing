import os
import sys
from typing import List, Tuple, Dict

import easyocr
import torch  # easyocr already depends on torch, safe to import
from flask import Flask, request, jsonify


# --------------------------------------------------
# Helper utilities
# --------------------------------------------------


# Detect whether a hardware-accelerated backend is available.
# 1. CUDA on NVIDIA GPUs (torch.cuda)
# 2. Apple Silicon MPS backend (torch.backends.mps) – available on M1/M2/M3 chips with PyTorch ≥ 1.12.
# If neither is present we fall back to CPU.
try:
    GPU_AVAILABLE = torch.cuda.is_available() or torch.backends.mps.is_available()
except AttributeError:
    # Older Torch without MPS backend
    GPU_AVAILABLE = torch.cuda.is_available()

# Print a concise summary so the log clearly shows which path we took
print(f"[OCR] GPU backend detected: {GPU_AVAILABLE} (CUDA={torch.cuda.is_available()}, MPS={getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available()})")


def _create_reader(lang_list: Tuple[str, ...]):
    """Create an EasyOCR Reader with robust error handling."""
    for gpu_flag in (GPU_AVAILABLE, False):  # Try GPU first, then CPU
        try:
            return easyocr.Reader(list(lang_list), gpu=gpu_flag)
        except Exception as e:
            print(f'[OCR] Cannot build reader {lang_list} (gpu={gpu_flag}): {e}')
    return None  # Give up - caller should skip this language


# Cache of instantiated readers keyed by their language tuple
_reader_cache: Dict[Tuple[str, ...], easyocr.Reader] = {}


def get_reader(lang_list: List[str]):
    """Return (and cache) a reader for the provided language list."""
    key = tuple(sorted(lang_list))
    if key not in _reader_cache:
        _reader_cache[key] = _create_reader(key)
    return _reader_cache[key]


# --------------------------------------------------
# Flask app
# --------------------------------------------------

app = Flask(__name__)


@app.route('/health', methods=['GET'])
def health_check():
    """Simple liveness endpoint."""
    return jsonify(
        {
            'status': 'ready',
            'gpu_enabled': GPU_AVAILABLE,
            'cached_readers': len(_reader_cache),
        }
    )


@app.route('/ocr', methods=['POST'])
def extract_text():
    data = request.get_json(force=True)

    image_path: str = data.get('image_path')
    if not image_path or not os.path.exists(image_path):
        return jsonify({'error': 'Image not found'}), 404

    # Languages requested by the client (optional)
    requested_langs: List[str] = data.get('languages', [])

    # Default language coverage if none specified (common CJK + English)
    if not requested_langs:
        requested_langs = ['ch_sim', 'ch_tra', 'ja', 'ko']

    # English must always be present for compatibility
    if 'en' not in requested_langs:
        requested_langs.append('en')

    # Run OCR separately per non-English language (with English) to avoid
    # EasyOCR compatibility errors, then merge the results.
    results = []
    for lang in requested_langs:
        if lang == 'en':
            continue
        reader = get_reader([lang, 'en'])
        if reader is None:
            print(f'[OCR] Warning: no reader available for language "{lang}"')
            continue
        try:
            results.extend(reader.readtext(image_path, detail=1))
        except Exception as e:
            # Skip language if processing fails; continue with others
            print(f'[OCR] Warning: failed reading with lang "{lang}": {e}')

    # Fallback: at least run pure English if nothing else produced output
    if not results:
        reader_en = get_reader(['en'])
        if reader_en is not None:
            results = reader_en.readtext(image_path, detail=1)

    # Post-process results: keep high-confidence text and aggregate
    high_conf_text = []
    max_confidence = 0.0
    for (_, text, conf) in results:
        if conf > 0.5:
            high_conf_text.append(text)
            max_confidence = max(max_confidence, conf)

    final_text = ' '.join(high_conf_text).strip()

    return jsonify(
        {
            'text': final_text,
            'confidence': int(max_confidence * 100),
            'word_count': len(high_conf_text),
        }
    )


if __name__ == '__main__':
    print('[OCR] Service booting… GPU available:', GPU_AVAILABLE)
    # We start the Flask server without pre-initialising any reader;
    # they will be created on demand and cached.
    app.run(port=8765, host='127.0.0.1', debug=False)
#!/usr/bin/env python3
"""Insert the iStoreOS LAN bridge into the authenticated frontend entry only."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def patch(payload):
    index = payload / 'app/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html'
    text = index.read_text()
    marker = '<script id="istoreos-lan-bridge">'
    if marker in text:
        assert text.count(marker) == 1
        return
    assert text.count('<head>') == 1, 'Expected exactly one HTML head'
    bridge = (ROOT / 'lan-bridge.js').read_text()
    assert '</script>' not in bridge
    index.write_text(text.replace('<head>', '<head>\n' + marker + '\n' + bridge + '\n</script>', 1))
    print('PASS authenticated frontend LAN bridge injected')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('payload', type=Path)
    patch(parser.parse_args().payload)

#!/usr/bin/env python3
"""Target build orchestration; never installs packages on a router."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent


def main():
    config = json.loads((ROOT / 'config.json').read_text())
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arch', choices=list(config['architectures']), default='x86_64')
    parser.add_argument('--reuse-app', action='store_true', help='Reuse matching lockfile/npm tree in the work directory')
    args = parser.parse_args()
    platform = config['architectures'][args.arch]['platform']
    base = ROOT.parent / 'master-build' / ('ipk-' + args.arch)
    work, payload = base / 'app', base / 'payload'
    work.mkdir(parents=True, exist_ok=True)
    if payload.exists() and any(payload.iterdir()):
        parser.error(f'Payload already exists: {payload}; archive it or choose a clean checkout before rebuilding')
    payload.mkdir(exist_ok=True)
    image = 'dsh-ipk-builder:' + args.arch
    subprocess.run(['docker', 'build', '--platform', platform, '--build-arg', 'BASE_IMAGE=' + config['image'],
                    '-t', image, str(ROOT)], check=True)
    subprocess.run(['docker', 'run', '--rm', '--platform', platform,
                    '-v', str(ROOT) + ':/src:ro', '-v', str(work) + ':/work', '-v', str(payload) + ':/out',
                    '-e', 'DSH_REUSE_APP=' + ('1' if args.reuse_app else '0'),
                    image, 'bash', '/src/build-payload.sh'], check=True)
    subprocess.run(['python3', str(ROOT / 'pack-ipk.py'), '--payload', str(payload), '--arch', args.arch], check=True)


if __name__ == '__main__':
    main()

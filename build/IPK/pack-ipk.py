#!/usr/bin/env python3
"""Build OpenWrt/opkg tar-based IPKs from a verified target payload."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent
PREFIX = Path('usr/lib/deepseek-harness')


def archive(root):
    data = io.BytesIO()
    with gzip.GzipFile(fileobj=data, mode='wb', mtime=0) as zipped:
        with tarfile.open(fileobj=zipped, mode='w', format=tarfile.GNU_FORMAT) as tar:
            for item in sorted(root.rglob('*')):
                info = tar.gettarinfo(str(item), './' + item.relative_to(root).as_posix())
                info.uid = info.gid = info.mtime = 0
                info.uname = info.gname = 'root'
                with item.open('rb') if info.isfile() else io.BytesIO() as content:
                    tar.addfile(info, content if info.isfile() else None)
    return data.getvalue()


def make_ipk(stage, output, name, version, arch, dependencies, description, hooks=False, postinst=None, extra_size=0):
    control = Path(tempfile.mkdtemp(prefix='dsh-ipk-control-'))
    try:
        data = archive(stage)
        text = (f'Package: {name}\nVersion: {version}\nArchitecture: {arch}\n'
                f'Depends: {dependencies}\nSection: utils\nPriority: optional\n'
                f'Maintainer: DeepSeekHarness-iStoreOS\n'
                f'License: MIT\nSource: https://github.com/jmjFortune/dsh-ipk\n'
                f'Installed-Size: {extra_size + sum(p.stat().st_size for p in stage.rglob("*") if p.is_file() and not p.is_symlink())}\nDescription: {description}\n')
        (control / 'control').write_text(text)
        if hooks:
            (control / 'conffiles').write_text('/etc/config/deepseek-harness\n')
            for hook in ['postinst', 'prerm', 'postrm']:
                shutil.copy2(ROOT / 'control' / hook, control / hook)
        if postinst:
            shutil.copy2(postinst, control / 'postinst')
        path = output / f'{name}_{version}_{arch}.ipk'
        with gzip.GzipFile(filename=str(path), mode='wb', mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w', format=tarfile.GNU_FORMAT) as tar:
                for entry, content in [('debian-binary', b'2.0\n'), ('data.tar.gz', data), ('control.tar.gz', archive(control))]:
                    info = tarfile.TarInfo('./' + entry)
                    info.size = len(content)
                    info.mode = 0o644
                    tar.addfile(info, io.BytesIO(content))
        return path
    finally:
        shutil.rmtree(control)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--payload', required=True, type=Path)
    parser.add_argument('--arch', choices=['x86_64', 'aarch64_generic'], default='x86_64')
    parser.add_argument('--output', type=Path, default=ROOT.parent / 'staging' / 'ipk')
    args = parser.parse_args()
    config = json.loads((ROOT / 'config.json').read_text())
    meta = json.loads((args.payload / 'build-info.json').read_text())
    expected = config['architectures'][args.arch]
    if meta['arch'] != expected['node_arch'] or meta['libc'] != 'musl' or meta['dsh'] != config['dsh_version']:
        parser.error('Payload architecture/libc/version does not match the requested package')
    for file in ['runtime/bin/node', 'runtime/lib/' + expected['loader'], 'app/node_modules/@deepseek-ai/dsh/lib/bin.js']:
        if not (args.payload / file).is_file():
            parser.error('Missing payload file: ' + file)
    args.output.mkdir(parents=True, exist_ok=True)
    version = f"{config['dsh_version']}-{config['package_release']}"
    with tempfile.TemporaryDirectory(prefix='dsh-ipk-stage-') as temp:
        stage = Path(temp)
        shutil.copytree(ROOT / 'files', stage, dirs_exist_ok=True, symlinks=True)
        # opkg re-reads the old file list for every transferred file owner.
        # Keeping the verified runtime in one archive avoids quadratic upgrades.
        (stage / PREFIX / 'payload.tar.gz').write_bytes(archive(args.payload))
        unpacked_size = sum(p.stat().st_size for p in args.payload.rglob('*')
                            if p.is_file() and not p.is_symlink())
        for file in stage.rglob('*'):
            if file.is_file() and not file.is_symlink():
                mode = 0o755 if file.stat().st_mode & 0o111 else 0o644
                if file.relative_to(stage).as_posix() == 'etc/config/deepseek-harness':
                    mode = 0o600
                file.chmod(mode)
        core = make_ipk(stage, args.output, 'deepseek-harness', version, args.arch,
                        'libc, bash, ca-bundle, git-http, libubox, procd', 'DeepSeek Harness native musl service', True,
                        extra_size=unpacked_size)
    with tempfile.TemporaryDirectory(prefix='dsh-luci-stage-') as temp:
        stage = Path(temp)
        shutil.copytree(ROOT / 'luci' / 'htdocs', stage / 'www')
        shutil.copytree(ROOT / 'luci' / 'usr', stage / 'usr')
        luci = make_ipk(stage, args.output, 'luci-app-deepseek-harness', version, 'all',
                        f'deepseek-harness (= {version}), luci-base, rpcd', 'LuCI configuration for DeepSeek Harness',
                        postinst=ROOT / 'control' / 'luci-postinst')
    paths = [core, luci]
    (args.output / 'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in paths))
    for p in paths:
        print(f'{p} ({p.stat().st_size / 1024 / 1024:.1f} MiB)')


if __name__ == '__main__':
    main()

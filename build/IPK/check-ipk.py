#!/usr/bin/env python3
"""Inspect assembled IPKs without extracting or running their contents."""
import argparse
import io
import json
from pathlib import Path, PurePosixPath
import tarfile


def check(path):
    with tarfile.open(path, 'r:gz') as outer:
        names = {m.name.lstrip('./'): m for m in outer.getmembers()}
        assert set(names) == {'debian-binary', 'control.tar.gz', 'data.tar.gz'}, names
        assert outer.extractfile(names['debian-binary']).read() == b'2.0\n'
        with tarfile.open(fileobj=io.BytesIO(outer.extractfile(names['control.tar.gz']).read()), mode='r:gz') as control:
            contents = {m.name.lstrip('./'): control.extractfile(m).read() for m in control.getmembers() if m.isfile()}
            metadata = dict(line.split(': ', 1) for line in contents['control'].decode().splitlines())
            if metadata['Package'] == 'luci-app-deepseek-harness':
                assert 'postinst' in contents, 'LuCI package must reload session ACLs after installation'
                hook = control.getmember('./postinst')
                assert hook.mode & 0o111, 'LuCI postinst must be executable'
                commands = [line.strip() for line in contents['postinst'].decode().splitlines()
                            if line.strip() and not line.lstrip().startswith('#')]
                assert '[ -z "${IPKG_INSTROOT:-}" ] || exit 0' in commands
                assert '/etc/init.d/rpcd reload' in commands
            if metadata['Package'] == 'deepseek-harness':
                assert contents['conffiles'] == b'/etc/config/deepseek-harness\n'
                assert set(['postinst', 'prerm', 'postrm']).issubset(contents)
                for hook in ['postinst', 'prerm', 'postrm']:
                    assert control.getmember('./' + hook).mode & 0o111, hook
                commands = '\n'.join(line for line in contents['postinst'].decode().splitlines()
                                     if not line.lstrip().startswith('#'))
                assert 'tar -xzf /usr/lib/deepseek-harness/payload.tar.gz -C "$unpack_dir"' in commands
                assert 'rm -rf /usr/lib/deepseek-harness/app /usr/lib/deepseek-harness/runtime' in commands
        with tarfile.open(fileobj=io.BytesIO(outer.extractfile(names['data.tar.gz']).read()), mode='r:gz') as data:
            members = {m.name.lstrip('./'): m for m in data.getmembers()}
            installed_size = sum(m.size for m in members.values() if m.isfile())
            for name, member in members.items():
                assert not PurePosixPath(member.name).is_absolute() and '..' not in PurePosixPath(member.name).parts, name
                assert member.uid == member.gid == 0, name
                if member.issym():
                    assert not member.linkname.startswith('/work'), name
                    assert not member.linkname.startswith('/app'), name
            if metadata['Package'] == 'deepseek-harness':
                assert metadata['Architecture'] in ['x86_64', 'aarch64_generic']
                config = members['etc/config/deepseek-harness']
                assert config.mode == 0o600
                assert b"option enabled '0'" in data.extractfile(config).read()
                for name in ['etc/init.d/deepseek-harness', 'usr/lib/deepseek-harness/bin/serve']:
                    assert members[name].mode & 0o111, name
                assert 'usr/lib/deepseek-harness/capture-login.mjs' in members
                serve = data.extractfile(members['usr/lib/deepseek-harness/bin/serve']).read().decode()
                commands = '\n'.join(line for line in serve.splitlines() if not line.lstrip().startswith('#'))
                assert '--import /usr/lib/deepseek-harness/capture-login.mjs' in commands
                assert len(members) < 100, 'opkg adapter file list must remain small for upgrades'
                with tarfile.open(fileobj=io.BytesIO(data.extractfile(members['usr/lib/deepseek-harness/payload.tar.gz']).read()), mode='r:gz') as payload:
                    runtime = {m.name.lstrip('./'): m for m in payload.getmembers()}
                    for name, member in runtime.items():
                        raw = PurePosixPath(member.name)
                        assert not raw.is_absolute() and '..' not in raw.parts, name
                        assert member.uid == member.gid == 0, name
                        if member.issym():
                            assert not member.linkname.startswith(('/work', '/app')), name
                    assert runtime['runtime/bin/node'].mode & 0o111
                    installed_size += sum(m.size for m in runtime.values() if m.isfile())
                    meta = json.loads(payload.extractfile(runtime['build-info.json']).read())
                    assert meta['libc'] == 'musl'
                    assert meta['arch'] == ('x64' if metadata['Architecture'] == 'x86_64' else 'arm64')
                    index = payload.extractfile(runtime['app/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html']).read()
                    assert index.count(b'istoreos-lan-bridge') == 1
                    assert b'ownsHost' in index and b'crypto.randomUUID' in index
            else:
                assert metadata['Package'] == 'luci-app-deepseek-harness'
                assert metadata['Architecture'] == 'all'
                for name in ['usr/share/luci/menu.d/luci-app-deepseek-harness.json', 'usr/share/rpcd/acl.d/luci-app-deepseek-harness.json']:
                    json.loads(data.extractfile(members[name]).read())
                assert 'www/luci-static/resources/view/deepseek-harness/config.js' in members
                assert members['usr/libexec/rpcd/deepseek-harness'].mode & 0o111
                assert 'usr/libexec/deepseek-harness-login.mjs' in members
                acl = json.loads(data.extractfile(members['usr/share/rpcd/acl.d/luci-app-deepseek-harness.json']).read())
                assert acl['luci-app-deepseek-harness']['write']['ubus']['deepseek-harness'] == ['login']
            assert int(metadata['Installed-Size']) == installed_size
            print(f"PASS {path.name}: {metadata['Architecture']}, {len(members)} payload entries, metadata/permissions/config")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packages', nargs='+', type=Path)
    for package in parser.parse_args().packages:
        check(package)

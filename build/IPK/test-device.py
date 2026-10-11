#!/usr/bin/env python3
"""Read-only smoke test of an already configured SSH device; never print tokens."""
import argparse
import base64
import json
import os
import re
import subprocess
import shlex
from device_http import request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ssh', required=True, help='SSH destination, e.g. root@192.168.1.1')
    parser.add_argument('--host', required=True, help='Web listener IP or hostname')
    parser.add_argument('--port', type=int, default=28000)
    args = parser.parse_args()
    assert not args.ssh.startswith('-'), 'Invalid SSH destination'
    assert 1024 <= args.port <= 65535

    def ssh(command):
        return subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
                                        args.ssh, command], text=True, timeout=20)

    service = json.loads(ssh("ubus call service list '{\"name\":\"deepseek-harness\"}'"))
    instance = service['deepseek-harness']['instances']['main']
    assert instance['running'], instance
    assert instance['user'] == 'deepseek-harness', 'Service must run without root'
    print('PASS procd service running as dedicated user')

    origin = f'http://{args.host}:{args.port}'
    assert request(origin + '/')[0] == 401, 'Unauthenticated request unexpectedly accepted'
    print('PASS unauthenticated HTTP 401')

    data_dir = ssh('uci -q get deepseek-harness.main.data_dir').strip()
    record_path = data_dir + '/.dsh/web-login.json'
    record = json.loads(ssh('cat ' + shlex.quote(record_path)))
    assert record['version'] == 1 and record['pid'] == instance['pid'] and record['port'] == args.port
    assert re.fullmatch(r'[A-Za-z0-9_-]{43}', record['token'])
    assert ssh('stat -c %a ' + shlex.quote(record_path)).strip() == '600'
    print('PASS private current-process login record (no syslog dependency)')
    status, headers, _ = request(origin + '/?token=' + record['token'])
    assert status in (302, 303) and 'set-cookie' in headers, 'Token did not produce a cookie'
    assert headers['location'] == ['./']
    cookie = headers['set-cookie'][0].split(';', 1)[0]
    status, _, html = request(origin + '/', {'Cookie': cookie})
    assert status == 200 and html.count('istoreos-lan-bridge') == 1
    assert 'ownsHost' in html and 'crypto.randomUUID' in html
    print('PASS authenticated HTTP 200, cookie and LAN bridge')

    key = base64.b64encode(os.urandom(16)).decode()
    status, _, _ = request(origin + '/api/remote.mux', {'Cookie': cookie, 'Origin': origin,
        'Upgrade': 'websocket', 'Connection': 'Upgrade', 'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13'}, timeout=2, streaming_upgrade=True)
    assert status == 101, 'WebSocket upgrade failed'
    print('PASS authenticated WebSocket 101')

    view_url = f'http://{args.host}/luci-static/resources/view/deepseek-harness/config.js'
    status, _, body = request(view_url)
    assert status == 200 and "new form.Map('deepseek-harness'" in body
    print('PASS LuCI view served')


if __name__ == '__main__':
    main()

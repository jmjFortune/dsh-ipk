#!/usr/bin/env python3
"""Verify login RPC ACLs and token exchange using a short-lived, single-method session."""
import argparse
import json
import shlex
import subprocess
from device_http import request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ssh', required=True)
    parser.add_argument('--host', required=True)
    args = parser.parse_args()
    assert not args.ssh.startswith('-')

    def ubus(method, payload):
        raw = subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
                                       args.ssh, 'ubus call session ' + method + ' ' +
                                       shlex.quote(json.dumps(payload))], text=True, timeout=15)
        return json.loads(raw or '{}')

    def login(session):
        status, _, body = request(f'http://{args.host}/ubus', {'Content-Type': 'application/json'},
            {'jsonrpc': '2.0', 'id': 1, 'method': 'call',
             'params': [session, 'deepseek-harness', 'login', {}]})
        assert status == 200
        return json.loads(body)

    anonymous = login('0' * 32)
    assert anonymous.get('result') == [6] or anonymous.get('error', {}).get('code') == -32002, 'Anonymous login RPC must be denied'
    print('PASS anonymous login RPC denied')
    session = ubus('create', {'timeout': 60})['ubus_rpc_session']
    try:
        ubus('grant', {'ubus_rpc_session': session, 'scope': 'ubus',
                       'objects': [['deepseek-harness', 'login']]})
        result = login(session).get('result', [])
        assert len(result) == 2, 'Authenticated login RPC failed'
        assert result[0] == 0 and 'error' not in result[1], 'Authenticated login RPC failed'
        reply = result[1]
        url = f"http://{args.host}:{reply['port']}/?token={reply['token']}"
        status, headers, _ = request(url)
        assert status in (302, 303) and 'set-cookie' in headers, 'RPC token must produce a login cookie'
        assert headers['location'] == ['./']
        cookie = headers['set-cookie'][0].split(';', 1)[0]
        status, _, body = request(f"http://{args.host}:{reply['port']}/", {'Cookie': cookie})
        assert status == 200 and 'istoreos-lan-bridge' in body
        print('PASS single-method authenticated RPC, official cookie exchange and clean URL HTTP 200')
    finally:
        ubus('destroy', {'ubus_rpc_session': session})
        print('PASS temporary verification session destroyed')


if __name__ == '__main__':
    main()

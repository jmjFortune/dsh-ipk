"""Device HTTP transport using curl; credentials stay in pipes, never command arguments."""
import json
import subprocess


def request(url, headers=None, data=None, timeout=12, streaming_upgrade=False):
    command = ['curl', '--noproxy', '*', '-sS', '--max-time', str(timeout), '-D', '-']
    if data is not None:
        assert '?' not in url, 'RPC URL must not carry credentials'
        command += ['--data-binary', '@-', url]
        for key, value in (headers or {}).items():
            command += ['-H', key + ': ' + value]
        payload = json.dumps(data)
    else:
        command += ['--config', '-']
        config = ['url = ' + json.dumps(url)]
        for key, value in (headers or {}).items():
            config.append('header = ' + json.dumps(key + ': ' + value))
        payload = '\n'.join(config)
    # A completed WebSocket handshake may be followed by binary close frames.
    result = subprocess.run(command, input=payload, capture_output=True, text=True,
                            errors='replace' if streaming_upgrade else 'strict', timeout=timeout + 2)
    allowed = (0, 28) if streaming_upgrade else (0,)
    assert result.returncode in allowed, 'HTTP connection failed or timed out'
    head, separator, body = result.stdout.partition('\n\n')
    assert separator, 'No HTTP response headers'
    status = int(head.splitlines()[0].split()[1])
    values = {}
    for line in head.splitlines()[1:]:
        key, _, value = line.partition(':')
        values.setdefault(key.lower(), []).append(value.strip())
    return status, values, body

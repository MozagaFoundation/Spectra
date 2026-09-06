#!/usr/bin/env bash
# Copyright (c) 2026 MOZAGA FOUNDATION.
# SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
# See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 host[:port] [host[:port] ...]" >&2
  exit 1
fi

python3 - "$@" <<'PY'
import os
import subprocess
import sys
import tempfile


def run_openssl(args: list[str], *, input_data: bytes = b'', check: bool = True) -> bytes:
    return subprocess.run(
        ['openssl', *args],
        input=input_data,
        capture_output=True,
        check=check,
    ).stdout


def extract_certificates(host: str, port: str) -> list[str]:
    data = run_openssl(
        ['s_client', '-servername', host, '-showcerts', '-connect', f'{host}:{port}'],
        check=False,
    ).decode('utf-8', 'ignore')

    certs: list[str] = []
    current: list[str] = []
    in_cert = False
    for line in data.splitlines():
        if 'BEGIN CERTIFICATE' in line:
            in_cert = True
            current = [line]
        elif 'END CERTIFICATE' in line and in_cert:
            current.append(line)
            certs.append('\n'.join(current) + '\n')
            in_cert = False
            current = []
        elif in_cert:
            current.append(line)

    return certs


def extract_pin(cert_pem: str) -> tuple[str, str, str]:
    with tempfile.NamedTemporaryFile('w', delete=False) as handle:
        handle.write(cert_pem)
        path = handle.name

    try:
        pubkey = run_openssl(['x509', '-in', path, '-pubkey', '-noout'])
        der = run_openssl(['pkey', '-pubin', '-outform', 'DER'], input_data=pubkey)
        digest = run_openssl(['dgst', '-sha256', '-binary'], input_data=der)
        pin = run_openssl(['base64', '-A'], input_data=digest).decode().strip()
        subject = run_openssl(['x509', '-in', path, '-noout', '-subject']).decode().strip()
        issuer = run_openssl(['x509', '-in', path, '-noout', '-issuer']).decode().strip()
        return pin, subject, issuer
    finally:
        os.unlink(path)


for target in sys.argv[1:]:
    if ':' in target:
        host, port = target.rsplit(':', 1)
    else:
        host, port = target, '443'

    certificates = extract_certificates(host, port)
    if not certificates:
        print(f'HOST {host}:{port} - no certificates returned', file=sys.stderr)
        continue

    print(f'HOST {host}:{port}')
    for index, certificate in enumerate(certificates[:3], start=1):
        pin, subject, issuer = extract_pin(certificate)
        print(f'  CERT {index}: {pin}')
        print(f'    {subject}')
        print(f'    {issuer}')
    print()
PY

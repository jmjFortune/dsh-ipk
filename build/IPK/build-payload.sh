#!/usr/bin/env bash
set -euo pipefail

# This runs in the target Alpine container. /src is read-only; /work and /out
# are disposable build directories, never router data directories.
test -f /src/package-lock.json
test -d /work
test -d /out
test -x /usr/local/bin/node
cd /work
if [ "${DSH_REUSE_APP:-0}" != 1 ]; then
  cp /src/package.json /src/package-lock.json /work/
  npm ci --omit=dev --no-audit --no-fund
  npm rebuild node-pty --build-from-source
else
  cmp /src/package-lock.json /work/package-lock.json
fi
node --expose-internals /src/test-native.mjs /work

mkdir -p /out/app /out/runtime/bin /out/runtime/lib /out/licenses
cp -a /work/node_modules /out/app/
cp /work/package.json /work/package-lock.json /out/app/
python3 /src/patch-frontend.py /out
cp /usr/local/bin/node /out/runtime/bin/node
cp /usr/local/LICENSE /out/licenses/Node-LICENSE
for lib in /lib/ld-musl-*.so.1 /usr/lib/libstdc++.so.6 /usr/lib/libgcc_s.so.1; do
  cp -L "$lib" /out/runtime/lib/
done
loader=$(basename /lib/ld-musl-*.so.1)
case "$loader" in
  ld-musl-x86_64.so.1) libc=libc.musl-x86_64.so.1 ;;
  ld-musl-aarch64.so.1) libc=libc.musl-aarch64.so.1 ;;
  *) echo "Unsupported musl loader: $loader" >&2; exit 1 ;;
esac
ln -sf "$loader" "/out/runtime/lib/$libc"
private_loader="/usr/lib/deepseek-harness/runtime/lib/$loader"
patchelf --set-interpreter "$private_loader" --set-rpath '$ORIGIN/../lib' /out/runtime/bin/node
# Patch musl executables, including node-pty's rebuilt spawn helper. Preserve
# their existing RPATH (sharp and other addons carry private libraries).
while IFS= read -r -d '' file; do
  interpreter=$(patchelf --print-interpreter "$file" 2>/dev/null || true)
  case "$interpreter" in
    */ld-musl-*.so.1)
      old_rpath=$(patchelf --print-rpath "$file")
      patchelf --set-interpreter "$private_loader" \
        --set-rpath "/usr/lib/deepseek-harness/runtime/lib${old_rpath:+:$old_rpath}" "$file"
      ;;
  esac
done < <(find /out/app/node_modules -type f -perm /111 -print0)
node -e 'const fs=require("fs");fs.writeFileSync("/out/build-info.json",JSON.stringify({node:process.version,arch:process.arch,libc:"musl",dsh:require("/work/node_modules/@deepseek-ai/dsh/package.json").version},null,2)+"\n")'

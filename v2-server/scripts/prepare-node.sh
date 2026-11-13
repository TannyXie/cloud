#!/usr/bin/env bash
set -euo pipefail

# Preparation is deliberately outside the demo hot path and never changes the source checkout.
source_commit=aa21210e1f8214c9eb73301132eb5c3db351aa24
# Keep the per-architecture digests in step with internal/nodeservices/packages.go.
[[ $(uname -s) == Linux ]] || { echo 'Preparation supports Linux x86_64 and aarch64.' >&2; exit 1; }
case $(uname -m) in
  x86_64) target=x86_64-unknown-linux-gnu opencode_sha=88c00f81997fc7fe892f2d58a686f535678e562c7e000d33eb7ee3b1d0f754b5 claude_sha=7e10e4b9c3564d17169ffd3dc289d3e60b0972516098275834203df66b9110f9 ;;
  aarch64) target=aarch64-unknown-linux-gnu opencode_sha=41f58c82f343153f23771f7f314c22212145b3dcf039451b5a869dba24894547 claude_sha=6c2b69e9d880e9928f9bf3194b9b10232be190aa9f8919857d4fe0db645c1c3e ;;
  *) echo 'Preparation supports Linux x86_64 and aarch64.' >&2; exit 1 ;;
esac
# The Agent declaration inside the Claude Code package, which configured sessions freeze.
claude_declaration_sha=2d1afa5e03b476385a6c188f7444184be11e82e81191d8efe2e9f354456753c1
: "${DESKTOP_REPOSITORY:?Set DESKTOP_REPOSITORY to a desktop repository containing the pinned commit}"
git -C "$DESKTOP_REPOSITORY" cat-file -e "$source_commit^{commit}"
assets_dir=${V2_NODE_ASSETS_DIR:-$HOME/.cache/ora-v2-node}
mkdir -p "$assets_dir"
assets_dir=$(cd "$assets_dir" && pwd -P)
export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
deno_path=${V2_DENO_PATH:-$HOME/.deno/bin/deno}
[[ $("$deno_path" --version | head -1) == "deno 2.9.5 (stable, release, $target)" ]] || { echo "Deno 2.9.5 for $target is required." >&2; exit 1; }

source_dir="$assets_dir/source-$source_commit"
if [[ ! -f "$source_dir/.source-commit" ]]; then
  [[ ! -e "$source_dir" ]] || { echo "Unrecognized source directory: $source_dir" >&2; exit 1; }
  mkdir "$source_dir"
  git -C "$DESKTOP_REPOSITORY" archive "$source_commit" | tar -x -C "$source_dir"
  printf '%s\n' "$source_commit" > "$source_dir/.source-commit"
fi
[[ $(cat "$source_dir/.source-commit") == "$source_commit" ]] || { echo 'Source marker mismatch.' >&2; exit 1; }
# Release by default: every project runs its own Node and reaper, so idle cost matters more
# than the one-time compile. V2_NODE_PROFILE=debug trades that for a faster first build.
profile=${V2_NODE_PROFILE:-release}
case $profile in
  release) profile_flag=--release ;;
  debug) profile_flag= ;;
  *) echo 'V2_NODE_PROFILE must be release or debug.' >&2; exit 1 ;;
esac
(cd "$source_dir" && cargo +1.95.0 build --locked $profile_flag -p ora-node -p ora-reaper)
# Fixed modes, so the result does not depend on the caller's umask.
install -d -m 0755 "$assets_dir" "$assets_dir/bin"
for binary in ora-node ora-reaper; do
  install -m 0755 -- "$source_dir/target/$profile/$binary" "$assets_dir/bin/$binary"
done
install -m 0755 -- "$deno_path" "$assets_dir/bin/deno"
# fetch_plugin <file> <url> <sha256>: download once, then verify on every run.
fetch_plugin() {
  if [[ ! -f "$1" ]]; then
    curl --fail --location --retry 3 --output "$1.download" "$2"
    printf '%s  %s\n' "$3" "$1.download" | sha256sum --check --status
    mv -- "$1.download" "$1"
  fi
  printf '%s  %s\n' "$3" "$1" | sha256sum --check --status
}
fetch_plugin "$assets_dir/opencode-0.6.11.orax" "https://github.com/ora-space/opencode-agent/releases/download/v0.6.11/ora-space.opencode-v0.6.11-$target.orax" "$opencode_sha"
fetch_plugin "$assets_dir/claude-0.4.5.orax" "https://github.com/ora-space/claude-code-agent/releases/download/v0.4.5/ora-space.claude-v0.4.5-$target.orax" "$claude_sha"

# Source revision and plugin digests are pinned above. Locally built executables and the trusted,
# version-checked Deno installation are hashed here and verified again by runtime startup.
python3 - "$assets_dir" "$source_commit" "$claude_declaration_sha" "$profile" <<'PY'
import hashlib, json, pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root/'claude-0.4.5.orax') as package:
    declaration = hashlib.sha256(package.read('assets/config.json')).hexdigest()
if declaration != sys.argv[3]:
    sys.exit('Claude Code declaration digest mismatch')
def asset(path):
    with path.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    return {'Path': str(path), 'SHA256': digest}
manifest = {'version': 1, 'sourceCommit': sys.argv[2], 'profile': sys.argv[4],
            'node': asset(root/'bin'/'ora-node'),
            'reaper': asset(root/'bin'/'ora-reaper'),
            'deno': asset(root/'bin'/'deno'),
            'plugin': asset(root/'opencode-0.6.11.orax'),
            'claude': asset(root/'claude-0.4.5.orax')}
target = root/'assets.json'
target.write_text(json.dumps(manifest, indent=2) + '\n')
print(target)
PY

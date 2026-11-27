#!/usr/bin/env python3
"""Repackage docker-save archives with raw layers, preserving exact image IDs."""
import gzip
import hashlib
import io
import json
import pathlib
import re
import sys
import tarfile
import tempfile


def prepare(source, destination):
    with tarfile.open(source, 'r:*') as archive, tempfile.TemporaryDirectory() as work:
        manifest = json.load(archive.extractfile('manifest.json'))
        configs, layers, output_manifest = {}, {}, []
        for image in manifest:
            config_bytes = archive.extractfile(image['Config']).read()
            config_id = hashlib.sha256(config_bytes).hexdigest()
            config = json.loads(config_bytes)
            diff_ids = config['rootfs']['diff_ids']
            if len(diff_ids) != len(image['Layers']):
                raise ValueError('Image layer count mismatch')
            layer_paths = []
            for diff_id, member in zip(diff_ids, image['Layers']):
                if not re.fullmatch(r'sha256:[0-9a-f]{64}', diff_id):
                    raise ValueError('Invalid layer digest')
                key = diff_id[7:]
                layers.setdefault(key, member)
                layer_paths.append(key + '/layer.tar')
            configs[config_id + '.json'] = config_bytes
            output_manifest.append({'Config': config_id + '.json',
                                    'RepoTags': image.get('RepoTags'), 'Layers': layer_paths})

        def add(output, name, stream, size):
            info = tarfile.TarInfo(name)
            info.size, info.mode = size, 0o644
            output.addfile(info, stream)

        with tarfile.open(destination, 'w') as output:
            for key, member_name in sorted(layers.items()):
                raw_path = pathlib.Path(work) / 'layer'
                stream = archive.extractfile(member_name)
                compressed = stream.read(2) == b'\x1f\x8b'
                stream.seek(0)
                digest = hashlib.sha256()
                with (gzip.GzipFile(fileobj=stream) if compressed else stream) as layer:
                    with raw_path.open('wb') as raw:
                        while block := layer.read(1024 * 1024):
                            digest.update(block)
                            raw.write(block)
                if digest.hexdigest() != key:
                    raise ValueError('Image layer content does not match config diff_id')
                with raw_path.open('rb') as raw:
                    add(output, key + '/layer.tar', raw, raw_path.stat().st_size)
                raw_path.unlink()
            for name, data in sorted(configs.items()):
                add(output, name, io.BytesIO(data), len(data))
            data = json.dumps(output_manifest, sort_keys=True).encode()
            add(output, 'manifest.json', io.BytesIO(data), len(data))


if __name__ == '__main__':
    prepare(sys.argv[1], sys.argv[2])

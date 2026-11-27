import gzip
import hashlib
import importlib.util
import io
import json
import pathlib
import tarfile
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('prepare',pathlib.Path(__file__).with_name('prepare-image-archive.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ArchiveTest(unittest.TestCase):
    def test_preserves_image_config_and_raw_layer_digests_for_both_formats(self):
        for compressed in (False,True):
            with tempfile.TemporaryDirectory() as work:
                source,destination=pathlib.Path(work)/'source.tar',pathlib.Path(work)/'result.tar'
                layer=b'unchanged layer bytes'*100
                digest=hashlib.sha256(layer).hexdigest()
                config=json.dumps({'rootfs':{'type':'layers','diff_ids':['sha256:'+digest]}}).encode()
                manifest=[{'Config':'config','RepoTags':['example:test'],'Layers':['layer']}]
                with tarfile.open(source,'w') as t:
                    for name,data in [('config',config),('layer',gzip.compress(layer) if compressed else layer),('manifest.json',json.dumps(manifest).encode())]:
                        info=tarfile.TarInfo(name);info.size=len(data);t.addfile(info,io.BytesIO(data))
                module.prepare(source,destination)
                with tarfile.open(destination) as t:
                    actual=json.load(t.extractfile('manifest.json'))[0]
                    self.assertEqual(actual['RepoTags'],['example:test'])
                    self.assertEqual(t.extractfile(actual['Config']).read(),config)
                    self.assertEqual(t.extractfile(actual['Layers'][0]).read(),layer)
                first=destination.read_bytes()
                module.prepare(source,destination)
                self.assertEqual(destination.read_bytes(),first)

    def test_rejects_corrupted_layers(self):
        with tempfile.TemporaryDirectory() as work:
            source,dest=pathlib.Path(work)/'s.tar',pathlib.Path(work)/'d.tar'
            config=json.dumps({'rootfs':{'diff_ids':['sha256:'+'0'*64]}}).encode()
            manifest=[{'Config':'config','Layers':['layer']}]
            with tarfile.open(source,'w') as t:
                for name,data in [('config',config),('layer',b'corrupt'),('manifest.json',json.dumps(manifest).encode())]:
                    info=tarfile.TarInfo(name);info.size=len(data);t.addfile(info,io.BytesIO(data))
            with self.assertRaises(ValueError): module.prepare(source,dest)

if __name__=='__main__': unittest.main()

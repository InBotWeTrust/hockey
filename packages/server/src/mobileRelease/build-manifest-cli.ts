import { chmod, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseUnsignedAndroidReleaseManifest } from './schema.js';
import { signReleaseManifest } from './signature.js';

export async function buildManifestFile(
  metadataPath: string,
  outputPath: string,
  privateKey: string,
): Promise<void> {
  const metadata = parseUnsignedAndroidReleaseManifest(
    JSON.parse(await readFile(metadataPath, 'utf8')),
  );
  const signed = signReleaseManifest(metadata, privateKey.replace(/\\n/g, '\n'));
  await writeFile(outputPath, `${JSON.stringify(signed, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  await chmod(outputPath, 0o600);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [metadataPath, outputPath] = process.argv.slice(2);
  const privateKey = process.env.ANDROID_MANIFEST_PRIVATE_KEY;
  if (!metadataPath || !outputPath || !privateKey) {
    console.error('usage: mobile:release-manifest <metadata-json> <output-json>');
    process.exitCode = 1;
  } else {
    buildManifestFile(metadataPath, outputPath, privateKey).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'manifest build failed');
      process.exitCode = 1;
    });
  }
}

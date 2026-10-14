import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsLibrarySource, LibraryUnavailableError } from '../src/library/librarySource';

function libraryWith(files: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'eikon-lib-'));
  for (const rel of files) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), `bytes of ${rel}`);
  }
  return root;
}

async function listedPaths(root: string): Promise<string[]> {
  return (await new FsLibrarySource(root).list()).map((e) => e.relPath).toSorted();
}

describe('FsLibrarySource.list', () => {
  it.each([
    { label: 'images in group folders', file: 'Illustrators/Wlop/a.jpg', listed: true },
    { label: 'nested subfolders', file: 'Collections/Golden Hour/2024/b.webp', listed: true },
    { label: 'lower-case top-level folder', file: 'illustrators/Guweiz/c.PNG', listed: true },
    { label: 'files directly under a top-level folder', file: 'Illustrators/loose.jpg', listed: false },
    { label: 'unsupported files', file: 'Illustrators/Wlop/notes.txt', listed: false },
    {
      label: 'Synology @eaDir thumbnails',
      file: 'Illustrators/Wlop/@eaDir/a.jpg/SYNOFILE_THUMB_M.jpg',
      listed: false,
    },
    { label: 'the #recycle bin', file: 'Collections/#recycle/old.jpg', listed: false },
    { label: 'dot-files', file: 'Illustrators/Wlop/.hidden.jpg', listed: false },
    { label: 'other top-level folders', file: 'Inbox/Someone/d.jpg', listed: false },
  ])('$label → listed: $listed', async ({ file, listed }) => {
    const root = libraryWith(['Illustrators/Keep/keep.jpg', file]);
    expect((await listedPaths(root)).includes(file)).toBe(listed);
  });

  it('reports group, kind, size and mtime', async () => {
    const root = libraryWith(['Collections/Favs/x.gif']);
    const [entry] = await new FsLibrarySource(root).list();
    expect(entry).toMatchObject({
      kind: 'collection',
      groupName: 'Favs',
      relPath: 'Collections/Favs/x.gif',
      sizeBytes: 'bytes of Collections/Favs/x.gif'.length,
    });
    expect(entry!.mtimeMs).toBeGreaterThan(0);
  });

  it.each([
    { label: 'an empty folder', files: [] as string[] },
    { label: 'a folder without Illustrators/ or Collections/', files: ['Photos/a.jpg'] },
  ])('treats $label as an unmounted library', async ({ files }) => {
    await expect(new FsLibrarySource(libraryWith(files)).list()).rejects.toBeInstanceOf(
      LibraryUnavailableError,
    );
  });

  it('treats a missing folder as an unmounted library', async () => {
    await expect(new FsLibrarySource('/nonexistent/eikon-library').list()).rejects.toBeInstanceOf(
      LibraryUnavailableError,
    );
  });
});

describe('FsLibrarySource reads', () => {
  const root = libraryWith(['Illustrators/Wlop/a.jpg']);
  const source = new FsLibrarySource(root);

  it('reads and streams files inside the library', async () => {
    expect((await source.read('Illustrators/Wlop/a.jpg')).toString()).toBe(
      'bytes of Illustrators/Wlop/a.jpg',
    );
    const chunks: Buffer[] = [];
    for await (const chunk of await source.open('Illustrators/Wlop/a.jpg')) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('bytes of Illustrators/Wlop/a.jpg');
  });

  it.each(['../outside.jpg', 'Illustrators/../../etc/passwd', '/etc/passwd'])(
    'refuses %s, which escapes the library',
    async (relPath) => {
      await expect(source.read(relPath)).rejects.toThrow(/escapes library/);
      await expect(source.open(relPath)).rejects.toThrow(/escapes library/);
    },
  );

  it('rejects opening a file that does not exist', async () => {
    await expect(source.open('Illustrators/Wlop/missing.jpg')).rejects.toThrow(/ENOENT/);
  });
});

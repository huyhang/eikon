import { describe, expect, it } from 'vitest';
import { classifyPath, hasSupportedExtension } from '../src/library/pathClassifier';

describe('classifyPath', () => {
  it.each([
    ['Illustrators/Wlop/a.jpg', { kind: 'illustrator', groupName: 'Wlop' }],
    ['illustrators/Wlop/2024/deep/a.PNG', { kind: 'illustrator', groupName: 'Wlop' }],
    ['Collections/Moody Skies/b.webp', { kind: 'collection', groupName: 'Moody Skies' }],
    ['Collections/Mood/anim.gif', { kind: 'collection', groupName: 'Mood' }],
    ['Illustrators/a.jpg', null],
    ['Other/Wlop/a.jpg', null],
    ['Illustrators/Wlop/notes.txt', null],
    ['Illustrators/Wlop/@eaDir/a.jpg/SYNOFILE_THUMB_M.jpg', null],
    ['Illustrators/#recycle/a.jpg', null],
    ['Illustrators/Wlop/.hidden.jpg', null],
    ['Illustrators/Wlop/jpg', null],
  ])('%s', (path, expected) => {
    expect(classifyPath(path)).toEqual(expected);
  });
});

describe('hasSupportedExtension', () => {
  it.each([
    ['a.jpeg', true],
    ['a.AVIF', true],
    ['a.tiff', false],
    ['png', false],
  ])('%s → %s', (name, expected) => {
    expect(hasSupportedExtension(name)).toBe(expected);
  });
});

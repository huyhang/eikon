import { describe, expect, it } from 'vitest';
import {
  FILMSTRIP_SPACE,
  INFO_PANEL_WIDTH,
  pictureBox,
  TOOLBAR_SPACE,
  TOP_BAR_SPACE,
  viewerLayout,
  type ViewerLayoutInput,
} from './viewerLayout';

const phone = { width: 400, height: 800 };
const tablet = { width: 1200, height: 800 };
const base: ViewerLayoutInput = {
  viewport: phone,
  wide: false,
  infoOpen: false,
  chrome: true,
  filmstrip: false,
  split: false,
  sidebar: 0,
};

describe('viewerLayout', () => {
  it.each<{
    name: string;
    input: Partial<ViewerLayoutInput>;
    expected: Partial<ReturnType<typeof viewerLayout>>;
  }>([
    {
      name: 'phone: picture sits between top bar and toolbar',
      input: {},
      expected: {
        width: 400,
        stage: { width: 400, height: 800 },
        insets: { top: TOP_BAR_SPACE, bottom: TOOLBAR_SPACE },
        sheetHeight: 0,
      },
    },
    {
      name: 'phone, chrome hidden: edge to edge',
      input: { chrome: false },
      expected: { insets: { top: 0, bottom: 0 } },
    },
    {
      name: 'phone, info open: the sheet takes 60% and the picture moves into the rest',
      input: { infoOpen: true },
      expected: {
        stage: { width: 400, height: 320 },
        sheetHeight: 480,
        insets: { top: TOP_BAR_SPACE, bottom: TOOLBAR_SPACE },
      },
    },
    {
      name: 'phone, info open, chrome hidden: the picture uses all the room above the sheet',
      input: { infoOpen: true, chrome: false },
      expected: { stage: { width: 400, height: 320 }, insets: { top: 0, bottom: 8 } },
    },
    {
      name: 'tablet, info open: the panel sits beside the picture',
      input: { viewport: tablet, wide: true, infoOpen: true },
      expected: { stage: { width: 1200 - INFO_PANEL_WIDTH, height: 800 }, sheetHeight: 0 },
    },
    {
      name: 'tablet with filmstrip: room is kept for it',
      input: { viewport: tablet, wide: true, filmstrip: true },
      expected: { insets: { top: TOP_BAR_SPACE, bottom: TOOLBAR_SPACE + FILMSTRIP_SPACE } },
    },
    {
      name: 'tablet split view: the viewer takes 55% of the space beside the sidebar',
      input: { viewport: tablet, wide: true, split: true, sidebar: 200 },
      expected: { width: 550, stage: { width: 550, height: 800 } },
    },
    {
      name: 'phones ignore split view and the filmstrip',
      input: { split: true, filmstrip: true },
      expected: { width: 400, insets: { top: TOP_BAR_SPACE, bottom: TOOLBAR_SPACE } },
    },
  ])('$name', ({ input, expected }) => {
    expect(viewerLayout({ ...base, ...input })).toMatchObject(expected);
  });
});

describe('pictureBox', () => {
  it.each([
    { name: 'wide picture fills the width', aspect: 2, expected: { x: 0, width: 400, height: 200 } },
    {
      name: 'tall picture fills the free height',
      aspect: 0.5,
      expected: { y: TOP_BAR_SPACE, height: 800 - TOP_BAR_SPACE - TOOLBAR_SPACE },
    },
  ])('$name', ({ aspect, expected }) => {
    expect(pictureBox(aspect, phone, { top: TOP_BAR_SPACE, bottom: TOOLBAR_SPACE }, 0)).toMatchObject(
      expected,
    );
  });

  it('never goes negative when the insets exceed the stage', () => {
    expect(pictureBox(1, { width: 100, height: 50 }, { top: 40, bottom: 40 }, 0)).toMatchObject({
      width: 0,
      height: 0,
    });
  });
});

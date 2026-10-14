import { fitRect, type Rect } from './geometry';

export const TOP_BAR_SPACE = 64;
export const TOOLBAR_SPACE = 84;
export const FILMSTRIP_SPACE = 60;
export const INFO_PANEL_WIDTH = 380;
/** Share of the screen the info sheet takes on phones; the picture moves into the rest. */
export const INFO_SHEET_FRACTION = 0.6;
/** Share of the screen the viewer takes in split view; the grid keeps the rest. */
export const SPLIT_FRACTION = 0.6;

export interface ViewerLayoutInput {
  viewport: { width: number; height: number };
  /** Wide screens show the info panel beside the picture and arrows, filmstrip and split view. */
  wide: boolean;
  infoOpen: boolean;
  /** Top bar and toolbar visible (a tap hides them). */
  chrome: boolean;
  filmstrip: boolean;
  split: boolean;
}

export interface Insets {
  top: number;
  bottom: number;
}

export interface ViewerLayout {
  /** Width of the whole viewer (less than the screen in split view). */
  width: number;
  /** The area the picture is fitted into: the viewer minus the side info panel or the sheet. */
  stage: { width: number; height: number };
  /** Space kept clear inside the stage for the top bar, toolbar and filmstrip. */
  insets: Insets;
  padding: number;
  /** Height of the phone info sheet; 0 when it isn't showing. */
  sheetHeight: number;
}

/** Where everything in the viewer goes, so the picture is never hidden behind chrome or the info sheet. */
export function viewerLayout(input: ViewerLayoutInput): ViewerLayout {
  const { viewport, wide, infoOpen, chrome, filmstrip, split } = input;
  const width = wide && split ? Math.round(viewport.width * SPLIT_FRACTION) : viewport.width;
  const sheetHeight = !wide && infoOpen ? Math.round(viewport.height * INFO_SHEET_FRACTION) : 0;
  const stage = {
    width: width - (wide && infoOpen ? INFO_PANEL_WIDTH : 0),
    height: viewport.height - sheetHeight,
  };
  const insets: Insets = sheetHeight
    ? { top: TOP_BAR_SPACE, bottom: 8 }
    : chrome
      ? { top: TOP_BAR_SPACE, bottom: TOOLBAR_SPACE + (filmstrip && wide ? FILMSTRIP_SPACE : 0) }
      : { top: 0, bottom: 0 };
  return { width, stage, insets, padding: wide ? 20 : 0, sheetHeight };
}

/** The picture's box: as large as fits between the insets, centred, keeping its aspect ratio. */
export function pictureBox(
  aspect: number,
  stage: { width: number; height: number },
  insets: Insets,
  padding: number,
): Rect {
  const area = {
    x: 0,
    y: insets.top,
    width: stage.width,
    height: Math.max(0, stage.height - insets.top - insets.bottom),
  };
  return fitRect(area, aspect, padding);
}

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { sampleTile } from '../../test/fakeApi';
import { ViewerImage } from './ViewerImage';

const stage = { width: 400, height: 800 };
const insets = { top: 60, bottom: 100 };

describe('ViewerImage', () => {
  it('zooms the picture itself within the area between the bars, starting where it sits', () => {
    // A 2:1 picture on a phone: 400×200, centred in the 640 px tall area, so black above and below.
    const { container } = render(
      <ViewerImage
        tile={sampleTile(1, { width: 1600, height: 800 })}
        stage={stage}
        insets={insets}
        padding={0}
        alt=""
        active
        animated={false}
      />,
    );
    const wrapper = container.querySelector<HTMLElement>('.react-transform-wrapper')!;
    const content = container.querySelector<HTMLElement>('.react-transform-component')!;
    expect(wrapper.style).toMatchObject({ top: '60px', width: '400px', height: '640px' });
    expect(content.style).toMatchObject({ width: '400px', height: '200px' });
    expect(content.style.transform).toMatch(/^translate\(0px, 220px\) scale\(1\)/);
  });
});

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom does no layout, so it has no scrollIntoView; components call it to keep things in view.
Element.prototype.scrollIntoView ??= () => {};

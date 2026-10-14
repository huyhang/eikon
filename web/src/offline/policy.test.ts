import { describe, expect, it } from 'vitest';
import { cacheKey, routeFor, type OfflineRoute } from './policy';

const ORIGIN = 'https://eikon.test';

describe('routeFor', () => {
  it.each<[string, string, string, OfflineRoute]>([
    ['GET', '/favorites', 'navigate', 'page'],
    ['GET', '/assets/index-abc123.js', 'no-cors', 'shell'],
    ['GET', '/manifest.webmanifest', 'cors', 'shell'],
    ['GET', '/api/images?favorites=true', 'cors', 'api'],
    ['GET', '/api/images/5', 'cors', 'api'],
    ['GET', '/media/thumb/5/lg', 'no-cors', 'thumb'],
    ['GET', '/media/original/5', 'no-cors', 'network'],
    ['GET', '/api/export', 'cors', 'network'],
    ['GET', '/api/backups/eikon-2026-10-14.db', 'cors', 'network'],
    ['GET', '/api/backups', 'cors', 'api'],
    ['POST', '/api/images/5/tags', 'cors', 'network'],
    ['PUT', '/api/images/5/favorite', 'cors', 'network'],
    ['GET', 'https://fonts.example.com/a.woff2', 'cors', 'network'],
  ])('%s %s (%s) → %s', (method, path, mode, expected) => {
    expect(routeFor({ method, url: new URL(path, ORIGIN).href, mode }, ORIGIN)).toBe(expected);
  });
});

describe('cacheKey', () => {
  it.each([
    ['https://eikon.test/api/images?favorites=true&sort=newest', '/api/images?favorites=true&sort=newest'],
    ['/media/thumb/5/sm', '/media/thumb/5/sm'],
    ['https://eikon.test/', '/'],
  ])('%s → %s', (url, expected) => {
    expect(cacheKey(url)).toBe(expected);
  });
});

import { describe, it, expect } from 'vitest';

import { buildStoryUrl } from '../storybook.js';

describe('buildStoryUrl', () => {
  const BASE_URL = 'http://localhost:6006';

  it('builds a basic iframe URL for a story ID', () => {
    const url = buildStoryUrl(BASE_URL, 'components-button--primary');

    expect(url).toBe(
      'http://localhost:6006/iframe.html?id=components-button--primary&viewMode=story',
    );
  });

  it('appends globals as URL parameters', () => {
    const url = buildStoryUrl(BASE_URL, 'components-button--primary', {
      theme: 'dark',
      locale: 'en-AU',
    });

    const parsed = new URL(url);
    const globals = parsed.searchParams.get('globals');
    expect(globals).not.toBeNull();
    expect(globals).toContain('theme:dark');
    expect(globals).toContain('locale:en-AU');
  });

  it('omits globals parameter when globals is empty', () => {
    const url = buildStoryUrl(BASE_URL, 'my-story--default', {});

    expect(url).not.toContain('&globals=');
  });

  it('handles storybookUrl with trailing slash', () => {
    const url = buildStoryUrl('http://localhost:6006/', 'my-story--default');

    expect(url).toBe('http://localhost:6006/iframe.html?id=my-story--default&viewMode=story');
    expect(url).not.toContain('//iframe');
  });

  it('encodes special characters in globals values', () => {
    const url = buildStoryUrl(BASE_URL, 'test--story', {
      label: 'hello world',
    });

    const parsed = new URL(url);
    const globals = parsed.searchParams.get('globals');
    expect(globals).not.toBeNull();
    expect(globals).toContain('hello world');
  });

  it('separates multiple globals with semicolons', () => {
    const url = buildStoryUrl(BASE_URL, 'test--story', {
      brand: 'qantas',
      theme: 'light',
    });

    const parsed = new URL(url);
    const globals = parsed.searchParams.get('globals');
    expect(globals).toContain(';');
    expect(globals).toContain('brand:qantas');
    expect(globals).toContain('theme:light');
  });
});

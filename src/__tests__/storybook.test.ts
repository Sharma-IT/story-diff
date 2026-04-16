import { describe, it, expect } from 'vitest';

import { buildStoryUrl } from '../storybook.js';

describe('buildStoryUrl', () => {
  const BASE_URL = 'http://localhost:6006';

  // Requirement: Build an iframe URL for a given story ID
  // Case: happy-path
  // Invariant: URL must point to /iframe.html with the story ID as the id parameter
  it('builds a basic iframe URL for a story ID', () => {
    // Arrange & Act
    const url = buildStoryUrl(BASE_URL, 'components-button--primary');

    // Assert
    expect(url).toBe(
      'http://localhost:6006/iframe.html?id=components-button--primary&viewMode=story',
    );
  });

  // Requirement: Append globals as URL parameters
  // Case: happy-path
  // Invariant: globals must be encoded and appended as &globals=key:value;key2:value2
  it('appends globals as URL parameters', () => {
    // Arrange & Act
    const url = buildStoryUrl(BASE_URL, 'components-button--primary', {
      theme: 'dark',
      locale: 'en-AU',
    });

    // Assert
    const parsed = new URL(url);
    const globals = parsed.searchParams.get('globals');
    expect(globals).not.toBeNull();
    expect(globals).toContain('theme:dark');
    expect(globals).toContain('locale:en-AU');
  });

  // Requirement: Handle empty globals gracefully
  // Case: boundary
  // Invariant: URL must not contain &globals= when globals is empty
  it('omits globals parameter when globals is empty', () => {
    // Arrange & Act
    const url = buildStoryUrl(BASE_URL, 'my-story--default', {});

    // Assert
    expect(url).not.toContain('&globals=');
  });

  // Requirement: Handle storybookUrl with trailing slash
  // Case: boundary
  // Invariant: no double slashes in the URL
  it('handles storybookUrl with trailing slash', () => {
    // Arrange & Act
    const url = buildStoryUrl('http://localhost:6006/', 'my-story--default');

    // Assert
    expect(url).toBe('http://localhost:6006/iframe.html?id=my-story--default&viewMode=story');
    expect(url).not.toContain('//iframe');
  });

  // Requirement: Handle special characters in globals values
  // Case: boundary
  // Invariant: special characters must be properly encoded
  it('encodes special characters in globals values', () => {
    // Arrange & Act
    const url = buildStoryUrl(BASE_URL, 'test--story', {
      label: 'hello world',
    });

    // Assert
    const parsed = new URL(url);
    const globals = parsed.searchParams.get('globals');
    expect(globals).not.toBeNull();
    expect(globals).toContain('hello world');
  });

  // Requirement: Multiple globals should be semicolon-separated
  // Case: happy-path
  // Invariant: globals format must be key1:value1;key2:value2
  it('separates multiple globals with semicolons', () => {
    // Arrange & Act
    const url = buildStoryUrl(BASE_URL, 'test--story', {
      brand: 'qantas',
      theme: 'light',
    });

    // Assert
    const parsed = new URL(url);
    const globals = parsed.searchParams.get('globals');
    expect(globals).toContain(';');
    expect(globals).toContain('brand:qantas');
    expect(globals).toContain('theme:light');
  });
});

import { findMatchingSiteImage } from '../src/services/photoshoot.service';

// Focused unit test for the keyword-overlap matcher behind "prefer a real
// site image over generating one" (see photoshoot.service.ts's
// generateBrandQaApprovedImage) - no DB/API calls, pure function.
describe('findMatchingSiteImage', () => {
  const siteImages = [
    { url: 'https://example.com/leather-wallet-hero.jpg', alt: 'Brown leather wallet on wooden table' },
    { url: 'https://example.com/team-photo.jpg', alt: 'Our team at the annual retreat' },
    { url: 'https://example.com/icon-check.png', alt: '' },
  ];

  it('matches a scene that shares enough significant words with an alt text', () => {
    const match = findMatchingSiteImage('a leather wallet on a table', siteImages);
    expect(match?.url).toBe('https://example.com/leather-wallet-hero.jpg');
  });

  it('does not match on a single generic shared word alone', () => {
    // Only "our"/"team" overlap loosely with a totally unrelated request -
    // requires 2+ shared significant words for a 4+-word alt text.
    const match = findMatchingSiteImage('a rocket launching into space', siteImages);
    expect(match).toBeNull();
  });

  it('returns null when there are no site images at all', () => {
    expect(findMatchingSiteImage('anything', undefined)).toBeNull();
    expect(findMatchingSiteImage('anything', [])).toBeNull();
  });

  it('skips images with empty alt text - never matches on nothing', () => {
    const match = findMatchingSiteImage('check icon checkmark', siteImages);
    expect(match).toBeNull();
  });
});

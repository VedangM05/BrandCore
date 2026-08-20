"""
Focused unit tests for crawl_agent.py's sitemap discovery/parsing logic -
the parser is the non-trivial piece here (namespace-agnostic XML, one level
of sitemap-index following), not the network call itself.

Run: .venv/bin/python -m unittest tests.test_crawl_agent -v
(from the repo root, with the crawl agent's venv active - see HANDOFF's
"How to run things" for the venv setup this depends on)
"""
import sys
import os
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'services'))
import crawl_agent  # noqa: E402


SITEMAP_INDEX_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
 <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
 <sitemap><loc>https://example.com/sitemap-images.xml</loc></sitemap>
</sitemapindex>
"""

URLSET_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
 <url><loc>https://example.com/about</loc></url>
 <url><loc>https://example.com/pricing</loc></url>
 <url><loc>https://other-domain.com/should-be-filtered</loc></url>
</urlset>
"""

# Real, found live: basecamp.com/sitemap.xml uses relative <loc> values
# (technically non-compliant with the sitemap protocol, which requires
# absolute URLs, but real sites do it anyway) - <loc>/about</loc>, not
# <loc>https://basecamp.com/about</loc>.
RELATIVE_URLSET_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
 <url><loc>/about</loc></url>
 <url><loc>/pricing</loc></url>
</urlset>
"""


def _mock_response(body: bytes):
    cm = MagicMock()
    cm.read.return_value = body
    ctx = MagicMock()
    ctx.__enter__.return_value = cm
    ctx.__exit__.return_value = False
    return ctx


class TestSitemapParsing(unittest.TestCase):
    def test_parses_a_plain_urlset_and_filters_other_domains(self):
        with patch('urllib.request.urlopen', return_value=_mock_response(URLSET_XML)):
            urls = crawl_agent._fetch_sitemap_urls('https://example.com/sitemap.xml', 'example.com')
        self.assertEqual(urls, ['https://example.com/about', 'https://example.com/pricing'])

    def test_follows_one_level_of_sitemap_index(self):
        responses = [_mock_response(SITEMAP_INDEX_XML), _mock_response(URLSET_XML)]
        with patch('urllib.request.urlopen', side_effect=responses):
            urls = crawl_agent._fetch_sitemap_urls('https://example.com/sitemap.xml', 'example.com')
        self.assertEqual(urls, ['https://example.com/about', 'https://example.com/pricing'])

    def test_resolves_relative_loc_urls_against_the_sitemap_url(self):
        with patch('urllib.request.urlopen', return_value=_mock_response(RELATIVE_URLSET_XML)):
            urls = crawl_agent._fetch_sitemap_urls('https://example.com/sitemap.xml', 'example.com')
        self.assertEqual(urls, ['https://example.com/about', 'https://example.com/pricing'])

    def test_returns_empty_list_on_fetch_failure_not_an_exception(self):
        with patch('urllib.request.urlopen', side_effect=OSError('boom')):
            urls = crawl_agent._fetch_sitemap_urls('https://example.com/sitemap.xml', 'example.com')
        self.assertEqual(urls, [])

    def test_returns_empty_list_on_malformed_xml(self):
        with patch('urllib.request.urlopen', return_value=_mock_response(b'not xml at all')):
            urls = crawl_agent._fetch_sitemap_urls('https://example.com/sitemap.xml', 'example.com')
        self.assertEqual(urls, [])


class TestOklchColorExtraction(unittest.TestCase):
    """
    Found live against basecamp.com: its entire CSS palette is defined as
    OKLCH custom properties (`--oklch-blue: 0.5687 0.1602 254.08;`), zero
    hex/rgb() literals anywhere - the hex/rgb-only version of this scanner
    returned the same 4 near-white pixels for every color, sourced from a
    logo image fallback rather than the real palette.
    """

    def test_converts_a_real_oklch_function_call(self):
        # oklch(53% 0.2 25) is a saturated red-orange - just checking it's
        # a real, distinct, plausible color, not asserting an exact hex
        # value (the conversion math already has its own dedicated test).
        css = 'a { color: oklch(53% 0.2 25); }'
        colors = crawl_agent.extract_colors_from_css(css)
        self.assertEqual(len(colors), 1)
        r, g, b = crawl_agent._hex_to_rgb(colors[0])
        self.assertGreater(r, g)  # a red/orange hue should have R as the dominant channel

    def test_converts_basecamps_real_custom_property_pattern(self):
        css = """
        :root {
          --oklch-blue: 0.5687 0.1602 254.08;
          --oklch-green: 0.5506 0.1301 154.06;
          --oklch-orange: 0.6743 0.2158 34.28;
          --oklch-ink-4: 0.3209 0.0204 233.83;
        }
        """
        colors = crawl_agent.extract_colors_from_css(css)
        self.assertGreaterEqual(len(colors), 3)
        # Real, previously-observed regression: the old hex/rgb-only scanner
        # found zero colors here and silently fell back to a generic palette.
        self.assertNotEqual(colors, [])

    def test_oklch_conversion_matches_known_reference_values(self):
        # oklch(1 0 0) is pure white, oklch(0 0 0) is pure black - the two
        # values every OKLCH implementation must get exactly right.
        self.assertEqual(crawl_agent._oklch_to_rgb(1.0, 0.0, 0.0), (255, 255, 255))
        self.assertEqual(crawl_agent._oklch_to_rgb(0.0, 0.0, 0.0), (0, 0, 0))


class TestDiscoverPagesToCrawl(unittest.TestCase):
    def test_falls_back_to_internal_links_when_sitemap_unavailable(self):
        internal_links = [
            'https://example.com/products',
            'https://example.com/products',  # duplicate - should be deduped
            'https://example.com/',  # the base URL itself - should be excluded
            'https://external.com/page',  # different domain - should be excluded
        ]
        with patch('crawl_agent._fetch_sitemap_urls', return_value=[]):
            pages = crawl_agent.discover_pages_to_crawl('https://example.com/', internal_links, limit=6)
        self.assertEqual(pages, ['https://example.com/products'])

    def test_caps_at_the_given_limit(self):
        internal_links = [f'https://example.com/page-{i}' for i in range(20)]
        with patch('crawl_agent._fetch_sitemap_urls', return_value=[]):
            pages = crawl_agent.discover_pages_to_crawl('https://example.com/', internal_links, limit=3)
        self.assertEqual(len(pages), 3)


if __name__ == '__main__':
    unittest.main()

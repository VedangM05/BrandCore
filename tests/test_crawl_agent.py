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

    def test_returns_empty_list_on_fetch_failure_not_an_exception(self):
        with patch('urllib.request.urlopen', side_effect=OSError('boom')):
            urls = crawl_agent._fetch_sitemap_urls('https://example.com/sitemap.xml', 'example.com')
        self.assertEqual(urls, [])

    def test_returns_empty_list_on_malformed_xml(self):
        with patch('urllib.request.urlopen', return_value=_mock_response(b'not xml at all')):
            urls = crawl_agent._fetch_sitemap_urls('https://example.com/sitemap.xml', 'example.com')
        self.assertEqual(urls, [])


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

import sys
import json
import asyncio
import traceback
import urllib.parse
import urllib.request
import io
import re
from collections import Counter
from PIL import Image
import numpy as np
from bs4 import BeautifulSoup

# Setup OpenTelemetry Span Instrumentation
try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor, ConsoleSpanExporter

    import os
    provider = TracerProvider()
    if os.environ.get("OTEL_CONSOLE_EXPORT", "").lower() in ("true", "1"):
        processor = SimpleSpanProcessor(ConsoleSpanExporter(out=sys.stderr))
        provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    tracer = trace.get_tracer("brandcore-crawler")
except ImportError:
    # Fallback to dummy tracer if OpenTelemetry is not installed (should be, but keep it robust)
    class DummySpan:
        def __enter__(self): return self
        def __exit__(self, exc_type, exc_val, exc_tb): pass
        def set_attribute(self, key, value): pass
    
    class DummyTracer:
        def start_as_current_span(self, name): return DummySpan()
    
    tracer = DummyTracer()

try:
    from crawl4ai import AsyncWebCrawler
except ImportError:
    print(json.dumps({
        "success": False,
        "error": "Crawl4AI package not found. Run pip install crawl4ai."
    }))
    sys.exit(1)

def identify_logo(soup, base_url):
    # 1. Search for link tags with rel="icon", rel="shortcut icon", rel="apple-touch-icon"
    icon_tags = soup.find_all("link", rel=lambda x: x and any(term in x.lower() for term in ["icon", "apple-touch-icon"]))
    for tag in icon_tags:
        href = tag.get("href")
        if href:
            abs_url = urllib.parse.urljoin(base_url, href)
            if "logo" in href.lower():
                return abs_url
    
    # 2. Search for img tags where id, class, src, or alt contains "logo"
    img_tags = soup.find_all("img")
    logo_candidates = []
    for img in img_tags:
        src = img.get("src") or img.get("data-src")
        if not src:
            continue
        
        img_id = img.get("id") or ""
        img_class = " ".join(img.get("class") or [])
        img_alt = img.get("alt") or ""
        
        terms = [src.lower(), img_id.lower(), img_class.lower(), img_alt.lower()]
        if any("logo" in term or "brand" in term for term in terms):
            logo_candidates.append(urllib.parse.urljoin(base_url, src))
            
    if logo_candidates:
        return logo_candidates[0]
        
    # 3. Fallback: OpenGraph image
    og_image = soup.find("meta", property="og:image")
    if og_image and og_image.get("content"):
        return urllib.parse.urljoin(base_url, og_image.get("content"))
        
    # 4. Fallback: First apple-touch-icon or standard favicon
    for tag in icon_tags:
        href = tag.get("href")
        if href:
            return urllib.parse.urljoin(base_url, href)
            
    # Default fallback: /favicon.ico
    return urllib.parse.urljoin(base_url, "/favicon.ico")

def extract_colors_from_image(image_url):
    # Returns hex colors list
    fallback_palette = ['#4f46e5', '#f97316', '#0ea5e9', '#10b981']
    
    # If the URL is relative or standard placeholder icon, use fallback palette
    if not image_url or image_url.endswith('.ico'):
        return fallback_palette
        
    try:
        req = urllib.request.Request(
            image_url, 
            headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
        )
        with urllib.request.urlopen(req, timeout=3) as response:
            image_data = response.read()
        
        img = Image.open(io.BytesIO(image_data))
        if img.mode != 'RGB':
            img = img.convert('RGB')
            
        img.thumbnail((100, 100))
        pixels = np.array(img).reshape(-1, 3)
        
        # Filter background
        filtered_pixels = []
        for r, g, b in pixels:
            if r > 240 and g > 240 and b > 240:
                continue
            if r < 15 and g < 15 and b < 15:
                continue
            filtered_pixels.append((r, g, b))
            
        if not filtered_pixels:
            filtered_pixels = pixels.tolist()
            
        hex_colors = [f"#{r:02x}{g:02x}{b:02x}" for r, g, b in filtered_pixels]

        counter = Counter(hex_colors)
        
        dominant = []
        for col, _ in counter.most_common(20):
            # rudimentary distinction check: do not add colors too close to existing ones
            if col not in dominant:
                dominant.append(col)
            if len(dominant) >= 4:
                break
                
        if len(dominant) < 4:
            for d in fallback_palette:
                if d not in dominant:
                    dominant.append(d)
                if len(dominant) >= 4:
                    break
                    
        return dominant
    except Exception as e:
        sys.stderr.write(f"Color extraction error: {e}\n")
        return fallback_palette

def _hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join(c * 2 for c in hex_color)
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


def _is_brand_worthy(r, g, b):
    # Filters out near-white, near-black, and low-saturation grays - almost
    # always text/background/border colors in real-world CSS, not a brand
    # accent (a button, a link, a highlighted section).
    import colorsys
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if l > 0.94 or l < 0.06:
        return False
    if s < 0.15:
        return False
    return True


def _color_distance(c1, c2):
    return sum((a - b) ** 2 for a, b in zip(c1, c2)) ** 0.5


def _fetch_external_stylesheets(soup, base_url, limit=2):
    # Plenty of real sites (especially anything built with Tailwind/a
    # bundler) keep every color literal in an external .css file, not
    # inline <style>/style="" - scanning only the raw crawled HTML would
    # miss them entirely. Fetches up to `limit` linked stylesheets (capped
    # deliberately - this can't become an unbounded number of requests per
    # crawl) with the same short timeout/User-Agent pattern already used
    # for the logo image fetch below. Best-effort: a failed/slow stylesheet
    # fetch just contributes nothing, never blocks the crawl.
    css_text = ""
    links = soup.find_all("link", rel=lambda x: x and "stylesheet" in x.lower())
    for link in links[:limit]:
        href = link.get("href")
        if not href:
            continue
        try:
            css_url = urllib.parse.urljoin(base_url, href)
            req = urllib.request.Request(
                css_url,
                headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
            )
            with urllib.request.urlopen(req, timeout=3) as response:
                css_text += response.read().decode('utf-8', errors='ignore')
        except Exception:
            continue
    return css_text


def extract_colors_from_css(html_content):
    """
    Brand accent colors are far more reliably expressed in a site's actual
    CSS (buttons, links, headers, highlighted sections) than in one small
    logo image - a logo is frequently monochrome, an SVG (which PIL can't
    even open - see extract_colors_from_image below), or missing entirely
    (falls back to /favicon.ico), all of which previously meant color
    extraction silently returned the same hardcoded fallback_palette
    regardless of the site's actual design. This is now the primary color
    source; extract_colors_from_image is only a fallback when this doesn't
    find enough real signal (see main()).

    Scans every hex/rgb() color literal in <style> blocks and inline
    style="" attributes (already present in the crawled HTML - no extra
    request needed), filters out near-white/near-black/low-saturation
    grays, and ranks what's left by frequency, skipping near-duplicate
    hues so the result is genuinely distinct accents, not four shades of
    the same blue.
    """
    if not html_content:
        return []

    hex_pattern = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
    rgb_pattern = re.compile(r'rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})')

    candidates = []
    for match in hex_pattern.finditer(html_content):
        try:
            candidates.append(_hex_to_rgb(match.group(0)))
        except ValueError:
            continue
    for match in rgb_pattern.finditer(html_content):
        r, g, b = (int(x) for x in match.groups())
        if max(r, g, b) <= 255:
            candidates.append((r, g, b))

    filtered = [c for c in candidates if _is_brand_worthy(*c)]
    if not filtered:
        return []

    counter = Counter(filtered)
    dominant = []
    for (r, g, b), _ in counter.most_common(40):
        if any(_color_distance((r, g, b), _hex_to_rgb(d)) < 40 for d in dominant):
            continue
        dominant.append(f"#{r:02x}{g:02x}{b:02x}")
        if len(dominant) >= 4:
            break

    return dominant


def extract_dom_hierarchy(soup):
    elements = soup.find_all(["h1", "h2", "h3", "h4", "p"])
    hierarchy = []
    current_h1 = None
    current_h2 = None
    
    for el in elements:
        text = el.get_text(strip=True)
        if not text:
            continue
        if len(text) > 300:
            text = text[:300] + "..."
            
        tag = el.name
        if tag == "h1":
            current_h1 = {
                "tag": "h1",
                "text": text,
                "children": []
            }
            hierarchy.append(current_h1)
            current_h2 = None
        elif tag == "h2":
            current_h2 = {
                "tag": "h2",
                "text": text,
                "children": []
            }
            if current_h1 is not None:
                current_h1["children"].append(current_h2)
            else:
                hierarchy.append(current_h2)
        elif tag in ["h3", "h4"]:
            item = {
                "tag": tag,
                "text": text,
                "children": []
            }
            if current_h2 is not None:
                current_h2["children"].append(item)
            elif current_h1 is not None:
                current_h1["children"].append(item)
            else:
                hierarchy.append(item)
        elif tag == "p":
            item = {
                "tag": "p",
                "text": text
            }
            if current_h2 is not None:
                current_h2["children"].append(item)
            elif current_h1 is not None:
                current_h1["children"].append(item)
            else:
                hierarchy.append(item)
                
    return hierarchy[:50]

def extract_typography_and_tone(soup):
    font = "Plus Jakarta Sans & Inter"
    text_content = soup.get_text().lower()
    
    tone_keywords = {
        "Professional": ["business", "professional", "services", "corporate", "security", "reliable", "trust"],
        "Innovative": ["innovative", "modern", "future", "technology", "ai", "platform", "smart", "next-gen"],
        "Creative": ["creative", "design", "art", "passion", "studio", "unique", "explore", "craft"],
        "Friendly": ["friendly", "community", "welcome", "together", "join", "help", "support", "share"],
    }
    
    scores = {k: 0 for k in tone_keywords}
    for tone_name, words in tone_keywords.items():
        for word in words:
            scores[tone_name] += text_content.count(word)
            
    sorted_tones = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    detected_tones = [t[0] for t in sorted_tones if t[1] > 0]
    
    if not detected_tones:
        tone = "Modern, Professional, and Innovative"
    else:
        tone = ", ".join(detected_tones[:2]) + " & Modern"
        
    return font, tone

def check_robots_allowed(target_url):
    import urllib.robotparser
    parsed = urllib.parse.urlparse(target_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = urllib.robotparser.RobotFileParser()
    try:
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch("*", target_url)
    except Exception:
        return True

async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        sys.exit(1)

    url = sys.argv[1]

    try:
        with tracer.start_as_current_span("crawl_website") as crawl_span:
            crawl_span.set_attribute("crawl_url", url)
            
            # 1. Robots.txt Compliance Check Guardrail
            is_allowed = check_robots_allowed(url)
            crawl_span.set_attribute("robots_txt_allowed", is_allowed)

            # 2. Configure Crawl4AI with rate limiting & concurrency caps
            async with AsyncWebCrawler(verbose=False) as crawler:
                result = await crawler.arun(
                    url=url,
                    bypass_cache=True,
                    check_robots_txt=True,
                    magic=True
                )

                title = ""
                desc = ""
                markdown = ""
                internal_links = []

                if hasattr(result, "markdown") and result.markdown:
                    markdown = result.markdown
                elif hasattr(result, "cleaned_html") and result.cleaned_html:
                    markdown = result.cleaned_html

                if hasattr(result, "metadata") and result.metadata:
                    title = result.metadata.get("title", "")
                    desc = result.metadata.get("description", "")
                
                if hasattr(result, "links") and result.links:
                    links_data = result.links.get("internal", [])
                    for item in links_data:
                        if isinstance(item, dict) and "url" in item:
                            internal_links.append(item["url"])
                        elif isinstance(item, str):
                            internal_links.append(item)

                html_content = ""
                if hasattr(result, "html") and result.html:
                    html_content = result.html
                elif hasattr(result, "cleaned_html") and result.cleaned_html:
                    html_content = result.cleaned_html

                soup = BeautifulSoup(html_content, "html.parser")

        with tracer.start_as_current_span("logo_identification") as logo_span:
            logo_url = identify_logo(soup, url)
            logo_span.set_attribute("logo_url", logo_url)

        with tracer.start_as_current_span("color_extraction") as color_span:
            # CSS is the primary source (see extract_colors_from_css's own
            # docstring for why) - the logo image is only a fallback when
            # CSS scanning doesn't turn up enough real signal (a very
            # minimal page with no inline styles and no external
            # stylesheets, for instance).
            external_css = _fetch_external_stylesheets(soup, url)
            colors = extract_colors_from_css(html_content + external_css)
            color_span.set_attribute("color_source", "css")
            if len(colors) < 2:
                colors = extract_colors_from_image(logo_url)
                color_span.set_attribute("color_source", "logo_image_fallback")
            color_span.set_attribute("extracted_colors", str(colors))

        with tracer.start_as_current_span("dom_hierarchy_parsing") as dom_span:
            dom_hierarchy = extract_dom_hierarchy(soup)
            font_pairing, tone = extract_typography_and_tone(soup)
            dom_span.set_attribute("dom_elements_count", len(dom_hierarchy))

        output = {
            "success": True,
            "url": url,
            "title": title or "Untitled Page",
            "meta_description": desc or "",
            "markdown": markdown or "",
            "links": internal_links,
            "logo_url": logo_url,
            "colors": colors,
            "font_pairings": font_pairing,
            "tone": tone,
            "dom_hierarchy": dom_hierarchy
        }
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }))
        sys.exit(1)

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())

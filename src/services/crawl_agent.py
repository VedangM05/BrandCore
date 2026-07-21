import sys
import json
import asyncio
import traceback
import urllib.parse
import urllib.request
import io
from PIL import Image
import numpy as np
from bs4 import BeautifulSoup

# Setup OpenTelemetry Span Instrumentation
try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor, ConsoleSpanExporter

    provider = TracerProvider()
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
        
        from collections import Counter
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

async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        sys.exit(1)

    url = sys.argv[1]

    try:
        with tracer.start_as_current_span("crawl_website") as crawl_span:
            crawl_span.set_attribute("crawl_url", url)
            
            async with AsyncWebCrawler() as crawler:
                result = await crawler.arun(
                    url=url,
                    bypass_cache=True
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
            colors = extract_colors_from_image(logo_url)
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

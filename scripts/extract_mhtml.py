#!/usr/bin/env python3
"""
Extract structured post metadata and local images from a browser-saved Instagram .mhtml file.

Usage:
  python scripts/extract_mhtml.py <mhtml_path> <member_id> [--first-only] [--dry-run]
"""

import argparse
import email
import html as html_lib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from email import policy
from pathlib import Path
from urllib.parse import urlparse

sys.stdout.reconfigure(encoding='utf-8')

TZ_KST = timezone(timedelta(hours=9))
TZ_TPE = timezone(timedelta(hours=8))

AVATAR_PATTERNS = (
    't51.82787-19',
    't51.2885-19',
    's150x150',
    's240x240',
    'static.cdninstagram.com',
)

EXT_MAP = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
}


def strip_html_text(raw_html: str) -> str:
    text = re.sub(r'<br\s*/?>', '\n', raw_html, flags=re.I)
    text = re.sub(r'</p>\s*<p[^>]*>', '\n\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = html_lib.unescape(text)
    lines = [line.rstrip() for line in text.splitlines()]
    return '\n'.join(lines).strip()


def extract_post_scope(full_html: str) -> str:
    """Narrow HTML to the active post modal (role=dialog) or <article>."""
    h1_pos = full_html.find('<h1')
    search_end = h1_pos if h1_pos != -1 else len(full_html)

    article_pos = full_html.rfind('<article', 0, search_end)
    dialog_pos = full_html.rfind('role="dialog"', 0, search_end)
    start = max(article_pos, dialog_pos)
    if start == -1:
        start = max(0, search_end - 60000)

    end = len(full_html)
    anchor = h1_pos if h1_pos != -1 else start
    for marker in ('</article>', '更多來自', 'More posts from'):
        idx = full_html.find(marker, anchor)
        if idx != -1 and idx < end:
            end = idx
    return full_html[start:end]


def is_post_image(url: str, content_type: str, size: int) -> bool:
    if not content_type.startswith('image/'):
        return False
    if size < 15_000:
        return False
    if any(pat in url for pat in AVATAR_PATTERNS):
        return False
    return True


def parse_mhtml(mhtml_path: Path, member_id: str, first_only: bool, dry_run: bool) -> dict:
    with mhtml_path.open('rb') as f:
        msg = email.message_from_binary_file(f, policy=policy.default)

    snapshot_url = msg.get('Snapshot-Content-Location', '').strip()
    parsed_url = urlparse(snapshot_url)
    clean_url = f'{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}' if parsed_url.scheme else ''

    code_match = re.search(r'/(p|reel)/([A-Za-z0-9_-]+)/?', clean_url)
    url_kind = code_match.group(1) if code_match else 'p'
    post_code = code_match.group(2) if code_match else mhtml_path.stem

    main_html = ''
    image_parts = {}
    for part in msg.walk():
        ct = part.get_content_type()
        loc = part.get('Content-Location', '').strip()
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        if ct == 'text/html' and not main_html:
            main_html = payload.decode('utf-8', errors='replace')
        elif ct.startswith('image/') and loc:
            image_parts[loc] = (ct, payload)

    scope_html = extract_post_scope(main_html)

    # Extract caption from <h1>
    h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', scope_html, flags=re.S | re.I)
    original_text = strip_html_text(h1_match.group(1)) if h1_match else ''

    # Extract timestamp (first <time> inside post scope)
    time_match = re.search(r'<time[^>]*datetime="([^"]+)"', scope_html)
    timestamp_utc = time_match.group(1) if time_match else ''
    post_date = ''
    if timestamp_utc:
        dt = datetime.fromisoformat(timestamp_utc.replace('Z', '+00:00'))
        post_date = dt.astimezone(TZ_TPE).strftime('%Y-%m-%d')

    # Extract ordered unique post images inside post scope
    seen_urls = set()
    matched_images = []
    for m in re.finditer(r'<img\b[^>]*\bsrc="([^"]+)"[^>]*>', scope_html):
        url = html_lib.unescape(m.group(1))
        if url in seen_urls or url not in image_parts:
            continue
        ct, payload = image_parts[url]
        if is_post_image(url, ct, len(payload)):
            seen_urls.add(url)
            matched_images.append((url, ct, payload))

    # Fallback for Reels/Video posts: grab thumbnail from the profile grid link matching post_code
    if not matched_images and post_code:
        link_pat = re.compile(rf'href="[^"]*/(?:p|reel)/{re.escape(post_code)}/?"')
        for lm in link_pat.finditer(main_html):
            chunk = main_html[lm.start() : lm.start() + 4000]
            for im in re.finditer(r'<img\b[^>]*\bsrc="([^"]+)"[^>]*>', chunk):
                url = html_lib.unescape(im.group(1))
                if url in seen_urls or url not in image_parts:
                    continue
                ct, payload = image_parts[url]
                if is_post_image(url, ct, len(payload)):
                    seen_urls.add(url)
                    matched_images.append((url, ct, payload))
                    break
            if matched_images:
                break

    if first_only and matched_images:
        matched_images = matched_images[:1]

    has_video = url_kind == 'reel' or '<video' in scope_html
    if has_video:
        media_type = 'video'
    elif len(matched_images) > 1 or 'img_index=' in snapshot_url:
        media_type = 'carousel'
    else:
        media_type = 'image'

    saved_paths = []
    out_dir = Path('assets') / 'images' / member_id
    if not dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    date_prefix = post_date or 'unknown-date'
    for idx, (_url, ct, payload) in enumerate(matched_images, start=1):
        ext = EXT_MAP.get(ct, 'jpg')
        filename = f'{date_prefix}_{post_code}_{idx:02d}.{ext}'
        rel_path = f'assets/images/{member_id}/{filename}'
        if not dry_run:
            (out_dir / filename).write_bytes(payload)
        saved_paths.append(rel_path)

    return {
        'id': f'{member_id}-{date_prefix}-{post_code}',
        'memberId': member_id,
        'date': post_date,
        'timestampUtc': timestamp_utc,
        'mediaType': media_type,
        'originalText': original_text,
        'images': saved_paths,
        'imageSizesKB': [len(p) // 1024 for _, _, p in matched_images],
        'postUrl': clean_url,
        'sourceFile': str(mhtml_path).replace('\\', '/'),
    }


def main():
    parser = argparse.ArgumentParser(description='Extract IG post data from MHTML.')
    parser.add_argument('mhtml_path', type=Path)
    parser.add_argument('member_id')
    parser.add_argument('--first-only', action='store_true', help='Save only the first image')
    parser.add_argument('--dry-run', action='store_true', help='Do not write image files')
    args = parser.parse_args()

    result = parse_mhtml(args.mhtml_path, args.member_id, args.first_only, args.dry_run)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Loop 3 pre-check tool for Music Player tracks.
Validates YouTube URL, embeddability, metadata (title, channel, publishDate),
and optional local cover image before committing to data/music.js.

Usage:
  python scripts/check_music.py <youtube_url> [--cover <path_to_cover>]
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
TZ_TPE = timezone(timedelta(hours=8))


def extract_video_id(url: str) -> str:
    s = url.strip()
    if re.fullmatch(r'[A-Za-z0-9_-]{11}', s):
        return s
    for pat in (
        r'[?&]v=([A-Za-z0-9_-]{11})',
        r'youtu\.be/([A-Za-z0-9_-]{11})',
        r'youtube\.com/(?:embed|shorts|live)/([A-Za-z0-9_-]{11})',
    ):
        m = re.search(pat, s)
        if m:
            return m.group(1)
    return ''


def main() -> None:
    parser = argparse.ArgumentParser(description='Validate YouTube track metadata & embeddability (Loop 3).')
    parser.add_argument('youtube_url')
    parser.add_argument('--cover', type=Path, default=None)
    args = parser.parse_args()

    vid = extract_video_id(args.youtube_url)
    if not vid:
        print(json.dumps({'ok': False, 'error': '無效的 YouTube 連結'}, ensure_ascii=False, indent=2))
        sys.exit(1)

    watch_url = f'https://www.youtube.com/watch?v={vid}'
    oembed_url = f'https://www.youtube.com/oembed?url={watch_url}&format=json'

    result = {
        'ok': True,
        'videoId': vid,
        'youtubeUrl': f'https://youtu.be/{vid}',
        'embeddable': True,
        'title': '',
        'author': '',
        'releaseDate': '',
        'coverCheck': None,
        'warnings': [],
    }

    try:
        with urllib.request.urlopen(oembed_url, timeout=15) as resp:
            oembed = json.loads(resp.read().decode('utf-8'))
        result['title'] = oembed.get('title', '')
        result['author'] = oembed.get('author_name', '')
    except urllib.error.HTTPError as exc:
        result['embeddable'] = False
        result['ok'] = False
        result['warnings'].append(f'YouTube oEmbed 回傳 HTTP {exc.code}，此影片可能禁止外部嵌入，建議改用 YouTube Topic 音軌連結。')
    except Exception as exc:
        result['warnings'].append(f'無法查詢 oEmbed：{exc}')

    try:
        req = urllib.request.Request(watch_url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req, timeout=15).read().decode('utf-8', 'replace')
        dm = re.search(r'"(?:publishDate|uploadDate)":"([^"]+)"', html)
        if dm:
            raw_dt = dm.group(1)
            try:
                dt = datetime.fromisoformat(raw_dt.replace('Z', '+00:00'))
                result['releaseDate'] = dt.astimezone(TZ_TPE).strftime('%Y-%m-%d')
            except ValueError:
                result['releaseDate'] = raw_dt[:10]
        em = re.search(r'"playableInEmbed":(true|false)', html)
        if em and em.group(1) == 'false':
            result['embeddable'] = False
            result['ok'] = False
            result['warnings'].append('YouTube 標記 playableInEmbed=false（禁止外部嵌入），建議改用官方 Topic 音軌。')
    except Exception as exc:
        result['warnings'].append(f'無法抓取影片頁日期/嵌入旗標：{exc}')

    if args.cover:
        if args.cover.exists():
            result['coverCheck'] = {'exists': True, 'path': str(args.cover).replace('\\', '/'), 'sizeKB': args.cover.stat().st_size // 1024}
        else:
            result['coverCheck'] = {'exists': False, 'path': str(args.cover).replace('\\', '/')}
            result['ok'] = False
            result['warnings'].append(f'找不到封面圖：{args.cover}')

    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result['ok']:
        sys.exit(1)


if __name__ == '__main__':
    main()

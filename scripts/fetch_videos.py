#!/usr/bin/env python3
"""
Fetch the latest 5 long-form (non-Shorts) ITZY YouTube videos from @ITZY and
@JYPEntertainment using YouTube's official UULF (long-form uploads) RSS feeds,
identify participating members via Gemini multimodal video analysis (with
keyword fallback), and write data/videos.js.

Usage:
  python scripts/fetch_videos.py
"""

import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

TZ_TPE = timezone(timedelta(hours=8))
MAX_VIDEOS = 5
OUTPUT_PATH = Path('data/videos.js')

CHANNELS = [
    {
        'name': 'ITZY',
        'handle': '@ITZY',
        'playlist_id': 'UULFDhM2k2Cua-JdobAh5moMFg',
        'filter_itzy': False,
    },
    {
        'name': 'JYP Entertainment',
        'handle': '@JYPEntertainment',
        'playlist_id': 'UULFaO6TYtlC8U5ttz62hTrZgg',
        'filter_itzy': True,
    },
]

MEMBER_KEYWORDS = {
    'yeji': [r'\byeji\b', '예지', '禮志'],
    'lia': [r'\blia\b', '리아', '莉亞'],
    'ryujin': [r'\bryujin\b', '류진', '留真'],
    'chaeryeong': [r'\bchaeryeong\b', '채령', '彩領', 'chaeryeong_'],
    'yuna': [r'\byuna\b', '유나', '有娜'],
}

ITZY_FILTER_PATTERNS = [
    r'\bitzy\b',
    '있지',
    r'\byeji\b',
    '예지',
    r'\blia\b',
    '리아',
    r'\bryujin\b',
    '류진',
    r'\bchaeryeong\b',
    '채령',
    r'\byuna\b',
    '유나',
]

NS = {
    'atom': 'http://www.w3.org/2005/Atom',
    'yt': 'http://www.youtube.com/xml/schemas/2015',
    'media': 'http://search.yahoo.com/mrss/',
}


def matches_any(text: str, patterns: list[str]) -> bool:
    low = text.lower()
    for pat in patterns:
        if pat.startswith(r'\b'):
            if re.search(pat, low):
                return True
        elif pat.lower() in low:
            return True
    return False


def load_existing_videos() -> dict[str, dict]:
    if not OUTPUT_PATH.exists():
        return {}
    raw = OUTPUT_PATH.read_text(encoding='utf-8', errors='replace')
    m = re.search(r'window\.VIDEOS_DATA\s*=\s*(\{.*\})\s*;?\s*$', raw, flags=re.S)
    if not m:
        return {}
    try:
        data = json.loads(m.group(1))
        return {v['videoId']: v for v in data.get('videos', []) if v.get('videoId')}
    except json.JSONDecodeError:
        return {}


def fetch_channel_videos(ch: dict) -> list[dict]:
    url = f"https://www.youtube.com/feeds/videos.xml?playlist_id={ch['playlist_id']}"
    req = urllib.request.Request(url, headers={'User-Agent': 'ITZY-Diary-VideoSync/1.0'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        xml_bytes = resp.read()

    root = ET.fromstring(xml_bytes)
    results = []
    for entry in root.findall('atom:entry', NS):
        vid_el = entry.find('yt:videoId', NS)
        title_el = entry.find('atom:title', NS)
        pub_el = entry.find('atom:published', NS)
        link_el = entry.find('atom:link', NS)
        desc_el = entry.find('media:group/media:description', NS)

        if vid_el is None or title_el is None or pub_el is None:
            continue

        link = link_el.attrib.get('href', '') if link_el is not None else ''
        if '/shorts/' in link:
            continue

        title = (title_el.text or '').strip()
        desc = (desc_el.text or '').strip() if desc_el is not None else ''

        if ch['filter_itzy'] and not matches_any(title, ITZY_FILTER_PATTERNS):
            continue

        pub_raw = (pub_el.text or '').strip()
        dt = datetime.fromisoformat(pub_raw.replace('Z', '+00:00'))
        dt_tpe = dt.astimezone(TZ_TPE)

        results.append(
            {
                'videoId': vid_el.text.strip(),
                'title': title,
                'description': desc,
                'channelName': ch['name'],
                'channelHandle': ch['handle'],
                'publishedAt': dt_tpe.strftime('%Y-%m-%d %H:%M'),
                'publishedDate': dt_tpe.strftime('%Y-%m-%d'),
                'publishedIso': dt.astimezone(timezone.utc).isoformat(),
                'url': f'https://www.youtube.com/watch?v={vid_el.text.strip()}',
            }
        )
    return results


def infer_members_by_keywords(title: str, description: str) -> list[str]:
    found = [mid for mid, pats in MEMBER_KEYWORDS.items() if matches_any(title, pats)]
    if found:
        return ['itzy'] if len(found) == 5 else found
    if matches_any(title, [r'\bitzy\b', '있지']):
        return ['itzy']
    snippet = description[:300]
    found = [mid for mid, pats in MEMBER_KEYWORDS.items() if matches_any(snippet, pats)]
    if not found or len(found) == 5:
        return ['itzy']
    return found


def identify_members_with_gemini(video: dict) -> tuple[list[str], str]:
    api_key = os.environ.get('GEMINI_API_KEY', '').strip()
    if not api_key:
        return infer_members_by_keywords(video['title'], video['description']), 'keyword'

    prompt = (
        '請觀看這支 ITZY 的 YouTube 影片，並結合標題與簡介，辨識出影片中實際參與出鏡的 ITZY 成員。\n'
        '可用成員 ID 僅限：yeji, lia, ryujin, chaeryeong, yuna。\n'
        '如果 5 位成員全數參與（全員團體影片），請回傳 ["itzy"]。\n'
        f"影片標題：{video['title']}\n"
        f"影片簡介前段：{video['description'][:500]}\n"
        '請只回傳純 JSON，格式：{"members": ["yeji", ...]}'
    )

    endpoint = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}'
    payload = json.dumps(
        {
            'contents': [
                {
                    'parts': [
                        {'fileData': {'mimeType': 'video/mp4', 'fileUri': video['url']}},
                        {'text': prompt},
                    ]
                }
            ],
            'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0.1},
        }
    ).encode('utf-8')

    req = urllib.request.Request(endpoint, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = json.loads(resp.read().decode('utf-8'))
        text = body['candidates'][0]['content']['parts'][0]['text'].strip()
        text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text, flags=re.S)
        parsed = json.loads(text)
        valid = {'itzy', 'yeji', 'lia', 'ryujin', 'chaeryeong', 'yuna'}
        members = [m.lower() for m in (parsed.get('members') or []) if isinstance(m, str) and m.lower() in valid]
        if not members:
            return infer_members_by_keywords(video['title'], video['description']), 'keyword'
        if 'itzy' in members or len(set(members)) >= 5:
            return ['itzy'], 'gemini-video'
        # Keep canonical member order
        order = ['yeji', 'lia', 'ryujin', 'chaeryeong', 'yuna']
        ordered = [m for m in order if m in members]
        return ordered, 'gemini-video'
    except Exception as exc:
        print(f"[WARN] Gemini 影片辨識失敗 ({video['videoId']}): {exc}", file=sys.stderr)
        return infer_members_by_keywords(video['title'], video['description']), 'keyword'


def main() -> None:
    existing = load_existing_videos()
    all_videos: dict[str, dict] = {}

    for ch in CHANNELS:
        try:
            for item in fetch_channel_videos(ch):
                all_videos[item['videoId']] = item
        except Exception as exc:
            print(f"[WARN] 無法抓取頻道 {ch['handle']}: {exc}", file=sys.stderr)

    latest = sorted(all_videos.values(), key=lambda x: x['publishedIso'], reverse=True)[:MAX_VIDEOS]

    final_videos = []
    for v in latest:
        prev = existing.get(v['videoId'])
        # Reuse cached member identification if already analyzed by Gemini or manually locked
        if prev and prev.get('members') and (prev.get('memberSource') in ('gemini-video', 'manual') or not os.environ.get('GEMINI_API_KEY')):
            members = prev['members']
            source = prev.get('memberSource', 'keyword')
        else:
            members, source = identify_members_with_gemini(v)

        final_videos.append(
            {
                'videoId': v['videoId'],
                'title': v['title'],
                'channelName': v['channelName'],
                'channelHandle': v['channelHandle'],
                'publishedAt': v['publishedAt'],
                'publishedDate': v['publishedDate'],
                'url': v['url'],
                'members': members,
                'memberSource': source,
            }
        )

    today = datetime.now(TZ_TPE).strftime('%Y-%m-%d %H:%M')
    payload = {
        'updatedAt': today,
        'videos': final_videos,
    }
    OUTPUT_PATH.write_text(
        'window.VIDEOS_DATA = ' + json.dumps(payload, ensure_ascii=False, indent=2) + ';\n',
        encoding='utf-8',
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

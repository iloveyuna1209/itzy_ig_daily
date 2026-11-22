#!/usr/bin/env python3
"""
Loop 4 Pre-Push Lint Gate for ITZY 的日常.
Checks:
  1. Valid JS syntax & structure for data/diary.js, data/music.js, data/videos.js
  2. No duplicate diary entry IDs or postUrls
  3. All referenced local images exist (no broken images) + orphan image warnings
  4. Consistency between data/diary.js and wiki/members/*.md + wiki/index.md
  5. Privacy guard: zero non-.gitkeep files under raw/ tracked by Git

Usage:
  python scripts/lint_project.py
"""

import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')


def load_window_var(js_path: str, var_name: str) -> dict:
    code = f"global.window = {{}}; require('./{js_path}'); console.log(JSON.stringify(window.{var_name} || null));"
    proc = subprocess.run(['node', '-e', code], capture_output=True, text=True, encoding='utf-8')
    if proc.returncode != 0:
        raise RuntimeError(f'{js_path} 解析失敗：{proc.stderr.strip()}')
    return json.loads(proc.stdout)


def main() -> None:
    errors: list[str] = []
    warnings: list[str] = []

    # 1. Load & validate data files
    try:
        diary = load_window_var('data/diary.js', 'DIARY_DATA')
    except Exception as exc:
        errors.append(str(exc))
        diary = {'members': [], 'entries': []}

    try:
        music = load_window_var('data/music.js', 'MUSIC_DATA')
    except Exception as exc:
        errors.append(str(exc))
        music = {'tracks': []}

    try:
        videos = load_window_var('data/videos.js', 'VIDEOS_DATA')
    except Exception as exc:
        errors.append(str(exc))
        videos = {'videos': []}

    entries = diary.get('entries', [])
    members = diary.get('members', [])
    member_ids = {m['id'] for m in members}

    # 2. Check duplicate IDs / postUrls & broken diary images
    seen_ids: set[str] = set()
    seen_urls: set[str] = set()
    referenced_images: set[str] = set()
    member_counts = {mid: 0 for mid in member_ids}

    for entry in entries:
        eid = entry.get('id', '')
        mid = entry.get('memberId', '')
        url = entry.get('postUrl', '')

        if eid in seen_ids:
            errors.append(f'data/diary.js 出現重複 id：{eid}')
        seen_ids.add(eid)

        if url:
            if url in seen_urls:
                errors.append(f'data/diary.js 出現重複 postUrl：{url}')
            seen_urls.add(url)

        if mid not in member_ids:
            errors.append(f'日記 {eid} 使用了未定義的 memberId：{mid}')
        else:
            member_counts[mid] += 1

        for img in entry.get('images', []):
            norm = img.replace('\\', '/')
            referenced_images.add(norm)
            if not Path(norm).exists():
                errors.append(f'日記 {eid} 斷圖：{norm}')

    # Check member cover images
    for m in members:
        cov = (m.get('coverImage') or '').strip()
        if cov and not Path(cov).exists():
            errors.append(f"成員 {m['id']} coverImage 斷圖：{cov}")

    # Check music cover images
    for track in music.get('tracks', []):
        cov = (track.get('coverImage') or '').strip()
        if cov and not Path(cov).exists():
            errors.append(f"歌曲 {track.get('id')} 封面斷圖：{cov}")

    # Check orphan images in assets/images/
    img_root = Path('assets/images')
    if img_root.exists():
        for p in img_root.rglob('*'):
            if p.is_file() and p.name != '.gitkeep':
                rel = str(p).replace('\\', '/')
                if rel not in referenced_images:
                    warnings.append(f'孤兒圖片（未被 diary.js 引用）：{rel}')

    # 3. Check wiki/members/*.md & wiki/index.md consistency
    for mid, count in member_counts.items():
        wpath = Path(f'wiki/members/{mid}.md')
        if not wpath.exists():
            errors.append(f'缺少成員 Wiki 檔：{wpath}')
            continue
        wtext = wpath.read_text(encoding='utf-8')
        pm = re.search(r'^postCount:\s*(\d+)', wtext, flags=re.M)
        if not pm:
            errors.append(f'{wpath} 缺少 postCount frontmatter')
        elif int(pm.group(1)) != count:
            errors.append(f'{wpath} postCount={pm.group(1)} 與 diary.js ({count}) 不一致')

    index_path = Path('wiki/index.md')
    if index_path.exists():
        itext = index_path.read_text(encoding='utf-8')
        tm = re.search(r'總貼文數：(\d+)', itext)
        if not tm:
            errors.append('wiki/index.md 缺少「總貼文數」標記')
        elif int(tm.group(1)) != len(entries):
            errors.append(f'wiki/index.md 總貼文數={tm.group(1)} 與 diary.js ({len(entries)}) 不一致')
    else:
        errors.append('缺少 wiki/index.md')

    # 4. Privacy guard: raw/ must not be tracked by Git
    proc = subprocess.run(['git', 'ls-files', 'raw'], capture_output=True, text=True, encoding='utf-8')
    tracked_raw = [line.strip() for line in proc.stdout.splitlines() if line.strip() and not line.strip().endswith('.gitkeep')]
    if tracked_raw:
        errors.append(f'隱私警告！raw/ 有檔案被 Git 追蹤：{tracked_raw}')

    summary = {
        'passed': len(errors) == 0,
        'stats': {
            'diaryEntries': len(entries),
            'musicTracks': len(music.get('tracks', [])),
            'recentVideos': len(videos.get('videos', [])),
            'referencedImages': len(referenced_images),
        },
        'errors': errors,
        'warnings': warnings,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if errors:
        sys.exit(1)


if __name__ == '__main__':
    main()

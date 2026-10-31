#!/usr/bin/env python3
"""Read-only UI release gate. Content updates must pass without changing the baseline."""
import hashlib
import json
import argparse
import tempfile
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def digest(value):
    if isinstance(value, str): value = value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.theme = None; self.links = []; self.blocks = []; self.active = None
        self.inline_styles = set(); self.navs = []; self.nav = None; self.nav_depth = 0
        self.icons = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'html': self.theme = a.get('data-emilia-theme')
        if tag == 'link' and a.get('rel') == 'stylesheet': self.links.append(a)
        if a.get('style'): self.inline_styles.add(a['style'])
        if tag == 'svg' and 'emilia-icon' in a.get('class','').split(): self.icons += 1
        if tag in ('style','script'):
            self.active = [tag, a, '']
        if tag == 'nav':
            if self.nav is None: self.nav = []
            self.nav_depth += 1
        if self.nav is not None: self.nav.append(self.get_starttag_text())
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in ('link','meta','img','input','br','hr'):self.handle_endtag(tag)
    def handle_data(self,data):
        if self.active is not None:self.active[2] += data
        if self.nav is not None:self.nav.append(data)
    def handle_entityref(self,name):self.handle_data('&'+name+';')
    def handle_charref(self,name):self.handle_data('&#'+name+';')
    def handle_endtag(self,tag):
        if self.active and tag == self.active[0]:
            kind,a,body=self.active
            if a.get('type') not in ('application/json','application/ld+json'):
                self.blocks.append([kind,a,digest(body)])
            self.active=None
        if self.nav is not None:
            self.nav.append('</'+tag+'>')
            if tag=='nav':
                self.nav_depth-=1
                if not self.nav_depth:self.navs.append(digest(''.join(self.nav)));self.nav=None

def describe(path):
    p=Page();p.feed(path.read_text(encoding='utf-8'))
    return dict(theme=p.theme,stylesheets=p.links,ui_blocks=p.blocks,navigation=p.navs,icons=p.icons,allowed_inline_styles=sorted(p.inline_styles))

def check(root=ROOT):
    errors=[]
    try: baseline=json.loads((root/'ui-baseline.json').read_text())
    except (OSError,ValueError) as exc:return ['UI baseline unavailable: '+str(exc)]
    for name,expected in baseline['files'].items():
        p=root/name
        if not p.is_file() or digest(p.read_bytes())!=expected:errors.append('Protected UI file changed/missing: '+name)
    for name,expected in baseline['pages'].items():
        try: actual=describe(root/name)
        except OSError: errors.append('Page missing: '+name);continue
        for key in ('theme','stylesheets','ui_blocks','navigation','icons'):
            if actual[key]!=expected[key]:errors.append(name+': UI contract changed ('+key+')')
        if not set(actual['allowed_inline_styles'])<=set(expected['allowed_inline_styles']):errors.append(name+': new inline styles require UI review')
        sheets=actual['stylesheets']
        if not sheets or sheets[-1].get('id')!='emilia-kraft-theme':errors.append(name+': Emilia theme must be the last stylesheet')
    return errors

def check_online(root=ROOT):
    baseline=json.loads((root/'ui-baseline.json').read_text())
    names=set(baseline['files']) | set(baseline['pages'])
    with tempfile.TemporaryDirectory() as temp:
        remote=Path(temp)
        (remote/'ui-baseline.json').write_text(json.dumps(baseline))
        def download(name):
            url=baseline['site'].rstrip('/')+'/'+urllib.parse.quote(name)+'?ui-check='+str(time.time_ns())
            try:
                with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Emilia-UI-check/1.0','Cache-Control':'no-cache'}),timeout=25) as response:
                    data=response.read()
                p=remote/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
            except Exception as exc:return name+': '+str(exc)
        with ThreadPoolExecutor(max_workers=4) as pool:failures=[e for e in pool.map(download,names) if e]
        return failures+check(remote)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--online',action='store_true',help='Also verify the deployed UI assets and page contracts.')
    args=parser.parse_args()
    errors=check()
    if not errors and args.online:errors=check_online()
    if errors:
        print('\n'.join(errors));print('STOP: do not publish or refresh the baseline during a content-only update.');raise SystemExit(2)
    print('PASS Emilia UI baseline: theme, styles, scripts, icons and navigation preserved.')

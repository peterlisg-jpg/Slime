import base64, json, re, subprocess, sys
from pathlib import Path
from PIL import Image

ROOT = Path('/workspace/limeland-demo')
BUILD = ROOT / 'build'
BUILD.mkdir(exist_ok=True)

def b64(path, mime):
    data = base64.b64encode(Path(path).read_bytes()).decode()
    return f'data:{mime};base64,{data}'

# 1) 压缩素材
bg = Image.open(ROOT / 'assets/glow_room.jpg').convert('RGB')
if bg.width > 1600:
    bg = bg.resize((1600, round(bg.height * 1600 / bg.width)), Image.LANCZOS)
bg.save(BUILD / 'bg.jpg', 'JPEG', quality=82, optimize=True)

for name in ['green', 'pink']:
    im = Image.open(ROOT / f'assets/{name}.png').convert('RGBA')
    if max(im.size) > 640:
        s = 640 / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(BUILD / f'{name}.png', 'PNG', optimize=True)

# 2) 替换素材路径 + 文件协议下的 localStorage 兜底
js = (ROOT / 'three-demo.js').read_text(encoding='utf-8')
js = js.replace("loadImage('assets/glow_room.jpg')", 'loadImage(window.__A.bg)')
js = js.replace("loadImage('assets/green.png')", 'loadImage(window.__A.green)')
js = js.replace("loadImage('assets/pink.png')", 'loadImage(window.__A.pink)')
js = js.replace(
    "const best = parseFloat(localStorage.getItem(BEST_KEY) || '0');",
    "const best = parseFloat((function(){try{return localStorage.getItem(BEST_KEY)}catch(e){return null}})() || '0');")
js = js.replace(
    "localStorage.setItem(BEST_KEY, String(elapsed));",
    "try{localStorage.setItem(BEST_KEY,String(elapsed))}catch(e){}")
(BUILD / 'demo.js').write_text(js, encoding='utf-8')

# 3) 打包成经典脚本（file:// 也能跑）
subprocess.run([
    'npx', '--yes', 'esbuild', str(BUILD / 'demo.js'),
    '--bundle', '--format=iife', '--minify',
    '--outfile=' + str(BUILD / 'bundle.js'),
    '--alias:three=' + str(ROOT / 'lib/three.module.js'),
    '--alias:three/addons=' + str(ROOT / 'lib/addons'),
], check=True)

bundle = (BUILD / 'bundle.js').read_text(encoding='utf-8')
bundle = bundle.replace('</script', '<\\/script')

# 4) 组装单文件
html = (ROOT / 'three.html').read_text(encoding='utf-8')

font = b64(ROOT / 'assets/fonts/zcool-ui.ttf', 'font/ttf')
html = html.replace('url("assets/fonts/zcool-ui.ttf") format("truetype")',
                    f'url("{font}") format("truetype")')

assets = {
    'bg': b64(BUILD / 'bg.jpg', 'image/jpeg'),
    'green': b64(BUILD / 'green.png', 'image/png'),
    'pink': b64(BUILD / 'pink.png', 'image/png'),
}
inject = (
    '<script>window.__A=' + json.dumps(assets) + ';</script>\n'
    '<script>\n' + bundle + '\n</script>'
)
html, n = re.subn(
    r'<script type="importmap">.*?</script>\s*<script type="module" src="three-demo.js"></script>',
    lambda m: inject, html, flags=re.S)
if n != 1:
    print('script block replace failed:', n)
    sys.exit(1)

out = ROOT / 'limeland-standalone.html'
out.write_text(html, encoding='utf-8')
print('built:', out)
print('size: %.1f MB' % (out.stat().st_size / 1048576))
print('bg jpg:', (BUILD / 'bg.jpg').stat().st_size // 1024, 'KB')

import base64, subprocess
from pathlib import Path

ROOT = Path('/workspace/limeland-demo')
BUILD = ROOT / 'build'
BUILD.mkdir(exist_ok=True)

subprocess.run([
    'npx', '--yes', 'esbuild', str(ROOT / 'look-3d.js'),
    '--bundle', '--format=iife', '--minify',
    '--outfile=' + str(BUILD / 'look.js'),
    '--alias:three=' + str(ROOT / 'lib/three.module.js'),
    '--alias:three/addons=' + str(ROOT / 'lib/addons'),
], check=True)

bundle = (BUILD / 'look.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
html = (ROOT / 'look-3d.html').read_text(encoding='utf-8')

font = base64.b64encode((ROOT / 'assets/fonts/zcool-ui.ttf').read_bytes()).decode()
html = html.replace('url("assets/fonts/zcool-ui.ttf") format("truetype")',
                    'url("data:font/ttf;base64,' + font + '") format("truetype")')
html = html.replace('<script type="module" src="look-3d.js"></script>',
                    '<script>\n' + bundle + '\n</script>')

out = ROOT / 'limeland-3d-look.html'
out.write_text(html, encoding='utf-8')
print('built:', out)
print('size: %.2f MB' % (out.stat().st_size / 1048576))

"""Create labeled review sheets and an audited single-file asset delivery."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageStat
import json, hashlib, shutil, zipfile
ROOT = Path('outputs/model-package')
NAMES = dict(A='Terrace Commons', B='Folded Horizon', C='Civic Dune', D='Lantern Spine')
REFERENCES = dict(A='datacenter_2.png', B='datacenter_5.png', C='datacenter_7.png', D='datacenter_8.png')
CROPS = dict(A=(.07,.265,.88,.53),B=(.07,.225,.88,.54),C=(.065,.215,.925,.55),D=(.055,.195,.89,.56))
LABELS = ['Hero · daylight', 'Reverse three-quarter', 'East elevation', 'West elevation', 'Aerial', 'Entrance & materials', 'Hero · dusk']
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
def font(size): return ImageFont.truetype(FONT,size)
def fit(im,size):
    im=im.convert('RGB');im.thumbnail(size,Image.Resampling.LANCZOS);out=Image.new('RGB',size,'#f3f2ed');out.paste(im,((size[0]-im.width)//2,(size[1]-im.height)//2));return out
(ROOT/'contact-sheets').mkdir(exist_ok=True)
(ROOT/'comparisons').mkdir(exist_ok=True)
(ROOT/'references').mkdir(exist_ok=True)
overview=Image.new('RGB',(1600,1120),'#f4f3ef');od=ImageDraw.Draw(overview);od.text((30,22),'PLACEFORM / FOUR CAMPUS STUDIES',font=font(30),fill='#253430');od.text((30,65),'Reference-authored geometry · metres · daylight studio presentation',font=font(19),fill='#59655e')
audit=[]
for n,(key,name) in enumerate(NAMES.items()):
    folder=ROOT/key;previews=sorted(p for p in folder.glob('0[1-7]-*.png'))
    assert len(previews)==7
    for p in previews: assert Image.open(p).size==(2560,1440)
    src=Path('public/assets/hackathon')/REFERENCES[key];shutil.copy2(src,ROOT/'references'/src.name)
    source=Image.open(src);x,y,w,h=CROPS[key];crop=source.crop((int(x*source.width),int(y*source.height),int((x+w)*source.width),int((y+h)*source.height)))
    sheet=Image.new('RGB',(2560,965),'#f4f3ef');sd=ImageDraw.Draw(sheet);sd.text((28,23),f'{key} / {name.upper()}',font=font(32),fill='#253430');sd.text((28,68),'Seven presentation views · final PNGs at 2560 × 1440',font=font(20),fill='#657068')
    for i,p in enumerate(previews):
        xx=i%4*640;yy=115+i//4*415;sheet.paste(fit(Image.open(p),(640,360)),(xx,yy));sd.text((xx+18,yy+373),f'{i+1:02d}  {LABELS[i]}',font=font(20),fill='#253430')
    sheet.paste(fit(crop,(640,360)),(1920,530));sd.text((1938,903),'REF  Original architectural crop',font=font(20),fill='#253430');sheet.save(ROOT/'contact-sheets'/f'{key}-contact-sheet.png')
    comparison=Image.new('RGB',(2560,960),'#f4f3ef');cd=ImageDraw.Draw(comparison);cd.text((28,24),f'{key} / {name} — reference comparison',font=font(34),fill='#253430');comparison.paste(fit(crop,(1260,740)),(10,110));comparison.paste(fit(Image.open(previews[0]),(1260,740)),(1290,110));cd.text((30,870),'SUPPLIED REFERENCE / architectural crop',font=font(23),fill='#253430');cd.text((1310,870),'MODEL / reference-facing hero',font=font(23),fill='#253430');cd.text((30,920),'Single-view reconstruction. Camera, rear elevations, interiors and terrain are inferred; scenic background is excluded.',font=font(20),fill='#657068');comparison.save(ROOT/'comparisons'/f'{key}-reference-comparison.png')
    xx=n%2*800;yy=110+n//2*495;overview.paste(fit(Image.open(previews[0]),(800,450)),(xx,yy));od.text((xx+22,yy+459),f'{key} / {name}',font=font(24),fill='#253430')
    original=Image.open(previews[0]).convert('RGB');reimport=Image.open(folder/'08-reimport-check.png').convert('RGB');channels=ImageStat.Stat(ImageChops.difference(original,reimport)).mean;error=sum(channels)/3
    assert error<5, (key,error)
    audit.append(dict(concept=key,reimportMeanAbsoluteRGB=error,fullScalePercent=100*error/255,referenceSHA256=hashlib.sha256(src.read_bytes()).hexdigest()))
overview.save(ROOT/'contact-sheets'/'all-concepts.png')
(ROOT/'qa'/'image-validation.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps(audit,indent=2))

# Deliver only the approved final assets and their evidence, excluding draft renders.
files = {}
for key in NAMES:
    for p in sorted((ROOT/key).glob('0[1-7]-*.png')):
        files[f'{key}/{p.name}'] = p
    p = ROOT/key/f'{key}-model.glb';files[f'{key}/{p.name}'] = p
    files[f'qa/reimports/{key}.png'] = ROOT/key/'08-reimport-check.png'
for folder in ['contact-sheets','comparisons','references']:
    for p in sorted((ROOT/folder).glob('*')):
        if p.is_file(): files[f'{folder}/{p.name}'] = p
files['README.md'] = ROOT/'README.md'
for p in Path('docs/models').glob('*.md'): files[f'notes/{p.name}'] = p
for p in sorted((ROOT/'qa').glob('*.json')): files[f'qa/{p.name}'] = p
for name in ['tests.log','build.log']:
    files[f'qa/{name}'] = ROOT/'qa'/name
for p in sorted((ROOT/'qa').glob('*-film-storyboard.png')): files[f'qa/{p.name}'] = p
manifest = {name:dict(bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for name,p in files.items()}
archive=Path('outputs/placeform-models.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name,p in files.items(): z.write(p,name)
    z.writestr('manifest.json',json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert sum(n.endswith('.glb') for n in z.namelist()) == 4
    assert sum(n[0] in NAMES and len(n.split('/'))==2 and n.endswith('.png') for n in z.namelist()) == 28
print(f'Delivery: {archive.resolve()} ({archive.stat().st_size:,} bytes, {len(files)+1} files)')

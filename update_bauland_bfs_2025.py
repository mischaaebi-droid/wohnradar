import json, zipfile, re, csv, io, collections, math
from pathlib import Path
ROOT=Path('/mnt/data')
SOURCE=ROOT/'px-x-0102010000_100_20261121-122759.json'
OLD=ROOT/'wohnradar_bauland_neue_formel.zip'
obj=json.loads(SOURCE.read_text(encoding='utf-8'))['dataset']
z=zipfile.ZipFile(OLD)
old_pop=json.loads(z.read('gemeinde_einwohner.json'))
old_dens=json.loads(z.read('gemeinde_dichte.json'))
plz_map=json.loads(z.read('plz_gemeinde.json'))
dim=obj['dimension']['Kanton (-) / Bezirk (>>) / Gemeinde (......)']['category']
raw={str(int(code)): obj['value'][pos] for code,pos in dim['index'].items() if re.fullmatch(r'\d{4}',code) and dim['label'][code].startswith('......')}
assert len(raw)==2115,len(raw)
# Stichtag 31.12.2025, Stand politische Gemeinden 01.01.2026
# Die neue Gemeinde Moutier JU (6831) entspricht im Bevölkerungsstand 2025 Moutier BE (0700).
transfer={'2056':['2016','2027'], '2262':['2262','2278'], '2525':['2520','2525','2529'], '4095':['4095','4122'], '6831':['700']}
used=set()
newpop={};newdens={}; fusionrows=[]
for bfs,previous in old_pop.items():
    old_ids=transfer.get(bfs,[bfs]);used.update(old_ids)
    missing=[i for i in old_ids if i not in raw]
    assert not missing,(bfs,missing)
    inhabitants=sum(raw[i] for i in old_ids)
    assert inhabitants>0
    original_area=old_dens[bfs]['flaeche_km2']
    assert isinstance(original_area,(float,int)) and original_area>0,(bfs,original_area)
    newpop[bfs]={"gemeinde":previous['gemeinde'],"kanton":previous['kanton'],"einwohner":inhabitants,"jahr":2025,"quelle":"BFS STATPOP 2025, ständige Wohnbevölkerung; Gemeindegebietsstand 01.01.2026"}
    newdens[bfs]={"gemeinde":previous['gemeinde'],"flaeche_km2":original_area,"einwohner_pro_km2":round(inhabitants/original_area,4),"einwohner_jahr":2025,"quelle":"BFS STATPOP 2025 / BFS Gemeindefläche (Gebietsstand 01.01.2026)"}
    if bfs in transfer:
        fusionrows.append({'bfs_2026':bfs,'gemeinde_2026':previous['gemeinde'],'bfs_2025':'+'.join(old_ids),'einwohner_2025_neu':inhabitants})
assert len(newpop)==len(newdens)==len(old_pop)==2110
assert used==set(raw), ('missing_source',list(set(raw)-used)[:20], 'extra',list(used-set(raw))[:20])
assert sum(v['einwohner'] for v in newpop.values())==obj['value'][0]
for name,d in [('gemeinde_einwohner.json',newpop),('gemeinde_dichte.json',newdens)]:
    (ROOT/name).write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
# Statische PLZ-Zuordnung bleibt erhalten.
(ROOT/'plz_gemeinde.json').write_text(json.dumps(plz_map,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
js=z.read('bauland.js').decode('utf-8')
js=js.replace(' * Wenn Bevölkerungsdaten fehlen, bleibt die bisherige Formel erhalten.\n * Die aktuelle Demografiedatei enthält noch NICHT alle Schweizer Gemeinden.\n', ' * Bevölkerungsdaten: einheitlich BFS STATPOP 2025 (2110 Gemeinden, Stand 01.01.2026).\n * Bei unzuordenbaren PLZ oder fehlenden Immobilienmarktdaten: Fallback-Preisberechnung.\n')
js=js.replace('    // Nicht gedeckte Gemeinden: bisherige unveränderte Preisberechnung.','    // Alle 2110 Gemeinden: einheitlich BFS STATPOP 2025.\n    // Bei nicht zuordenbaren PLZ oder fehlenden Immobilienwerten gilt die bisherige Preisberechnung.')
# Data-quality: ensure unknown BFS does not treat null as zero (already checked >0), and catch NaN if p invalid
js=js.replace('    const share = Math.max(\n', '    if (!Number.isFinite(p) || p <= 0) return;\n\n    const share = Math.max(\n')
(ROOT/'bauland.js').write_text(js,encoding='utf-8')
with (ROOT/'bfs_2025_gemeinden_kontrolle.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f,delimiter=';');w.writerow(['BFS_Nr_2026','Gemeinde','Kanton','Einwohner_STATPOP_2025','Flaeche_km2','Bevoelkerungsdichte_Einwohner_pro_km2'])
    for bfs,v in sorted(newpop.items(),key=lambda kv:int(kv[0])):
        den=newdens[bfs]; w.writerow([bfs,v['gemeinde'],v['kanton'],v['einwohner'],den['flaeche_km2'],den['einwohner_pro_km2']])
with (ROOT/'bfs_2025_gemeindemutationen.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=fusionrows[0].keys(),delimiter=';');w.writeheader();w.writerows(fusionrows)
readme='''WOHNRADAR BAULAND – BFS STATPOP 2025 (21.11.2026)\n\nDateien:\n- bauland.js -> javascript_dateien/bauland.js (bestehende Datei ersetzen)\n- gemeinde_einwohner.json -> daten/gemeinde_einwohner.json\n- gemeinde_dichte.json -> daten/gemeinde_dichte.json\n- plz_gemeinde.json -> daten/plz_gemeinde.json (gleiche räumliche Zuordnung wie bisher)\n\nZusätzlich vorausgesetzt, bereits auf der Website:\n- daten/wohnungspreise.json\n- daten/immobilienpreise.json\n- daten/mietmodell_plz_mit_nebenkosten.json\n- javascript_dateien/ortssuche.js\n\nBevölkerungsdaten: Vollständiger vom Nutzer gelieferter BFS-PXWEB-Export, STATPOP 2025,\nständige Wohnbevölkerung, alle Geschlechter/Zivilstände, 31.12.2025.\nGemeindestand für JSON-Schlüssel und Gemeindeflächen: 01.01.2026 (2110 Gemeinden).\nDie fünf Gemeindebestandsänderungen 2026 werden gemäss amtlicher Fusionen\nauf den neuen Gemeindestand umgerechnet (siehe bfs_2025_gemeindemutationen.csv).\nMoutier wurde von BFS 0700 (BE, 2025) zu 6831 (JU, 2026) zugeordnet.\nBevölkerungsdichte = STATPOP-Einwohner / vorhandene BFS-Gesamtfläche km².\nNicht nur Wohn-/Siedlungsfläche; die bisherige Modellkalibrierung verwendet Gesamtfläche.\n\nZusätzlich im ZIP: zwei Prüf-CSV und das Reproduktionsskript.\n\nHinweis: Der Fallback in bauland.js bleibt für nicht zuordenbare PLZ oder\nfehlende EFH-/Mietdaten bestehen; er bedeutet KEINE fehlenden Gemeinde-Einwohnerzahlen.\n'''
(ROOT/'ANLEITUNG.txt').write_text(readme,encoding='utf-8')
output=ROOT/'wohnradar_bauland_STATPOP_2025_komplett.zip'
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as out:
    for name in ['bauland.js','gemeinde_einwohner.json','gemeinde_dichte.json','plz_gemeinde.json','bfs_2025_gemeinden_kontrolle.csv','bfs_2025_gemeindemutationen.csv','ANLEITUNG.txt','update_bauland_bfs_2025.py']:
        out.write(ROOT/name,arcname=name)
print('population',len(raw),'2026 entities',len(newpop),'total',sum(x['einwohner'] for x in newpop.values()),'CHECK Switzerland',obj['value'][0]);print('fixes',fusionrows)
print('zip',output,output.stat().st_size);print('PLZ mappings',len(plz_map));print('example population',[(i,newpop[i]['gemeinde'],newpop[i]['einwohner'],newdens[i]['einwohner_pro_km2']) for i in ['293','6831','2056','2262','2525','4095']])

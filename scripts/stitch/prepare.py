from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[2]
source=root/'docs/design/stitch/source';out=root/'public/stitch'
pages={'route':'route_v3_compact_preview','journey':'route_active_journey_guidance','report-photo':'report_stage_1_upload_evidence','report-confirm':'report_stage_2_ai_scan_confirm','report-success':'report_stage_3_successfully_reported','my-reports':'my_reports_simple_list'}
config=re.search(r'tailwind.config\s*=\s*(.*?);</script>',(source/pages['route']/'code.html').read_text(),re.S).group(1)
(root/'scripts/stitch/tailwind.config.cjs').write_text('module.exports = '+config+';\n')
(root/'scripts/stitch/input.css').write_text('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n')
for page,folder in pages.items():
 html=(source/folder/'code.html').read_text()
 html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
 html=re.sub(r'<link\b[^>]*>','',html)
 html=html.replace('maximum-scale=1.0, user-scalable=no, ','')
 html=re.sub(r'src="https://lh3.googleusercontent.com/[^"]*"','src="evidence.svg"',html)
 html=re.sub(r'https://lh3.googleusercontent.com/[^&\"\s)]+','evidence.svg',html)
 html=re.sub(r' onclick="[^"]*"','',html)
 html=html.replace('href="javascript:history.back()"','href="route.html" data-cancel="true"')
 for anchor,target in [('my-reports','my-reports'),('routes','route'),('route','route'),('report','report-photo')]:html=html.replace('href="#'+anchor+'"','href="'+target+'.html"')
 html=html.replace('<head>','<head><title>AccessLoop · '+page.replace('-',' ').title()+'</title>')
 html=html.replace('</head>','<link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="app.css"><script src="app.js" defer></script></head>')
 html=html.replace('<body ',f'<body data-page="{page}" ')
 # Original placeholder map is a non-map graphic; supply a local schematic instead.
 html=re.sub(r'https://www.gstatic.com/labs-code/stitch/stitch-placeholder-300x300.svg','campus.svg',html)
 # These visual labels must not claim measurements or external actions.
 replacements={'Route Guidance Active':'Your Journey','ETA 7 min (540m)':'~12 min (785m)','High-Assurance Trail':'Campus route preview','AI Scan Complete':'Review your observation','AI Dimension Gauge':'Photo evidence','1.05m clearance':'Width not measured','-15cm vs ADA 1.20m':'Confirm on site','(98% Match)':'(review required)','Auto-tagged':'Review fields','Pinch point deficit: -15 cm':'Photo dimensions are not reliable measurements.','Logged to Campus Facilities':'Saved in this browser · demo only','Auto-routed':'Demo route','Crew Dispatched':'Resolved · demo','Passed · 14:02':'Start point','Clear passage':'Example route segment','Successfully Reported!':'Demo Report Saved!','GPS ±1.2m':'Example location','37.7749° N, 122.4194° W':'Location not confirmed','Market St & 4th St · Sidewalk E':'Select your observed location','Market St &amp; 4th St · Sidewalk E':'Select your observed location','IMG_20241024_scaffold.jpg':'No photo selected','(3.2 MB ready)':'','Fixed Oct 18 · Modular ramp installed':'Example resolution · not a live maintenance update'}
 for a,b in replacements.items():html=html.replace(a,b)
 html=html.replace('Audio On','Audio unavailable')
 html=html.replace('aria-label="Mute Voice Guidance"','aria-label="Voice guidance unavailable"')
 if page=='journey':
  # R2 deliberately retains the same map illustration as R1, not a map-less detail list.
  html=re.sub(r'background-image:\s*url\([^)]*\)',"background-image: url('campus.svg')",html)
  route_svg=re.search(r'<svg[^>]*viewBox="0 0 360 260".*?</svg>',(out/'route.html').read_text(),re.S).group(0)
  html=re.sub(r'<svg[^>]*viewBox="0 0 400 280".*?</svg>',route_svg.replace('class="w-full h-full"','class="absolute inset-0 w-full h-full"'),html,flags=re.S)
 html=html.replace('</body>','<div id="feedback" role="status" aria-live="polite"></div></body>')
 (out/(page+'.html')).write_text(html)
# Supplementary details use the same original header and bottom navigation.
shell=(out/'my-reports.html').read_text()
for page in ['report-detail','barrier-detail']:
 html=re.sub(r'<main\b.*?</main>', '<main class="detail-page"><button class="plain-back" id="detail-back">← Back</button><div id="detail-content"></div></main>',shell,flags=re.S)
 html=html.replace('data-page="my-reports"',f'data-page="{page}"').replace('<title>AccessLoop · My Reports</title>', '<title>AccessLoop · '+page.replace('-',' ').title()+'</title>')
 (out/(page+'.html')).write_text(html)
print('Prepared eight pages from the six original Stitch HTML exports.')

import sys, math
# Usage: python3 tools/build-guide.py .   (writes docs/guide.pl.html and docs/guide.en.html)
ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

# ---------- SVG illustrations (theme via CSS classes: .s-wall .s-accent .s-muted .s-red .s-green .s-text) ----------
def svg(w, h, body, label):
    return f'<figure class="thr-fig"><svg viewBox="0 0 {w} {h}" role="img" aria-label="{label}">{body}</svg><figcaption>{label}</figcaption></figure>'

def fig_quickstart(L):
    return svg(560, 200, f'''
<rect x="10" y="10" width="250" height="180" rx="8" class="s-panel"/>
<rect x="10" y="10" width="250" height="26" rx="8" class="s-panel2"/>
<text x="22" y="28" class="s-text s-small">{L["wallcfg"]}</text>
<line x1="20" y1="58" x2="130" y2="58" class="s-muted-line"/><line x1="140" y1="58" x2="250" y2="58" class="s-accent-line"/>
<text x="55" y="52" class="s-text s-small">{L["wall"]}</text><text x="165" y="52" class="s-text s-small s-bold">Threshold</text>
<rect x="24" y="72" width="222" height="24" rx="4" class="s-input"/><text x="32" y="88" class="s-text s-small">{L["gate"]}</text><path d="M232 82 l5 5 l5 -5" class="s-stroke"/>
<g transform="translate(24 108)">{"".join(f'<rect x="{c*45}" y="{r*16}" width="42" height="13" rx="2" class="{cls}"/>' for r,row in enumerate([["s-redf","s-greenf","s-redf","s-redf","s-greenf"],["s-greenf","s-greenf","s-greenf","s-greenf","s-greenf"],["s-yellowf","s-greenf","s-greenf","s-yellowf","s-greenf"]]) for c,cls in enumerate(row))}</g>
<rect x="24" y="162" width="222" height="20" rx="4" class="s-button"/><text x="135" y="176" text-anchor="middle" class="s-text s-small">Update Wall</text>
<circle cx="300" cy="58" r="13" class="s-badge"/><text x="300" y="63" text-anchor="middle" class="s-badge-text">1</text>
<text x="322" y="63" class="s-text">{L["qs1"]}</text>
<circle cx="300" cy="100" r="13" class="s-badge"/><text x="300" y="105" text-anchor="middle" class="s-badge-text">2</text>
<text x="322" y="105" class="s-text">{L["qs2"]}</text>
<circle cx="300" cy="142" r="13" class="s-badge"/><text x="300" y="147" text-anchor="middle" class="s-badge-text">3</text>
<text x="322" y="147" class="s-text">{L["qs3"]}</text>
<path d="M287 100 C 272 100 262 92 252 86" class="s-arrow" marker-end="url(#thr-arrow)"/>
<path d="M287 142 C 270 150 262 160 250 170" class="s-arrow" marker-end="url(#thr-arrow)"/>
''', L["fig_qs"])

def fig_matrix(L):
    states=L["states"]; rows=L["channels"]
    data=[["r","g","r","r","g"],["g","g","g","g","g"],["g","g","g","g","g"],["y","g","g","y","g"],["y","n","y","y","y"],["r","g","y","r","g"]]
    cells=""
    for ci,s in enumerate(states):
        cls="s-text s-small s-bold s-accent-text" if ci==0 else "s-text s-small"
        cells+=f'<text x="{150+ci*78}" y="24" text-anchor="middle" class="{cls}">{s}</text>'
    for ri,row in enumerate(data):
        cells+=f'<text x="96" y="{50+ri*24}" text-anchor="end" class="s-text s-small">{rows[ri]}</text>'
        for ci,v in enumerate(row):
            cls={"r":"s-redf","g":"s-greenf","y":"s-yellowf","n":"s-greenf"}[v]
            extra=' class-current' if ci==0 else ''
            cells+=f'<rect x="{112+ci*78}" y="{36+ri*24}" width="74" height="20" rx="3" class="{cls}{" s-outline" if ci==0 else ""}"/>'
    cells+='<circle cx="413" cy="100" r="3.5" class="s-dot"/><circle cx="491" cy="40" r="3.5" class="s-dot"/>'
    return svg(560, 190, cells+f'<text x="112" y="182" class="s-text s-small s-muted-text">{L["matrix_note"]}</text>', L["fig_matrix"])

def fig_proximity(L):
    return svg(560, 190, f'''
<line x1="20" y1="95" x2="230" y2="95" class="s-wall-line"/><line x1="330" y1="95" x2="540" y2="95" class="s-wall-line"/>
<line x1="230" y1="95" x2="330" y2="95" class="s-glass-line"/>
<circle cx="280" cy="95" r="100" class="s-range"/>
<circle cx="280" cy="140" r="16" class="s-token-green"/><text x="280" y="145" text-anchor="middle" class="s-badge-text">A</text>
<circle cx="430" cy="166" r="16" class="s-token-red"/><text x="430" y="171" text-anchor="middle" class="s-badge-text">B</text>
<path d="M280 124 L280 40" class="s-ray-green" marker-end="url(#thr-arrow-g)"/>
<path d="M417 156 L318 95" class="s-ray-red"/><path d="M318 95 L262 53" class="s-ray-red s-faded"/><text x="311" y="88" class="s-text s-bold s-red-text">✕</text>
<text x="300" y="30" class="s-text s-small">{L["prox_label"]}</text>
''', L["fig_prox"])

def fig_ajar(L):
    hx,hy=170,100; length=110; a=math.radians(35)
    fx,fy=hx+length*math.cos(a), hy+length*math.sin(a)
    return svg(560, 210, f'''
<line x1="20" y1="100" x2="166" y2="100" class="s-wall-line"/><line x1="284" y1="100" x2="420" y2="100" class="s-wall-line"/>
<line x1="170" y1="100" x2="280" y2="100" class="s-helper"/>
<path d="M{hx+length} {hy} A {length} {length} 0 0 1 {fx:.0f} {fy:.0f}" class="s-arc"/>
<line x1="{hx}" y1="{hy}" x2="{fx:.0f}" y2="{fy:.0f}" class="s-leaf"/>
<circle cx="{hx}" cy="{hy}" r="6" class="s-hinge"/>
<text x="{hx-10}" y="{hy-12}" text-anchor="end" class="s-text s-bold">A</text><text x="{hx+length+10}" y="{hy-12}" class="s-text s-bold">B</text>
<text x="{hx+52}" y="{hy+30}" class="s-text s-small s-accent-text">35°</text>
<g transform="translate(450 50)">
  <rect x="0" y="0" width="60" height="90" rx="30" class="s-mouse"/><line x1="30" y1="0" x2="30" y2="36" class="s-stroke"/>
  <rect x="25" y="14" width="10" height="20" rx="5" class="s-wheel"/>
  <text x="30" y="120" text-anchor="middle" class="s-text s-bold">Alt + ⟳</text>
</g>
<line x1="30" y1="180" x2="56" y2="180" class="s-leaf"/><text x="64" y="185" class="s-text s-small">{L["leaf"]}</text>
<line x1="160" y1="180" x2="186" y2="180" class="s-helper"/><text x="194" y="185" class="s-text s-small">{L["helper"]}</text>
''', L["fig_ajar"])

def fig_hinge(L):
    return svg(560, 130, f'''
<line x1="60" y1="60" x2="300" y2="60" class="s-leaf"/>
<circle cx="60" cy="60" r="7" class="s-hinge"/><circle cx="300" cy="60" r="7" class="s-end"/>
<text x="60" y="40" text-anchor="middle" class="s-text s-bold">A</text><text x="300" y="40" text-anchor="middle" class="s-text s-bold">B</text>
<path d="M90 90 L270 90" class="s-arrow" marker-end="url(#thr-arrow)"/>
<text x="180" y="112" text-anchor="middle" class="s-text s-small">{L["drawn"]}</text>
<text x="340" y="56" class="s-text s-small">{L["hinge_a"]}</text>
<text x="340" y="80" class="s-text s-small">{L["hinge_b"]}</text>
''', L["fig_hinge"])

def fig_durability(L):
    return svg(560, 150, f'''
<line x1="40" y1="60" x2="160" y2="60" class="s-wall-line"/><line x1="160" y1="60" x2="280" y2="60" class="s-door-line"/><line x1="280" y1="60" x2="400" y2="60" class="s-wall-line"/>
<rect x="172" y="76" width="96" height="12" rx="6" class="s-bar-bg"/><rect x="173" y="77" width="56" height="10" rx="5" class="s-bar-yellow"/>
<text x="220" y="112" text-anchor="middle" class="s-text s-small">18 / 30</text>
<text x="430" y="50" class="s-text s-mono">thr.damage(12)</text>
<text x="430" y="74" class="s-text s-mono">thr.repair()</text>
<text x="430" y="104" class="s-text s-small s-muted-text">{L["dur_note"]}</text>
''', L["fig_dur"])

DEFS = '''<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<marker id="thr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="s-arrow-head"/></marker>
<marker id="thr-arrow-g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="s-arrow-head-g"/></marker>
</defs></svg>'''

# ---------- text ----------
PL = dict(
 wallcfg="Konfiguracja ściany", wall="Ściana", gate="Furtka (kraty)",
 qs1="Kliknij ścianę dwukrotnie", qs2="Wybierz profil", qs3="Kliknij Update Wall",
 fig_qs="Szybki start w trzech krokach",
 states=["Zamkn.","Otwarte","Uchyl.","Na klucz","Uszk."], channels=["Ruch","Wzrok","Światło","Dźwięk","Osłona","Pociski"],
 matrix_note="Obwódka: bieżący stan. Kropka: wartość nadpisana dla tego stanu.", fig_matrix="Macierz stanów: kanały w wierszach, stany w kolumnach",
 prox_label="zasięg bliskości: 1 pole", fig_prox="Okno z bliskością: A stoi w zasięgu i widzi przez szybę, B jest za daleko",
 leaf="skrzydło", helper="ściana pomocnicza (tylko ruch)", fig_ajar="Uchylone drzwi: skrzydło obrócone na zawiasie A, szczelina jeszcze za wąska na przejście",
 drawn="kierunek rysowania ściany", hinge_a="Zawias A: początek ściany", hinge_b="Zawias B: koniec ściany", fig_hinge="Który koniec to A, a który B",
 dur_note="Przy 0 przeszkoda przechodzi w stan „Uszkodzone”.", fig_dur="Pasek wytrzymałości pod drzwiami i makra",
)
EN = dict(
 wallcfg="Wall Configuration", wall="Wall", gate="Gate (bars)",
 qs1="Double-click a wall", qs2="Pick a profile", qs3="Click Update Wall",
 fig_qs="Quick start in three steps",
 states=["Closed","Open","Ajar","Locked","Damaged"], channels=["Movement","Vision","Light","Sound","Cover","Projectiles"],
 matrix_note="Outline: current state. Dot: value overridden for that state.", fig_matrix="State matrix: channels in rows, states in columns",
 prox_label="proximity range: 1 square", fig_prox="Window with proximity: A is within range and sees through the glass, B is too far",
 leaf="door leaf", helper="helper wall (movement only)", fig_ajar="A door ajar: the leaf swung on hinge A, the gap still too narrow to pass",
 drawn="direction the wall was drawn", hinge_a="Hinge A: start of the wall", hinge_b="Hinge B: end of the wall", fig_hinge="Which end is A and which is B",
 dur_note="At 0 the barrier switches to Damaged.", fig_dur="Durability bar under a door, and macros",
)

def section(id_, audience, title, body):
    return f'<section data-guide-section="{id_}" data-audience="{audience}"><h2 id="thr-guide-{id_}">{title}</h2>{body}</section>\n'

def guide_pl(L):
    s = DEFS
    s += section("quick-start","gm","Szybki start", fig_quickstart(L) + '''
<ol><li>Kliknij dwukrotnie ścianę albo drzwi (jako MG).</li>
<li>W oknie przejdź na zakładkę <b>Threshold</b> i wybierz <b>profil przeszkody</b>, np. „Furtka (kraty)”, „Okno” albo „Drzwi szklane”.</li>
<li>Kliknij <b>Update Wall</b>. Gotowe: ściana ma teraz ustawiony ruch, wzrok, światło, dźwięk, drzwi i teksturę.</li></ol>
<p>Profil to punkt wyjścia: każde ustawienie możesz zmienić dla tej jednej ściany. Ustawienie profilu na <b>Brak</b> i zapis przywraca ścianie jej pierwotne ustawienia.</p>''')
    s += section("tab","gm","Zakładka Threshold", fig_matrix(L) + '''
<p>Na górze zakładki są profil, sterowanie drzwiami, stan i <b>macierz stanów</b>. Kolory: czerwony blokuje, żółty częściowo, zielony przepuszcza. Kliknięcie kolumny otwiera edycję tego stanu.</p>
<p>Niżej są zwijane sekcje:</p>
<ul><li><b>Co przechodzi przez przeszkodę</b>: wartości dla stanu zamkniętego, osobno dla ruchu, wzroku, światła, dźwięku, osłony i pocisków.</li>
<li><b>Uchylanie</b> (tylko drzwi): zobacz rozdział „Uchylanie drzwi”.</li>
<li><b>Zachowanie w innych stanach</b>: zobacz rozdział „Stany”.</li>
<li><b>Wygląd</b>: tekstura i animacja.</li>
<li><b>Materiał i interakcje</b>: materiał, wytrzymałość, czy gracze mogą używać przeszkody.</li></ul>
<p>Dopóki profil jest aktywny, natywne pola ruchu, wzroku, światła, dźwięku i drzwi na zakładce <b>Ściana</b> są zablokowane: kontroluje je Threshold.</p>''')
    s += section("proximity","gm","Bliskość i zasięgi", fig_proximity(L) + '''
<p>Kanał ustawiony na <b>Bliskość</b> przepuszcza wzrok, światło lub dźwięk tylko wtedy, gdy źródło jest blisko przeszkody. Tak działa okno (widać przez nie z bliska) i podsłuchiwanie pod drzwiami.</p>
<p>Zasięg wpisujesz w <b>polach siatki</b>, nie w stopach czy metrach, dzięki czemu profile pasują do każdego systemu. Pod polem widać przeliczenie, np. „= 5 ft”. Uwaga: 60 pól to 300 stóp, czyli praktycznie cała mapa.</p>''')
    s += section("states","gm","Stany", '''
<p>Przeszkoda może być <b>zamknięta</b>, <b>otwarta</b>, <b>uchylona</b>, <b>zamknięta na klucz</b> albo <b>uszkodzona</b>. Uchylone i zamknięte na klucz dotyczą tylko drzwi.</p>
<ul><li>Bez nadpisań otwarta przeszkoda przepuszcza wszystko, a zamknięta na klucz i uszkodzona zachowują się jak zamknięta.</li>
<li>W sekcji <b>Zachowanie w innych stanach</b> możesz to zmienić dla każdego kanału. Pole „Domyślnie (…)” pokazuje, co daje reguła wbudowana.</li>
<li>Każdy stan może mieć też własną teksturę: wybite okno, rozbita barykada, odsłonięte zasłony.</li></ul>
<p>Gracze otwierają i zamykają drzwi zwykłą ikoną drzwi Foundry; moduł sam aktualizuje stan.</p>''')
    s += section("ajar","gm","Uchylanie drzwi", fig_ajar(L) + '''
<p>Drzwi z presetów mają <b>fizyczne uchylanie</b>: po uchyleniu skrzydło naprawdę obraca się na zawiasie (drzwi przesuwne wsuwają się w futrynę), a Foundry samo liczy, co widać przez szczelinę.</p>
<ul><li><b>Z mapy:</b> przytrzymaj <b>Alt</b> i przewiń kółkiem nad ikoną drzwi. W górę: szerzej, w dół: przymknij. Przy 0 drzwi się zamykają.</li>
<li><b>W zakładce:</b> suwak stopnia uchylenia, zawias, kierunek i schemat na żywo.</li>
<li>Dopóki szczelina jest węższa niż ustawiony próg (domyślnie 1 pole), w futrynie stoi <b>ściana pomocnicza</b>, która blokuje tylko ruch. Moduł tworzy ją i usuwa sam; nie edytuj jej.</li>
<li>Kliknięcie ikony uchylonych drzwi otwiera je do końca, kolejne zamyka.</li></ul>''' + fig_hinge(L) + '''
<p>Jeśli drzwi obracają się na złym końcu, przełącz <b>Zawias</b> na drugi koniec. Jeśli w złą stronę, zmień <b>Kierunek</b>.</p>''')
    s += section("durability","gm","Wytrzymałość i obrażenia", fig_durability(L) + '''
<p>Zniszczalne przeszkody mają wytrzymałość z materiału (drewno 30, szkło 15…). Pod nimi na mapie widać pasek; kto go widzi, ustawisz w opcjach modułu.</p>
<p>Zaznacz ścianę i użyj makra:</p>
<pre><code>const thr = game.modules.get("threshold").api;
await thr.damage(12);   // obrażenia
await thr.repair();     // pełna naprawa</code></pre>
<p>Przy 0 przeszkoda przechodzi w stan <b>Uszkodzone</b>: wyważone drzwi i rozbita barykada stają się przechodnie, okno zostaje wybite. Naprawa przywraca stan <b>Zamknięte</b>.</p>''')
    s += section("appearance","gm","Wygląd i tekstury", '''
<p>W sekcji <b>Wygląd</b> wybierasz jedną z 16 wbudowanych tekstur albo dowolny własny obraz przyciskiem przeglądania plików.</p>
<ul><li><b>Drzwi</b> korzystają z animowanych drzwi Foundry: tekstura obraca się, przesuwa, unosi lub opuszcza przy otwieraniu.</li>
<li><b>Inne przeszkody</b> (kraty, okna, pole siłowe, barykada) rysuje moduł, pod żetonami i nad kafelkami; mgła wojny ukrywa je jak kafelki.</li>
<li><b>Grubość</b> podajesz w polach siatki; domyślnie jest cienka, żeby przeszkoda nie zasłaniała mapy.</li></ul>''')
    s += section("settings","gm","Ustawienia modułu", '''
<ul><li><b>Stosuj profile do natywnych ścian</b>: wyłączone oznacza, że profil jest tylko zapisanymi danymi.</li>
<li><b>Paski wytrzymałości na mapie</b>: nikt, tylko MG albo MG i gracze.</li>
<li><b>Przewodnik Threshold</b>: otwiera to okno.</li>
<li><b>Pokazuj okno powitalne po aktualizacjach</b>: ustawienie każdego użytkownika osobno.</li></ul>''')
    s += section("players","all","Dla graczy", '''
<ul><li>Drzwi otwierasz i zamykasz jak zwykle, klikając ich ikonę.</li>
<li>Przytrzymaj <b>Alt</b> i przewiń kółkiem nad ikoną drzwi, żeby je <b>uchylić</b> albo przymknąć. Działa, jeśli MG pozwala graczom używać tych drzwi i nie są zamknięte na klucz.</li>
<li>Przez uchylone drzwi widzisz tylko to, co naprawdę widać przez szczelinę. Wąską szczeliną nie przejdziesz.</li>
<li>Przez okno zobaczysz więcej, gdy podejdziesz blisko. Pod drzwiami czasem coś usłyszysz.</li></ul>''')
    s += section("macros","gm","Makra i API", '''
<pre><code>const thr = game.modules.get("threshold").api;
await thr.apply("gate");          // profil dla zaznaczonych ścian
await thr.ajar(0.33);             // uchyl zaznaczone drzwi (~30°)
await thr.damage(10);             // obrażenia
await thr.repair();               // naprawa
thr.profiles.list();              // lista profili
thr.guide();                      // to okno</code></pre>
<p>Moduły systemów mogą dodawać własne profile hookiem <code>threshold.registerProfiles</code> i zmieniać obrażenia hookiem <code>threshold.preDamage</code>.</p>''')
    s += section("troubleshooting","gm","Rozwiązywanie problemów", '''
<ul><li><b>Widać przez ścianę z drugiego końca mapy:</b> sprawdź zasięg bliskości; jest w polach siatki.</li>
<li><b>Drzwi obracają się na złym końcu albo w złą stronę:</b> zmień Zawias lub Kierunek w sekcji Uchylanie.</li>
<li><b>Nie mogę edytować ruchu i wzroku na zakładce Ściana:</b> kontroluje je profil; zmień je w zakładce Threshold albo ustaw profil na Brak.</li>
<li><b>Alt + kółko przybliża mapę zamiast uchylać:</b> najedź dokładnie na ikonę drzwi; daj znać autorowi, jeśli to nie pomaga.</li>
<li><b>Coś nie działa:</b> otwórz konsolę (F12), skopiuj komunikaty z „[THR]” i zgłoś je w repozytorium.</li></ul>''')
    return s

def guide_en(L):
    s = DEFS
    s += section("quick-start","gm","Quick start", fig_quickstart(L) + '''
<ol><li>Double-click a wall or door (as the GM).</li>
<li>Switch to the <b>Threshold</b> tab and pick a <b>barrier profile</b>, e.g. “Gate (bars)”, “Window” or “Glass door”.</li>
<li>Click <b>Update Wall</b>. Done: the wall now has movement, vision, light, sound, door and texture set up.</li></ol>
<p>A profile is a starting point: change any setting for this one wall. Setting the profile back to <b>None</b> and saving restores the wall's original settings.</p>''')
    s += section("tab","gm","The Threshold tab", fig_matrix(L) + '''
<p>At the top: profile, door control, state and the <b>state matrix</b>. Colours: red blocks, yellow partly, green lets through. Click a column to edit that state.</p>
<p>Below are collapsible sections:</p>
<ul><li><b>What gets through</b>: values for the closed state, separately for movement, vision, light, sound, cover and projectiles.</li>
<li><b>Opening ajar</b> (doors only): see “Opening doors ajar”.</li>
<li><b>Behaviour in other states</b>: see “States”.</li>
<li><b>Appearance</b>: texture and animation.</li>
<li><b>Material and interaction</b>: material, durability, whether players can operate the barrier.</li></ul>
<p>While a profile is active, the native movement, sight, light, sound and door fields on the <b>Wall</b> tab are locked: Threshold controls them.</p>''')
    s += section("proximity","gm","Proximity and ranges", fig_proximity(L) + '''
<p>A channel set to <b>Proximity</b> lets sight, light or sound through only when the source is close to the barrier. That is how a window works (you see through it up close), and how listening at a door works.</p>
<p>Ranges are in <b>grid squares</b>, not feet or metres, so profiles fit any system. The value in scene units is shown below the field, e.g. “= 5 ft”. Note: 60 squares is 300 feet, practically the whole map.</p>''')
    s += section("states","gm","States", '''
<p>A barrier can be <b>closed</b>, <b>open</b>, <b>ajar</b>, <b>locked</b> or <b>damaged</b>. Ajar and locked apply to doors only.</p>
<ul><li>Without overrides an open barrier lets everything through, and locked or damaged behave like closed.</li>
<li>Change that per channel in <b>Behaviour in other states</b>. “Default (…)” shows what the built-in rule gives.</li>
<li>Each state can also have its own texture: a broken window, a smashed barricade, curtains drawn back.</li></ul>
<p>Players open and close doors with Foundry's usual door icon; the module updates the state itself.</p>''')
    s += section("ajar","gm","Opening doors ajar", fig_ajar(L) + '''
<p>Preset doors use <b>physical opening</b>: when ajar, the leaf really swings on its hinge (sliding doors retract into the frame), and Foundry works out what can be seen through the gap.</p>
<ul><li><b>From the map:</b> hold <b>Alt</b> and scroll over the door icon. Up: wider, down: push to. At 0 the door closes.</li>
<li><b>On the tab:</b> opening slider, hinge, direction and a live schematic.</li>
<li>While the gap is narrower than the threshold (default 1 square), a <b>helper wall</b> in the frame blocks movement only. The module creates and removes it; don't edit it.</li>
<li>Clicking the icon of a door that is ajar opens it fully; clicking again closes it.</li></ul>''' + fig_hinge(L) + '''
<p>If a door swings on the wrong end, switch <b>Hinge</b> to the other end. If it swings the wrong way, change <b>Swings</b>.</p>''')
    s += section("durability","gm","Durability and damage", fig_durability(L) + '''
<p>Destructible barriers get durability from their material (wood 30, glass 15…). A bar is shown under them on the map; module settings choose who sees it.</p>
<p>Select the wall and use a macro:</p>
<pre><code>const thr = game.modules.get("threshold").api;
await thr.damage(12);   // damage
await thr.repair();     // full repair</code></pre>
<p>At 0 the barrier becomes <b>Damaged</b>: a broken door or barricade can be walked through, a window is smashed. Repairing returns it to <b>Closed</b>.</p>''')
    s += section("appearance","gm","Appearance and textures", '''
<p>In <b>Appearance</b> pick one of the 16 bundled textures or any image of your own with the browse button.</p>
<ul><li><b>Doors</b> use Foundry's animated doors: the texture swings, slides, rises or descends when opening.</li>
<li><b>Other barriers</b> (bars, windows, force field, barricade) are drawn by the module, below tokens and above tiles; fog of war hides them like tiles.</li>
<li><b>Thickness</b> is in grid squares; thin by default so the barrier doesn't cover the map.</li></ul>''')
    s += section("settings","gm","Module settings", '''
<ul><li><b>Apply profiles to native walls</b>: off means profiles are stored as data only.</li>
<li><b>Durability bars on the map</b>: nobody, GM only, or GM and players.</li>
<li><b>Threshold guide</b>: opens this window.</li>
<li><b>Show the welcome window after updates</b>: a per-user setting.</li></ul>''')
    s += section("players","all","For players", '''
<ul><li>Open and close doors as usual by clicking their icon.</li>
<li>Hold <b>Alt</b> and scroll over a door icon to open it a <b>crack</b> or push it to. This works if the GM lets players use that door and it isn't locked.</li>
<li>Through a door ajar you see only what can really be seen through the gap. You can't squeeze through a narrow gap.</li>
<li>You see more through a window when you stand close to it. Sometimes you can hear what's behind a door.</li></ul>''')
    s += section("macros","gm","Macros and API", '''
<pre><code>const thr = game.modules.get("threshold").api;
await thr.apply("gate");          // profile for the selected walls
await thr.ajar(0.33);             // stand the selected door ajar (~30°)
await thr.damage(10);             // damage
await thr.repair();               // repair
thr.profiles.list();              // list profiles
thr.guide();                      // this window</code></pre>
<p>System modules can add profiles with the <code>threshold.registerProfiles</code> hook and change damage with <code>threshold.preDamage</code>.</p>''')
    s += section("troubleshooting","gm","Troubleshooting", '''
<ul><li><b>I can see through a wall from across the map:</b> check the proximity range; it is in grid squares.</li>
<li><b>A door swings on the wrong end or the wrong way:</b> change Hinge or Swings in Opening ajar.</li>
<li><b>I can't edit movement and sight on the Wall tab:</b> the profile controls them; change them on the Threshold tab or set the profile to None.</li>
<li><b>Alt + wheel zooms instead of opening:</b> point exactly at the door icon; report it if that doesn't help.</li>
<li><b>Something doesn't work:</b> open the console (F12), copy the messages with “[THR]” and report them in the repository.</li></ul>''')
    return s

open(f"{ROOT}/docs/guide.pl.html","w").write("<!-- Threshold guide (pl). Generated by tools/build-guide.py: edit that script and run it, do not edit by hand. -->\n"+guide_pl(PL))
open(f"{ROOT}/docs/guide.en.html","w").write("<!-- Threshold guide (en). Generated by tools/build-guide.py: edit that script and run it, do not edit by hand. -->\n"+guide_en(EN))
print("ok")

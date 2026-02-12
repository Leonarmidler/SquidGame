const API_TOKEN = 'f1b468f93d3548668e70d6af55cf032f';
const COMPETITION_ID = 'SA';

let partiteReali = [];
let partitePerGiornata = {};
let giornateTotali = [];
let giornateCaricate = 0;
const BATCH_SIZE = 3;
const teamCache = {};
let sceltePerGiornata = {};
let squadreGiaUsate = new Set();
let squadreUsateGlobalmente = new Set();

async function caricaDatiReali() {
    try {
        const targetUrl = `https://api.football-data.org/v4/competitions/${COMPETITION_ID}/matches?status=SCHEDULED`;
        const proxyUrl = "https://corsproxy.io/?" + encodeURIComponent(targetUrl);
        const response = await fetch(proxyUrl, { headers: { 'X-Auth-Token': API_TOKEN } });
        const data = await response.json();
        partiteReali = data.matches.map(match => ({
            id: match.id,
            matchday: match.matchday,
            homeTeam: { id: match.homeTeam.id, name: match.homeTeam.shortName || match.homeTeam.name, crest: match.homeTeam.crest },
            awayTeam: { id: match.awayTeam.id, name: match.awayTeam.shortName || match.awayTeam.name, crest: match.awayTeam.crest }
        }));
        await preparaCacheImmagini(partiteReali);
    } catch (error) {
        document.getElementById('loading').innerHTML = `Errore Caricamento 😢`;
    }
}

async function preparaCacheImmagini(partite) {
    const uniqueTeams = new Map();
    partite.forEach(m => {
        uniqueTeams.set(m.homeTeam.id, m.homeTeam);
        uniqueTeams.set(m.awayTeam.id, m.awayTeam);
    });
    const teamsArray = Array.from(uniqueTeams.values());
    const total = teamsArray.length;
    let loaded = 0;

    await Promise.all(teamsArray.map(async (team) => {
        try {
            const proxyImgUrl = "https://corsproxy.io/?" + encodeURIComponent(team.crest);
            const resp = await fetch(proxyImgUrl);
            const blob = await resp.blob();
            const base64Data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
            teamCache[team.id] = { id: team.id, name: team.name, logoData: base64Data, isBase64: true };
        } catch (e) {
            teamCache[team.id] = { id: team.id, name: team.name, logoData: null, isBase64: false };
        } finally {
            loaded++;
            document.getElementById('progressBar').style.width = `${(loaded / total) * 100}%`;
        }
    }));
    avviaApp();
}

function avviaApp() {
    partitePerGiornata = raggruppaPerGiornata(partiteReali);
    giornateTotali = Object.keys(partitePerGiornata).sort((a, b) => a - b);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    renderPreSelectionGrid();
    caricaAltraGiornata(BATCH_SIZE);
}

function gestioneClickSquadra(teamId, matchday, btnElement) {
    // Feedback immediato
    const parentRow = btnElement.closest('.match-row');
    const oldSelected = parentRow.querySelector('.btn-team.selected');
    const wasSelected = btnElement.classList.contains('selected');

    if (oldSelected) oldSelected.classList.remove('selected');
    if (!wasSelected) btnElement.classList.add('selected');
    else btnElement.classList.remove('selected');

    // Calcolo logico
    setTimeout(() => {
        if (sceltePerGiornata[matchday] === teamId) delete sceltePerGiornata[matchday];
        else sceltePerGiornata[matchday] = teamId;
        updateGlobalState();
    }, 10);
}

function updateGlobalState() {
    squadreUsateGlobalmente = new Set([...squadreGiaUsate, ...Object.values(sceltePerGiornata)]);
    renderPreSelectionGrid();
    aggiornaStatoVisivo();
    renderRiepilogo();
}

function aggiornaStatoVisivo() {
    document.querySelectorAll('.btn-team').forEach(btn => {
        const tId = parseInt(btn.dataset.teamId);
        const mDay = parseInt(btn.dataset.matchday);
        btn.classList.remove('disabled');
        btn.disabled = false;
        const isSelectedHere = (sceltePerGiornata[mDay] === tId);
        const isUsedElsewhere = squadreUsateGlobalmente.has(tId) && !isSelectedHere;
        if (isSelectedHere) btn.classList.add('selected');
        else btn.classList.remove('selected');
        if (isUsedElsewhere) { btn.classList.add('disabled'); btn.disabled = true; }
    });
}

function costruisciHTMLGiornata(giornata, matches) {
    const container = document.createElement('div');
    container.className = 'giornata-container';

    // Header
    const header = document.createElement('div');
    header.className = 'giornata-header';
    header.innerHTML = `<span class="giornata-badge">Giornata ${giornata}</span>`;
    container.appendChild(header);

    // Righe partite
    matches.forEach(match => {
        const row = document.createElement('div');
        row.className = 'match-row';

        // Bottone Home
        const btnHome = creaBottoneDOM(match.homeTeam.id, match.matchday);
        // VS
        const vs = document.createElement('span');
        vs.className = 'vs-separator';
        vs.innerText = 'vs';
        // Bottone Away
        const btnAway = creaBottoneDOM(match.awayTeam.id, match.matchday);

        row.appendChild(btnHome);
        row.appendChild(vs);
        row.appendChild(btnAway);
        container.appendChild(row);
    });
    return container;
}

function creaBottoneDOM(teamId, matchday) {
    const teamData = teamCache[teamId];
    const btn = document.createElement('button');
    btn.className = 'btn-team';
    btn.dataset.teamId = teamId;
    btn.dataset.matchday = matchday;

    const initials = teamData.name.substring(0, 2).toUpperCase();

    if (teamData.isBase64) {
        const img = document.createElement('img');
        img.src = teamData.logoData;
        btn.appendChild(img);
    } else {
        const avatar = document.createElement('div');
        avatar.className = 'fallback-avatar';
        avatar.innerText = initials;
        btn.appendChild(avatar);
    }

    const nameSpan = document.createElement('span');
    nameSpan.innerText = teamData.name;
    btn.appendChild(nameSpan);

    btn.onclick = (e) => gestioneClickSquadra(teamId, matchday, e.currentTarget);
    return btn;
}

function renderPreSelectionGrid() {
    const grid = document.getElementById('preSelectionGrid');
    grid.innerHTML = '';
    const teamIds = Object.keys(teamCache).sort((a, b) => teamCache[a].name.localeCompare(teamCache[b].name));
    teamIds.forEach(id => {
        const teamData = teamCache[id];
        const btn = document.createElement('div');
        btn.className = 'btn-mini';
        if (squadreGiaUsate.has(parseInt(id))) btn.classList.add('burned');

        const initials = teamData.name.substring(0, 2).toUpperCase();
        if (teamData.isBase64) {
            const img = document.createElement('img');
            img.src = teamData.logoData;
            btn.appendChild(img);
        } else {
            const avatar = document.createElement('div');
            avatar.className = 'fallback-avatar';
            avatar.innerText = initials;
            btn.appendChild(avatar);
        }

        const span = document.createElement('span');
        span.innerText = teamData.name;
        btn.appendChild(span);

        btn.onclick = () => {
            const tId = parseInt(id);
            if (squadreGiaUsate.has(tId)) squadreGiaUsate.delete(tId);
            else {
                squadreGiaUsate.add(tId);
                for (const [g, tid] of Object.entries(sceltePerGiornata)) if (tid === tId) delete sceltePerGiornata[g];
            }
            updateGlobalState();
        };
        grid.appendChild(btn);
    });
}

function renderRiepilogo() {
    const container = document.getElementById('summaryContainer');
    const list = document.getElementById('summaryList');
    list.innerHTML = '';
    const giornateScelte = Object.keys(sceltePerGiornata).sort((a, b) => a - b);
    if (giornateScelte.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    giornateScelte.forEach(giornata => {
        const teamIdScelto = sceltePerGiornata[giornata];
        const match = partiteReali.find(m => m.matchday == giornata && (m.homeTeam.id == teamIdScelto || m.awayTeam.id == teamIdScelto));
        if (match) {
            const li = document.createElement('li');
            li.className = 'summary-item';
            const isHomePicked = (match.homeTeam.id === teamIdScelto);

            const getTeamDiv = (teamId, isPicked, align) => {
                const teamData = teamCache[teamId];
                const div = document.createElement('div');
                div.className = align === 'right' ? 'summary-home' : 'summary-away';
                if (isPicked) div.classList.add('picked');

                const name = document.createElement('span');
                name.innerText = teamData.name;

                let media;
                if (teamData.isBase64) {
                    media = document.createElement('img');
                    media.className = 'summary-logo';
                    media.src = teamData.logoData;
                } else {
                    media = document.createElement('div');
                    media.className = 'summary-fallback';
                    media.innerText = teamData.name.substring(0, 2).toUpperCase();
                }

                if (align === 'right') {
                    div.appendChild(name);
                    div.appendChild(media);
                } else {
                    div.appendChild(media);
                    div.appendChild(name);
                }
                return div;
            };

            const badge = document.createElement('div');
            badge.className = 'summary-badge';
            badge.innerText = `G${giornata}`;

            const sep = document.createElement('div');
            sep.className = 'summary-sep';
            sep.innerText = '-';

            li.appendChild(badge);
            li.appendChild(getTeamDiv(match.homeTeam.id, isHomePicked, 'right'));
            li.appendChild(sep);
            li.appendChild(getTeamDiv(match.awayTeam.id, !isHomePicked, 'left'));

            list.appendChild(li);
        }
    });
}

function caricaAltraGiornata(quantita = 1) {
    const appDiv = document.getElementById('app');
    const start = giornateCaricate;
    const end = Math.min(start + quantita, giornateTotali.length);
    for (let i = start; i < end; i++) appDiv.appendChild(costruisciHTMLGiornata(giornateTotali[i], partitePerGiornata[giornateTotali[i]]));
    giornateCaricate = end;
    document.getElementById('loadMoreContainer').style.display = (giornateCaricate < giornateTotali.length) ? 'block' : 'none';
    aggiornaStatoVisivo();
}

function raggruppaPerGiornata(partite) {
    const gruppi = {};
    partite.forEach(match => {
        if (!gruppi[match.matchday]) gruppi[match.matchday] = [];
        gruppi[match.matchday].push(match);
    });
    return gruppi;
}

function scaricaImmagine() {
    const elemento = document.getElementById('summaryContainer');
    const btn = document.querySelector('.btn-download');
    btn.disabled = true;
    html2canvas(elemento, { backgroundColor: "#ffffff", scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'SquidSerieA_Scelte.png';
        link.href = canvas.toDataURL("image/png");
        link.click();
        btn.disabled = false;
    });
}

async function condividiImmagine() {
    const elemento = document.getElementById('summaryContainer');
    const btn = document.getElementById('btnShare');
    const originalText = btn.innerHTML;

    // Controllo se il browser supporta la condivisione di file
    if (!navigator.canShare || !navigator.share) {
        alert("Il tuo browser non supporta la condivisione diretta. Usa il tasto 'Salva'.");
        return;
    }

    btn.innerHTML = '⏳ Preparazione...';
    btn.disabled = true;

    try {
        // 1. Genera il canvas
        const canvas = await html2canvas(elemento, {
            backgroundColor: "#ffffff",
            scale: 2,
            useCORS: true
        });

        // 2. Trasforma il canvas in un Blob (dati binari)
        canvas.toBlob(async (blob) => {
            if (!blob) {
                alert("Errore nella creazione dell'immagine.");
                return;
            }

            // 3. Crea un vero file PNG
            const file = new File([blob], 'MioSquidSerieA.png', { type: 'image/png' });

            // 4. Verifica se il file è "condivisibile"
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Il mio piano Squid Serie A',
                    text: 'Ecco le mie scelte per la Serie A! Che ne pensi?'
                });
            } else {
                alert("Il sistema non permette la condivisione di questo file.");
            }

            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 'image/png');

    } catch (err) {
        console.error(err);
        alert("Errore durante la condivisione.");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

caricaDatiReali();
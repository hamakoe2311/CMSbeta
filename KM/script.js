const defaultSettings = {
    theme: 'modern', bgPosition: 'center', bgSize: 'cover', bgOpacity: 50, clockType: 'digital1', pocketClockType: 'digital1', nicoBoost: 1.0,
    baseFontSize: 100, pcLeftWidth: 350, musicMode: false, showClock: true, showThumbnails: true,
    simpleLayoutMode: false, performanceMode: false, dataSaverMode: false,
    customColorEnabled: false, customAccentColor: '#00aaff', customBorderColor: '#ffffff'
};
let appSettings = { ...defaultSettings };

let allItems = [];
let folderSettings = [];
let musicLibrary =[];
let currentFolderId = null;
let currentSortOrder = 'custom';
let currentSearchQuery = "";
let excludeNico = false;

let currentPlaylist =[];
let currentIndex = 0;
let isPlaying = false;
let currentPlayingItem = null;

let ytPlayer = null;
let isTransitioning = false;
let isListVisible = false;

let nicoDuration = 0;
let nicoCurrentTime = 0;
let nicoEndedFlag = false;

let resizeTimer;       
let progressInterval;  

let currentRenderedCount = 0;
const RENDER_CHUNK_SIZE = 50;
let currentRenderSongs =[];

const importScreen = document.getElementById('import-screen');
const readyScreen = document.getElementById('ready-screen');
const mainApp = document.getElementById('main-app');
const folderListEl = document.getElementById('widget-folder-list');
const trackListEl = document.getElementById('widget-track-list');

// 🌟 バックグラウンド維持のための無音オーディオハック
let silentAudio = null;
function setupBackgroundPlayback() {
    if (!silentAudio) {
        const silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        silentAudio = new Audio(silentWav);
        silentAudio.loop = true;
        silentAudio.volume = 0.01;
    }
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') updateProgress();
    });
}
function startSilentAudio() { if (silentAudio && silentAudio.paused) silentAudio.play().catch(e => {}); }
function stopSilentAudio() { if (silentAudio && !silentAudio.paused) silentAudio.pause(); }

// 🌟 IndexedDB (背景画像保存)
const DB_NAME = 'cms_player_db'; const STORE_NAME = 'bg_images';
function saveBgImageToDB(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = e => {
            const base64 = e.target.result;
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = ev => ev.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
            req.onsuccess = ev => {
                const db = ev.target.result; const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put({ id: 'bg1', data: base64 });
                tx.oncomplete = () => { document.documentElement.style.setProperty('--bg-image', `url(${base64})`); resolve(); };
            };
        };
        reader.readAsDataURL(file);
    });
}
function loadBgImageFromDB() {
    return new Promise(resolve => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = ev => ev.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        req.onsuccess = ev => {
            try {
                const tx = ev.target.result.transaction(STORE_NAME, 'readonly');
                const getReq = tx.objectStore(STORE_NAME).get('bg1');
                getReq.onsuccess = () => { if (getReq.result) document.documentElement.style.setProperty('--bg-image', `url(${getReq.result.data})`); resolve(); };
            } catch(err) { resolve(); }
        };
        req.onerror = () => resolve();
    });
}
function clearBgImageDB() {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = ev => { try { ev.target.result.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete('bg1'); document.documentElement.style.setProperty('--bg-image', 'none'); } catch(e){} };
}


document.addEventListener('DOMContentLoaded', async () => {
    loadSettings(); applyThemeSettings();
    await loadBgImageFromDB();
    updateClock(); setInterval(updateClock, 1000); loadYouTubeAPI();

    window.addEventListener('resize', () => { 
        clearTimeout(resizeTimer); 
        resizeTimer = setTimeout(() => {
            scheduleMarqueeUpdate();
            if (window.innerWidth > 900) {
                document.body.classList.remove('player-expanded', 'show-mobile-nav');
            }
        }, 200); 
    });

    trackListEl.addEventListener('scroll', () => { if (trackListEl.scrollTop + trackListEl.clientHeight >= trackListEl.scrollHeight - 100) loadMoreTracks(); });

    const widgetControls = document.getElementById('widget-controls');
    widgetControls.addEventListener('click', (e) => {
        if (window.innerWidth <= 900 && document.body.classList.contains('music-mode')) {
            if (e.target.closest('.controls-main') || e.target.closest('.settings-btn') || e.target.closest('.progress-area') || e.target.closest('#btn-pocket-mode')) return;
            document.body.classList.toggle('player-expanded');
        }
    });
    const widgetArt = document.getElementById('widget-art');
    widgetArt.addEventListener('click', () => { if (document.body.classList.contains('player-expanded')) document.body.classList.remove('player-expanded'); });

    document.getElementById('import-json').addEventListener('change', handleFileImport);
    document.getElementById('btn-user-start').addEventListener('click', startGame);
    document.getElementById('widget-search-box').addEventListener('input', handleSearch);
    document.getElementById('widget-sort-select').addEventListener('change', handleSortChange);
    document.getElementById('exclude-nico').addEventListener('change', handleNicoFilterChange);
    document.getElementById('widget-btn-fullscreen').addEventListener('click', toggleFullscreen);
    document.getElementById('progress-container').addEventListener('click', handleProgressClick);

    document.getElementById('btn-open-mobile-folder').addEventListener('click', () => document.getElementById('mobile-folder-modal').classList.remove('hidden'));
    document.getElementById('btn-close-folder-modal').addEventListener('click', () => document.getElementById('mobile-folder-modal').classList.add('hidden'));
    document.getElementById('btn-toggle-mobile-nav').addEventListener('click', () => document.body.classList.toggle('show-mobile-nav'));
    document.getElementById('btn-toggle-list').addEventListener('click', () => {
        isListVisible = !isListVisible; document.body.classList.toggle('list-visible', isListVisible);
        document.getElementById('toggle-list-text').textContent = isListVisible ? 'リストを隠す' : 'リストを表示'; scheduleMarqueeUpdate();
    });

    setupPlayerControls(); setupSettingsModal(); window.addEventListener('message', handleNicoMessage);
    setupPocketMode();
});

function loadYouTubeAPI() {
    if (!window.YT) { const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api"; document.getElementsByTagName('script')[0].parentNode.insertBefore(tag, document.getElementsByTagName('script')[0]); }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem('cms_player_settings_v16');
        if (saved) { 
            appSettings = { ...defaultSettings, ...JSON.parse(saved) }; 
        } else { 
            const isMobile = window.innerWidth <= 900; 
            if (isMobile) { appSettings.performanceMode = true; appSettings.showClock = false; } 
        }
    } catch (e) { console.error(e); }
}

function saveSettings() { localStorage.setItem('cms_player_settings_v16', JSON.stringify(appSettings)); }

function applyThemeSettings() {
    document.body.className = `theme-${appSettings.theme}`;
    document.body.classList.toggle('music-mode', appSettings.musicMode); document.body.classList.toggle('show-list-thumbnails', appSettings.showThumbnails);
    document.body.classList.toggle('show-clock', appSettings.showClock); document.body.classList.toggle('simple-layout-mode', appSettings.simpleLayoutMode);
    document.body.classList.toggle('performance-mode', appSettings.performanceMode);
    
    if (appSettings.simpleLayoutMode && isListVisible) { document.body.classList.add('list-visible'); document.getElementById('toggle-list-text').textContent = 'リストを隠す'; } 
    else { document.body.classList.remove('list-visible'); document.getElementById('toggle-list-text').textContent = 'リストを表示'; }
    
    document.documentElement.style.setProperty('--base-font-size', `${appSettings.baseFontSize}%`);
    document.documentElement.style.setProperty('--pc-left-width', `${appSettings.pcLeftWidth}px`);
    document.documentElement.style.setProperty('--bg-position', appSettings.bgPosition); 
    document.documentElement.style.setProperty('--bg-size', appSettings.bgSize);
    
    if (appSettings.customColorEnabled) { document.body.style.setProperty('--text-color', appSettings.customAccentColor); document.body.style.setProperty('--accent-color', appSettings.customAccentColor); document.body.style.setProperty('--border-color', appSettings.customBorderColor); } 
    else { document.body.style.removeProperty('--text-color'); document.body.style.removeProperty('--accent-color'); document.body.style.removeProperty('--border-color'); }
    
    // 🌟 透明度計算 (100:透明, 0:ぼかし最大)
    const op = parseFloat(appSettings.bgOpacity); 
    const alpha = (100 - op) / 100;
    const blur = appSettings.performanceMode ? 0 : ((100 - op) / 100 * 20);
    document.documentElement.style.setProperty('--panel-alpha', alpha * 0.8); 
    document.documentElement.style.setProperty('--panel-blur', `${blur}px`);
}

function setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
    });

    document.getElementById('btn-open-settings').onclick = () => {
        document.getElementById('set-theme').value = appSettings.theme;
        document.getElementById('set-font-size').value = appSettings.baseFontSize; document.getElementById('font-val').textContent = appSettings.baseFontSize;
        document.getElementById('set-pc-left-width').value = appSettings.pcLeftWidth; document.getElementById('pc-width-val').textContent = appSettings.pcLeftWidth;
        document.getElementById('set-bg-position').value = appSettings.bgPosition; document.getElementById('set-bg-size').value = appSettings.bgSize;
        document.getElementById('set-opacity').value = appSettings.bgOpacity; document.getElementById('op-val').textContent = appSettings.bgOpacity;
        document.getElementById('set-clock-type').value = appSettings.clockType;
        document.getElementById('set-pocket-clock-type').value = appSettings.pocketClockType || 'digital1';
        document.getElementById('set-nico-boost').value = appSettings.nicoBoost || 1.0; document.getElementById('boost-val').textContent = parseFloat(appSettings.nicoBoost || 1.0).toFixed(1);
        document.getElementById('set-simple-layout').checked = appSettings.simpleLayoutMode; document.getElementById('set-performance-mode').checked = appSettings.performanceMode;
        document.getElementById('set-data-saver').checked = appSettings.dataSaverMode; document.getElementById('set-music-mode').checked = appSettings.musicMode;
        document.getElementById('set-show-clock').checked = appSettings.showClock; document.getElementById('set-show-thumbnails').checked = appSettings.showThumbnails;
        document.getElementById('set-use-custom-color').checked = appSettings.customColorEnabled; document.getElementById('set-accent-color').value = appSettings.customAccentColor;
        document.getElementById('set-border-color').value = appSettings.customBorderColor;
        modal.classList.remove('hidden');
    };

    document.getElementById('set-font-size').oninput = (e) => document.getElementById('font-val').textContent = e.target.value;
    document.getElementById('set-pc-left-width').oninput = (e) => document.getElementById('pc-width-val').textContent = e.target.value;
    document.getElementById('set-opacity').oninput = (e) => document.getElementById('op-val').textContent = e.target.value;
    document.getElementById('set-nico-boost').oninput = (e) => document.getElementById('boost-val').textContent = parseFloat(e.target.value).toFixed(1);

    document.getElementById('btn-close-settings').onclick = () => modal.classList.add('hidden');
    document.getElementById('btn-reset-settings').onclick = () => { if (confirm('設定を初期化してリロードしますか？')) { localStorage.removeItem('cms_player_settings_v16'); clearBgImageDB(); location.reload(); } };
    document.getElementById('btn-clear-bg').onclick = () => { clearBgImageDB(); alert('背景画像をクリアしました。Saveボタンを押してください。'); };

    document.getElementById('btn-save-settings').onclick = async () => {
        appSettings.theme = document.getElementById('set-theme').value; appSettings.baseFontSize = document.getElementById('set-font-size').value;
        appSettings.pcLeftWidth = document.getElementById('set-pc-left-width').value; appSettings.bgPosition = document.getElementById('set-bg-position').value;
        appSettings.bgSize = document.getElementById('set-bg-size').value; appSettings.bgOpacity = document.getElementById('set-opacity').value;
        appSettings.clockType = document.getElementById('set-clock-type').value; appSettings.pocketClockType = document.getElementById('set-pocket-clock-type').value;
        appSettings.nicoBoost = document.getElementById('set-nico-boost').value;
        appSettings.simpleLayoutMode = document.getElementById('set-simple-layout').checked; appSettings.performanceMode = document.getElementById('set-performance-mode').checked;
        appSettings.dataSaverMode = document.getElementById('set-data-saver').checked; appSettings.musicMode = document.getElementById('set-music-mode').checked;
        appSettings.showClock = document.getElementById('set-show-clock').checked; appSettings.showThumbnails = document.getElementById('set-show-thumbnails').checked;
        appSettings.customColorEnabled = document.getElementById('set-use-custom-color').checked; appSettings.customAccentColor = document.getElementById('set-accent-color').value;
        appSettings.customBorderColor = document.getElementById('set-border-color').value;
        
        const fileInput = document.getElementById('set-bg-img');
        if (fileInput.files.length > 0) { await saveBgImageToDB(fileInput.files[0]); }
        
        saveSettings(); applyVolume(); modal.classList.add('hidden'); applyThemeSettings(); updateClock(); scheduleMarqueeUpdate(); 
    };
}

function updateClock() {
    const now = new Date();
    const dStr = now.toLocaleDateString('ja-JP');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${h}:${m}:${s}`;
    const pTimeStr = `${h}:${m}`;
    
    // 通常画面の時計
    if (appSettings.showClock) {
        document.getElementById('clock-date').textContent = dStr;
        document.getElementById('clock-time').textContent = timeStr;
        const timeEl = document.getElementById('clock-time');
        const analogEl = document.getElementById('analog-clock');
        
        if (appSettings.clockType === 'analog') {
            timeEl.classList.add('hidden'); analogEl.classList.remove('hidden');
            const secDeg = now.getSeconds() * 6; const minDeg = now.getMinutes() * 6 + now.getSeconds() / 10; const hourDeg = (now.getHours() % 12) * 30 + now.getMinutes() / 2;
            analogEl.querySelector('.second-hand').style.transform = `rotate(${secDeg}deg)`; analogEl.querySelector('.minute-hand').style.transform = `rotate(${minDeg}deg)`; analogEl.querySelector('.hour-hand').style.transform = `rotate(${hourDeg}deg)`;
        } else {
            timeEl.classList.remove('hidden'); analogEl.classList.add('hidden');
            if (appSettings.clockType === 'digital2') timeEl.classList.add('digital2'); else timeEl.classList.remove('digital2');
        }
    }

    // ポケットモード用の時計
    const pContainer = document.getElementById('pocket-clock-container');
    const pText = document.getElementById('pocket-clock-text');
    const pAnalog = document.getElementById('pocket-analog-clock');
    
    if (appSettings.pocketClockType === 'none') {
        pContainer.classList.add('hidden');
    } else {
        pContainer.classList.remove('hidden');
        if (appSettings.pocketClockType === 'analog') {
            pText.classList.add('hidden'); pAnalog.classList.remove('hidden');
            const secDeg = now.getSeconds() * 6; const minDeg = now.getMinutes() * 6 + now.getSeconds() / 10; const hourDeg = (now.getHours() % 12) * 30 + now.getMinutes() / 2;
            pAnalog.querySelector('.second-hand').style.transform = `rotate(${secDeg}deg)`; pAnalog.querySelector('.minute-hand').style.transform = `rotate(${minDeg}deg)`; pAnalog.querySelector('.hour-hand').style.transform = `rotate(${hourDeg}deg)`;
        } else {
            pText.classList.remove('hidden'); pAnalog.classList.add('hidden'); pText.textContent = pTimeStr;
            if (appSettings.pocketClockType === 'digital2') pText.classList.add('digital2'); else pText.classList.remove('digital2');
        }
    }
}

function updateMarquee() {
    if (appSettings.performanceMode) { document.querySelectorAll('.marquee-content').forEach(c => c.classList.remove('is-marquee')); return; }
    requestAnimationFrame(() => {
        document.querySelectorAll('.marquee-wrapper').forEach(wrapper => {
            const content = wrapper.querySelector('.marquee-content'); if (!content) return;
            if (content.scrollWidth > wrapper.clientWidth + 2) { wrapper.style.setProperty('--parent-width', `${wrapper.clientWidth}px`); content.classList.add('is-marquee'); } 
            else content.classList.remove('is-marquee');
        });
    });
}
function scheduleMarqueeUpdate() { setTimeout(updateMarquee, 100); }

function handleFileImport(event) {
    const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result); const mediaItems = Array.isArray(data) ? data : (data.mediaItems ||[]);
            allItems = mediaItems.filter(i => i.site !== 'system').map((item, idx) => ({ ...item, originalIndex: idx, safeDate: item.savedAt ? new Date(item.savedAt).getTime() : 0, safePlayCount: item.playCount || 0 }));
            folderSettings = data.folderSettings ||[];
            if (allItems.length > 0) { importScreen.classList.add('hidden'); readyScreen.classList.remove('hidden'); buildLibrary(); renderFolders(); selectFolder(musicLibrary[0]?.id || '__all'); } 
            else alert('動画データがありません。');
        } catch (error) { alert('JSONの解析に失敗しました。'); }
    };
    reader.readAsText(file);
}

function startGame() {
    readyScreen.classList.add('hidden');
    setupBackgroundPlayback(); startSilentAudio();
    
    // ブートシーケンスを削除し、すぐにメイン画面へ
    mainApp.classList.remove('hidden'); scheduleMarqueeUpdate(); 
    if (currentFolderId) { const folder = musicLibrary.find(f => f.id === currentFolderId); startPlaylist(folder ? folder.songs : (musicLibrary.find(f => f.id === '__all')?.songs ||[]), 0); }
}

function buildLibrary() {
    let folderMap = {};
    let folderOrder =[]; 

    const itemsToProcess = allItems.filter(item => {
        if (excludeNico && item.site === 'niconico') return false;
        if (currentSearchQuery) { const query = currentSearchQuery.toLowerCase(); return (item.title || "").toLowerCase().includes(query) || (item.tags ||[]).join(' ').toLowerCase().includes(query); }
        return true;
    });

    itemsToProcess.forEach(item => {
        const folders = item.folders && item.folders.length > 0 ? item.folders :[item.folder || 'Manual'];
        folders.forEach(fName => { 
            if (!folderMap[fName]) { folderMap[fName] =[]; folderOrder.push(fName); }
            folderMap[fName].push(item); 
        });
    });

    const folderNames = Object.keys(folderMap).sort((a, b) => {
        const setA = folderSettings.find(s => s.folderName === a); const setB = folderSettings.find(s => s.folderName === b);
        const orderA = setA && typeof setA.order === 'number' ? setA.order : folderOrder.indexOf(a) + 10000;
        const orderB = setB && typeof setB.order === 'number' ? setB.order : folderOrder.indexOf(b) + 10000;
        return orderA - orderB;
    });

    musicLibrary =[ { id: '__all', name: '📚 All', songs: sortSongs(itemsToProcess) }, ...folderNames.map(name => ({ id: name, name: `📁 ${name}`, songs: sortSongs(folderMap[name]) })) ];
}

function sortSongs(songs) {
    return[...songs].sort((a, b) => {
        const safeStr = (s) => s || "";
        switch (currentSortOrder) {
            case 'title_asc': return safeStr(a.title).localeCompare(safeStr(b.title));
            case 'title_desc': return safeStr(b.title).localeCompare(safeStr(a.title));
            case 'newest': return b.safeDate - a.safeDate;
            case 'oldest': return a.safeDate - b.safeDate;
            case 'playCount_desc': return b.safePlayCount - a.safePlayCount;
            case 'custom': default: return a.originalIndex - b.originalIndex;
        }
    });
}

function renderFolders() {
    folderListEl.innerHTML = '';
    const mobileModalListEl = document.getElementById('mobile-folder-list-modal'); if (mobileModalListEl) mobileModalListEl.innerHTML = '';
    musicLibrary.forEach(folder => {
        const div = document.createElement('div'); div.className = 'w-f-item'; div.textContent = folder.name; div.dataset.folderId = folder.id;
        div.title = folder.name; // 全文表示ツールチップ
        div.onclick = () => selectFolder(folder.id); folderListEl.appendChild(div);
        if (mobileModalListEl) {
            const mDiv = document.createElement('div'); mDiv.className = 'm-f-item'; mDiv.dataset.folderId = folder.id;
            mDiv.innerHTML = `<span>${folder.name.replace('📁 ', '').replace('📚 ', '')}</span> <i class="fas fa-music" style="opacity:0.6; font-size:0.9rem;"></i>`;
            mDiv.onclick = () => { selectFolder(folder.id); document.getElementById('mobile-folder-modal').classList.add('hidden'); };
            mobileModalListEl.appendChild(mDiv);
        }
    });
}

function selectFolder(folderId) {
    currentFolderId = folderId;
    document.querySelectorAll('.w-f-item').forEach(el => el.classList.toggle('active', el.dataset.folderId === folderId));
    document.querySelectorAll('.m-f-item').forEach(el => {
        const isActive = el.dataset.folderId === folderId; el.classList.toggle('active', isActive);
        el.innerHTML = isActive ? `<span><i class="fas fa-check" style="margin-right:8px;"></i>${el.textContent.trim()}</span> <i class="fas fa-music"></i>` : `<span>${el.textContent.trim()}</span> <i class="fas fa-music" style="opacity:0.6; font-size:0.9rem;"></i>`;
    });
    const folder = musicLibrary.find(f => f.id === folderId);
    if (folder) {
        document.getElementById('current-folder-name').textContent = folder.name.replace('📁 ', '').replace('📚 ', '');
        document.getElementById('current-folder-count').textContent = `${folder.songs.length}件のアイテム`;
    }
    renderTracks(folder ? folder.songs :[]);
}

function escapeHTML(str) { return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

function renderTracks(songs) {
    trackListEl.innerHTML = ''; trackListEl.scrollTop = 0; currentRenderSongs = songs; currentRenderedCount = 0;
    if (songs.length === 0) { trackListEl.innerHTML = '<div style="padding:20px; text-align:center;">動画がありません</div>'; return; }
    loadMoreTracks();
}

function loadMoreTracks() {
    if (currentRenderedCount >= currentRenderSongs.length) return;
    const fragment = document.createDocumentFragment(); const endIndex = Math.min(currentRenderedCount + RENDER_CHUNK_SIZE, currentRenderSongs.length);
    for (let i = currentRenderedCount; i < endIndex; i++) {
        const song = currentRenderSongs[i]; const div = document.createElement('div'); div.className = 'w-t-item';
        div.title = song.title; // ツールチップ
        div.innerHTML = `
            <span class="w-t-idx">${i + 1}</span><span class="w-t-playing-icon hidden"><i class="fa-solid fa-volume-high"></i></span>
            <img class="w-t-thumb" src="${song.thumbnail || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>"}" loading="lazy">
            <div class="w-t-info overflow-hidden">
                <div class="marquee-wrapper"><span class="track-title-text marquee-content">${escapeHTML(song.title)}</span></div>
                <div class="marquee-wrapper"><span class="track-artist-text marquee-content">${escapeHTML(song.channelName || song.site)}</span></div>
            </div>`;
        div.onclick = () => startPlaylist(currentRenderSongs, i); fragment.appendChild(div);
    }
    trackListEl.appendChild(fragment); currentRenderedCount = endIndex; updateActiveTrackUI(); scheduleMarqueeUpdate();
}

function updateActiveTrackUI() {
    if (currentPlayingItem && currentRenderSongs) { while(currentRenderSongs.findIndex(s => s === currentPlayingItem) >= currentRenderedCount && currentRenderedCount < currentRenderSongs.length) loadMoreTracks(); }
    document.querySelectorAll('.w-t-item').forEach(el => { el.classList.remove('active'); el.querySelector('.w-t-idx').classList.remove('hidden'); el.querySelector('.w-t-playing-icon').classList.add('hidden'); });
    if (currentPlayingItem) {
        const songsInView = Array.from(trackListEl.children); const activeIndex = songsInView.findIndex(el => { const t = el.querySelector('.track-title-text'); return t && t.textContent === currentPlayingItem.title; });
        if (activeIndex > -1) {
            const activeEl = songsInView[activeIndex]; activeEl.classList.add('active'); activeEl.querySelector('.w-t-idx').classList.add('hidden'); activeEl.querySelector('.w-t-playing-icon').classList.remove('hidden');
            setTimeout(() => {
                const cTop = trackListEl.scrollTop; const cHeight = trackListEl.clientHeight; const eTop = activeEl.offsetTop; const eHeight = activeEl.clientHeight;
                if (eTop < cTop || eTop + eHeight > cTop + cHeight) trackListEl.scrollTo({ top: eTop - (cHeight / 2) + (eHeight / 2), behavior: 'smooth' });
            }, 150);
        }
    }
}

function handleSearch(e) { currentSearchQuery = e.target.value; buildLibrary(); renderFolders(); selectFolder(currentFolderId || musicLibrary[0]?.id); }
function handleSortChange(e) { currentSortOrder = e.target.value; buildLibrary(); selectFolder(currentFolderId || musicLibrary[0]?.id); }
function handleNicoFilterChange(e) { excludeNico = e.target.checked; buildLibrary(); renderFolders(); selectFolder(currentFolderId || musicLibrary[0]?.id); }

function setupPlayerControls() {
    document.getElementById('widget-btn-play').onclick = () => togglePlay();
    document.getElementById('widget-btn-next').onclick = playNextVideo;
    document.getElementById('widget-btn-prev').onclick = playPrevVideo;
}

function toggleFullscreen() {
    const playerWidget = document.getElementById('widget-player'); 
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (playerWidget.requestFullscreen) playerWidget.requestFullscreen();
        else if (playerWidget.webkitRequestFullscreen) playerWidget.webkitRequestFullscreen();
        else document.body.classList.toggle('pseudo-fullscreen');
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else document.body.classList.remove('pseudo-fullscreen');
    }
}

function applyVolume() {
    let boost = parseFloat(appSettings.nicoBoost) || 1.0;
    // ブースト倍率に従って、YouTubeの音量を下げる（相対的にニコニコを大きくする）
    let ytVol = Math.max(10, Math.floor(100 / boost)); 

    if (currentPlayingItem && currentPlayingItem.site === 'youtube' && ytPlayer && typeof ytPlayer.setVolume === 'function') {
        ytPlayer.setVolume(ytVol);
    }
    if (currentPlayingItem && currentPlayingItem.site === 'niconico') {
        const nicoIframe = document.getElementById('nico-player');
        if (nicoIframe && nicoIframe.contentWindow) {
            nicoIframe.contentWindow.postMessage({ sourceConnectorType: 1, playerId: "1", eventName: "volumeChange", data: { volume: 1 } }, 'https://embed.nicovideo.jp');
        }
    }
}

function startProgressTimer() { clearInterval(progressInterval); progressInterval = setInterval(updateProgress, 1000); }
function stopProgressTimer() { clearInterval(progressInterval); }

function updateProgress() {
    if (!isPlaying) return; let current = 0; let duration = 0;
    
    if (currentPlayingItem.site === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
        current = ytPlayer.getCurrentTime(); duration = ytPlayer.getDuration();
    } else if (currentPlayingItem.site === 'niconico') {
        nicoCurrentTime += 1; current = nicoCurrentTime; duration = nicoDuration;
        if (duration > 0 && current >= duration + 2 && !nicoEndedFlag) { nicoEndedFlag = true; stopProgressTimer(); playNextVideo(); return; }
    } else return;

    if (duration > 0) {
        const pct = (current / duration) * 100;
        document.getElementById('progress-bar').style.width = `${pct}%`;
        document.getElementById('pocket-progress-bar').style.width = `${pct}%`;
        document.getElementById('time-current').textContent = formatTime(current); document.getElementById('time-duration').textContent = formatTime(duration);
        document.getElementById('pocket-time-current').textContent = formatTime(current); document.getElementById('pocket-time-duration').textContent = formatTime(duration);
    }
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60); return `${m}:${s.toString().padStart(2, '0')}`;
}

function handleProgressClick(e) {
    if (!currentPlayingItem || !ytPlayer || currentPlayingItem.site !== 'youtube' || typeof ytPlayer.getDuration !== 'function') return;
    const rect = e.target.getBoundingClientRect(); const pos = (e.clientX - rect.left) / rect.width;
    const duration = ytPlayer.getDuration(); if (duration > 0) { ytPlayer.seekTo(duration * pos, true); updateProgress(); }
}

function startPlaylist(items, startIndex = 0) { if (items.length === 0) return; currentPlaylist = items; currentIndex = startIndex; loadVideo(currentIndex); }
function playNextVideo() { if (currentPlaylist.length === 0 || isTransitioning) return; isTransitioning = true; setTimeout(() => { isTransitioning = false; }, 1000); currentIndex = (currentIndex + 1) % currentPlaylist.length; loadVideo(currentIndex); }
function playPrevVideo() { if (currentPlaylist.length === 0 || isTransitioning) return; isTransitioning = true; setTimeout(() => { isTransitioning = false; }, 1000); currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length; loadVideo(currentIndex); }

function getYouTubeId(url) { try { const urlObj = new URL(url); return urlObj.searchParams.get('v') || url.split('/').pop(); } catch(e) { const match = url.match(/[?&]v=([^&]+)/); return match ? match[1] : url.split('/').pop(); } }
function getNicoId(url) { return url.split('?')[0].split('/').pop(); }

function createYouTubePlayer(videoId) {
    if (window.YT && window.YT.Player) {
        ytPlayer = new YT.Player('yt-player-mount', {
            height: '100%', width: '100%', videoId: videoId, playerVars: { 'playsinline': 1, 'autoplay': 1, 'rel': 0 },
            events: { 
                'onReady': (e) => { 
                    if(appSettings.dataSaverMode && typeof e.target.setPlaybackQuality === 'function') e.target.setPlaybackQuality('tiny'); 
                    isPlaying = true; updatePlayPauseIcon(); applyVolume(); startProgressTimer(); startSilentAudio(); 
                },
                'onStateChange': onPlayerStateChange, 'onError': () => { setTimeout(playNextVideo, 5000); }
            }
        });
    } else setTimeout(() => createYouTubePlayer(videoId), 1000);
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) { 
        isPlaying = true; updatePlayPauseIcon(); applyVolume(); startProgressTimer(); startSilentAudio(); 
    } 
    else if (event.data === YT.PlayerState.PAUSED) { 
        isPlaying = false; updatePlayPauseIcon(); stopProgressTimer(); stopSilentAudio(); 
    } 
    else if (event.data === YT.PlayerState.ENDED) { 
        stopProgressTimer(); document.getElementById('progress-bar').style.width = '0%'; playNextVideo(); 
    }
}

function loadVideo(index) {
    if (index < 0 || index >= currentPlaylist.length) return;
    currentIndex = index; isTransitioning = false; currentPlayingItem = currentPlaylist[index]; isPlaying = true;
    nicoDuration = 0; nicoCurrentTime = 0; nicoEndedFlag = false;

    updatePlayerUI(currentPlayingItem); updateActiveTrackUI();
    document.getElementById('progress-bar').style.width = '0%'; document.getElementById('pocket-progress-bar').style.width = '0%'; document.getElementById('time-current').textContent = '0:00'; document.getElementById('time-duration').textContent = '0:00'; stopProgressTimer();

    const container = document.getElementById('player-container');
    if (currentPlayingItem.site === 'youtube') {
        const videoId = getYouTubeId(currentPlayingItem.url);
        if (container.querySelector('#nico-player') || container.querySelector('iframe')) { container.innerHTML = '<div id="yt-player-mount"></div>'; ytPlayer = null; }
        if (!ytPlayer) { container.innerHTML = '<div id="yt-player-mount"></div>'; createYouTubePlayer(videoId); } 
        else { if (typeof ytPlayer.loadVideoById === 'function') ytPlayer.loadVideoById(videoId); else { container.innerHTML = '<div id="yt-player-mount"></div>'; createYouTubePlayer(videoId); } }
    } else {
        if (ytPlayer) { try { ytPlayer.destroy(); } catch(e){} ytPlayer = null; }
        container.innerHTML = ''; 
        if (currentPlayingItem.site === 'niconico') {
            const nicoId = getNicoId(currentPlayingItem.url);
            setTimeout(() => {
                const iframe = document.createElement('iframe'); iframe.id = 'nico-player';
                iframe.src = `https://embed.nicovideo.jp/watch/${nicoId}?jsapi=1&playerId=1&loop=0`; iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
                iframe.style.width = '100%'; iframe.style.height = '100%'; iframe.style.border = 'none'; container.appendChild(iframe);
            }, 50);
        } else { container.innerHTML = `<iframe src="${currentPlayingItem.url}" allowfullscreen allow="autoplay" style="width:100%; height:100%; border:none;"></iframe>`; }
    }
}

function handleNicoMessage(e) {
    if (e.origin !== 'https://embed.nicovideo.jp' || !currentPlayingItem || currentPlayingItem.site !== 'niconico' || !e.data || !e.data.eventName) return;
    const eventName = e.data.eventName; const data = e.data.data;
    if (eventName === 'loadComplete') {
        const nicoIframe = document.getElementById('nico-player');
        if (nicoIframe && nicoIframe.contentWindow) { 
            setTimeout(() => { 
                nicoIframe.contentWindow.postMessage({ sourceConnectorType: 1, playerId: "1", eventName: "play" }, 'https://embed.nicovideo.jp');
                applyVolume();
                startProgressTimer(); startSilentAudio(); 
            }, 150); 
        }
    } else if (eventName === 'playerMetadataChange') { if (data && data.duration) nicoDuration = data.duration / 1000;
    } else if (eventName === 'playerPlayTimeChange') { if (data && data.playTime) nicoCurrentTime = data.playTime / 1000;
    } else if (eventName === 'playerStatusChange') {
        const status = data.playerStatus;
        if (status === 4 && !nicoEndedFlag) { 
            nicoEndedFlag = true; playNextVideo(); 
        } 
        else if (status === 2) { 
            isPlaying = true; updatePlayPauseIcon(); applyVolume(); startProgressTimer(); startSilentAudio(); 
        } 
        else if (status === 3) { 
            isPlaying = false; updatePlayPauseIcon(); stopProgressTimer(); stopSilentAudio(); 
        }
    } else if (eventName === 'error') setTimeout(() => playNextVideo(), 5000);
}

function togglePlay(forcePlay) {
    if (!currentPlayingItem) return;
    if (typeof forcePlay === 'boolean') isPlaying = forcePlay; else isPlaying = !isPlaying;

    updatePlayPauseIcon();
    
    if (isPlaying) { startProgressTimer(); startSilentAudio(); applyVolume(); } 
    else { stopProgressTimer(); stopSilentAudio(); }
    
    if (currentPlayingItem.site === 'youtube' && ytPlayer && typeof ytPlayer.playVideo === 'function') {
        if (isPlaying) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
    } else if (currentPlayingItem.site === 'niconico') {
        const nicoIframe = document.getElementById('nico-player');
        if (nicoIframe && nicoIframe.contentWindow) nicoIframe.contentWindow.postMessage({ sourceConnectorType: 1, playerId: "1", eventName: isPlaying ? "play" : "pause" }, 'https://embed.nicovideo.jp');
    }
}

function updatePlayerUI(item) {
    document.getElementById('widget-title').textContent = item.title; document.getElementById('widget-artist').textContent = item.channelName || item.site;
    document.getElementById('pocket-title').textContent = item.title;
    
    const thumb = item.thumbnail || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>";
    document.getElementById('widget-art').src = thumb; 
    document.getElementById('pocket-art').src = thumb;
    updatePlayPauseIcon(); scheduleMarqueeUpdate(); 

    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.channelName || item.site, artwork:[{ src: thumb, sizes: '512x512', type: 'image/jpeg' }] });
        navigator.mediaSession.setActionHandler('play', () => togglePlay(true)); 
        navigator.mediaSession.setActionHandler('pause', () => togglePlay(false));
        navigator.mediaSession.setActionHandler('previoustrack', playPrevVideo); 
        navigator.mediaSession.setActionHandler('nexttrack', playNextVideo);
    }
}

function updatePlayPauseIcon() {
    const icon = document.getElementById('widget-play-icon'); icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
}

// 🌟 ポケットモード (画面ロック・うっすら表示) の処理
function setupPocketMode() {
    const pOverlay = document.getElementById('pocket-overlay');
    
    document.getElementById('btn-pocket-mode').addEventListener('click', () => {
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
        pOverlay.classList.remove('hidden');
    });

    let holdTimer = null;
    let touchStartY = 0;

    function startHold(e) {
        pOverlay.classList.add('touch-holding'); // 情報をフェードイン
        if (e && e.touches) touchStartY = e.touches[0].clientY;
        holdTimer = setTimeout(() => {
            unlock();
        }, 2000); // 2秒長押しで解除
    }
    
    function endHold() {
        pOverlay.classList.remove('touch-holding'); // 情報をフェードアウト
        clearTimeout(holdTimer);
    }

    function unlock() {
        if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen();
        else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
        pOverlay.classList.add('hidden');
        pOverlay.classList.remove('touch-holding');
        clearTimeout(holdTimer);
    }

    pOverlay.addEventListener('mousedown', startHold);
    pOverlay.addEventListener('mouseup', endHold);
    pOverlay.addEventListener('mouseleave', endHold);
    
    pOverlay.addEventListener('touchstart', startHold, {passive: true});
    pOverlay.addEventListener('touchend', endHold, {passive: true});
    pOverlay.addEventListener('touchcancel', endHold, {passive: true});
    
    pOverlay.addEventListener('touchmove', (e) => {
        if (touchStartY && (touchStartY - e.touches[0].clientY > 80)) unlock(); // 上スワイプで解除
    }, {passive: true});

    pOverlay.addEventListener('contextmenu', e => e.preventDefault());
}
// --- Settings State ---
const defaultSettings = {
    theme: 'modern',
    bgImage: '',
    bgOpacity: 0.5,
    bootSound: '',
    standbyMode: 'off',
    standbyImage: ''
};
let appSettings = { ...defaultSettings };

// --- Global State ---
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

// Boot Screen / Clock timeouts
let bootTimeoutId;
let toyotaStepTimeoutId;
let clockIntervalId = null;

// --- DOM Elements ---
const importScreen = document.getElementById('import-screen');
const readyScreen = document.getElementById('ready-screen');
const bootScreen = document.getElementById('boot-screen');
const mainApp = document.getElementById('main-app');
const importJsonInput = document.getElementById('import-json');
const btnUserStart = document.getElementById('btn-user-start');

const folderListEl = document.getElementById('widget-folder-list');
const trackListEl = document.getElementById('widget-track-list');
const searchBox = document.getElementById('widget-search-box');
const sortSelect = document.getElementById('widget-sort-select');
const nicoCheckbox = document.getElementById('exclude-nico');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    applyThemeSettings();

    importJsonInput.addEventListener('change', handleFileImport);
    btnUserStart.addEventListener('click', startGame);
    searchBox.addEventListener('input', handleSearch);
    sortSelect.addEventListener('change', handleSortChange);
    nicoCheckbox.addEventListener('change', handleNicoFilterChange);
    
    // タブレットUI時のアコーディオン(flex伸縮)イベントとスクロール調整
    setupTabletAccordion();
    setupSearchFocus();

    setupPlayerControls();
    setupSettingsModal();
    
    window.addEventListener('message', handleNicoMessage);
});

// --- Focus & Layout Tweaks ---
function setupTabletAccordion() {
    folderListEl.addEventListener('click', () => {
        if (window.innerWidth > 900) {
            folderListEl.classList.add('flex-expand');
            folderListEl.classList.remove('flex-shrink');
            trackListEl.classList.add('flex-shrink');
            trackListEl.classList.remove('flex-expand');
        }
    });
    trackListEl.addEventListener('click', () => {
        if (window.innerWidth > 900) {
            trackListEl.classList.add('flex-expand');
            trackListEl.classList.remove('flex-shrink');
            folderListEl.classList.add('flex-shrink');
            folderListEl.classList.remove('flex-expand');
        }
    });
}

function setupSearchFocus() {
    // 検索にフォーカス時、全体を画面内に移し合わせるための工夫
    searchBox.addEventListener('focus', () => {
        if (window.innerWidth <= 900) {
            searchBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

// --- Settings Management ---
function loadSettings() {
    try {
        const saved = localStorage.getItem('cms_player_settings_v4');
        if (saved) appSettings = { ...defaultSettings, ...JSON.parse(saved) };
    } catch (e) { console.error("設定読み込みエラー", e); }
}

function saveSettings() {
    localStorage.setItem('cms_player_settings_v4', JSON.stringify(appSettings));
}

function applyThemeSettings() {
    document.body.className = `theme-${appSettings.theme}`;
    
    if (appSettings.bgImage) {
        document.documentElement.style.setProperty('--bg-image', `url(${appSettings.bgImage})`);
    } else {
        document.documentElement.style.setProperty('--bg-image', 'none');
    }
    // バグ修正: --user-opacity ではなく --panel-alpha を使用
    document.documentElement.style.setProperty('--panel-alpha', appSettings.bgOpacity);

    // スタンバイモードの適用
    const standbyArea = document.getElementById('standby-area');
    const clockEl = document.getElementById('standby-clock');
    const imgEl = document.getElementById('standby-img');

    if (appSettings.standbyMode === 'off') {
        standbyArea.classList.add('hidden');
        if (clockIntervalId) { clearInterval(clockIntervalId); clockIntervalId = null; }
    } else {
        standbyArea.classList.remove('hidden');
        if (appSettings.standbyMode === 'clock') {
            clockEl.classList.remove('hidden');
            imgEl.classList.add('hidden');
            if (!clockIntervalId) {
                const updateClock = () => {
                    const now = new Date();
                    clockEl.textContent = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                };
                updateClock();
                clockIntervalId = setInterval(updateClock, 1000);
            }
        } else if (appSettings.standbyMode === 'image') {
            clockEl.classList.add('hidden');
            imgEl.classList.remove('hidden');
            imgEl.src = appSettings.standbyImage || '';
            if (clockIntervalId) { clearInterval(clockIntervalId); clockIntervalId = null; }
        }
    }
}

// --- Image Resizer ---
function resizeAndSaveImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1920; const MAX_HEIGHT = 1080;
            let width = img.width; let height = img.height;
            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.6));
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

// --- Settings Modal Handlers ---
function setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    
    document.getElementById('btn-open-settings').onclick = () => {
        document.getElementById('set-theme').value = appSettings.theme;
        document.getElementById('set-opacity').value = appSettings.bgOpacity;
        document.getElementById('op-val').textContent = appSettings.bgOpacity;
        document.getElementById('set-standby-mode').value = appSettings.standbyMode;
        modal.classList.remove('hidden');
    };

    document.getElementById('set-opacity').oninput = (e) => {
        document.getElementById('op-val').textContent = e.target.value;
        document.documentElement.style.setProperty('--panel-alpha', e.target.value);
    };

    document.getElementById('btn-close-settings').onclick = () => {
        modal.classList.add('hidden');
        applyThemeSettings();
    };

    document.getElementById('btn-reset-settings').onclick = () => {
        if (confirm('設定をすべて初期化してリロードしますか？')) {
            localStorage.removeItem('cms_player_settings_v4');
            location.reload();
        }
    };

    // 背景画像
    document.getElementById('set-bg-img').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        resizeAndSaveImage(file, (base64) => {
            appSettings.bgImage = base64;
            applyThemeSettings();
        });
    };
    document.getElementById('btn-clear-bg').onclick = () => {
        appSettings.bgImage = ''; document.getElementById('set-bg-img').value = ''; applyThemeSettings();
    };

    // スタンバイ画像
    document.getElementById('set-standby-img').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        resizeAndSaveImage(file, (base64) => {
            appSettings.standbyImage = base64;
            if (appSettings.standbyMode === 'image') applyThemeSettings();
        });
    };
    document.getElementById('btn-clear-standby').onclick = () => {
        appSettings.standbyImage = ''; document.getElementById('set-standby-img').value = ''; applyThemeSettings();
    };

    // 起動音
    document.getElementById('set-boot-sound').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = (ev) => appSettings.bootSound = ev.target.result;
        r.readAsDataURL(file);
    };
    document.getElementById('btn-clear-sound').onclick = () => {
        appSettings.bootSound = ''; document.getElementById('set-boot-sound').value = '';
    };

    document.getElementById('btn-save-settings').onclick = () => {
        appSettings.theme = document.getElementById('set-theme').value;
        appSettings.bgOpacity = document.getElementById('set-opacity').value;
        appSettings.standbyMode = document.getElementById('set-standby-mode').value;
        saveSettings();
        modal.classList.add('hidden');
        applyThemeSettings();
    };
}

// --- Boot Sequence & Start ---
function startGame() {
    readyScreen.classList.add('hidden');
    
    bootScreen.classList.remove('hidden');
    document.querySelectorAll('.boot-container').forEach(el => el.classList.add('hidden'));
    
    const activeBoot = document.querySelector(`.boot-${appSettings.theme}`);
    if (activeBoot) activeBoot.classList.remove('hidden');

    // 起動音再生
    if (appSettings.bootSound) {
        const audio = new Audio(appSettings.bootSound);
        audio.volume = 0.5; audio.play().catch(e => console.warn("Boot Sound Play Error:", e));
    }

    if (appSettings.theme === 'toyota') {
        const logo = activeBoot.querySelector('.toyota-logo');
        const warning = activeBoot.querySelector('.toyota-warning');
        logo.classList.remove('hidden-step');
        warning.classList.add('hidden-step');
        
        toyotaStepTimeoutId = setTimeout(() => {
            logo.classList.add('hidden-step');
            warning.classList.remove('hidden-step');
        }, 1500);
    }

    bootScreen.onclick = endBootSequence;
    bootTimeoutId = setTimeout(endBootSequence, 4000);
}

function endBootSequence() {
    clearTimeout(bootTimeoutId);
    clearTimeout(toyotaStepTimeoutId);
    bootScreen.onclick = null;

    bootScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    
    if (currentFolderId) {
        const folder = musicLibrary.find(f => f.id === currentFolderId);
        const songs = folder ? folder.songs :[];
        if (songs.length > 0) startPlaylist(songs, 0);
        else startPlaylist(musicLibrary.find(f=>f.id==='__all')?.songs ||[], 0);
    }
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const mediaItems = Array.isArray(data) ? data : (data.mediaItems ||[]);
            allItems = mediaItems.filter(i => i.site !== 'system');
            folderSettings = data.folderSettings ||[];
            if (allItems.length > 0) {
                importScreen.classList.add('hidden');
                readyScreen.classList.remove('hidden');
                buildLibrary(); renderFolders(); selectFolder(musicLibrary[0]?.id || '__all');
            } else alert('動画データがありません。');
        } catch (error) { alert('JSONの解析に失敗しました。'); }
    };
    reader.readAsText(file);
}

// --- Data Processing & Library Building ---
function buildLibrary() {
    let folderMap = {};
    const itemsToProcess = allItems.filter(item => {
        if (excludeNico && item.site === 'niconico') return false;
        if (currentSearchQuery) {
            const query = currentSearchQuery.toLowerCase();
            const title = (item.title || "").toLowerCase();
            const tags = (item.tags ||[]).join(' ').toLowerCase();
            return title.includes(query) || tags.includes(query);
        }
        return true;
    });

    itemsToProcess.forEach(item => {
        const folders = item.folders && item.folders.length > 0 ? item.folders : [item.folder || 'Manual'];
        folders.forEach(fName => {
            if (!folderMap[fName]) folderMap[fName] =[];
            folderMap[fName].push(item);
        });
    });

    const folderNames = Object.keys(folderMap);
    folderNames.sort((a, b) => {
        const settingA = folderSettings.find(s => s.folderName === a);
        const settingB = folderSettings.find(s => s.folderName === b);
        const orderA = (settingA && typeof settingA.order === 'number') ? settingA.order : 9999;
        const orderB = (settingB && typeof settingB.order === 'number') ? settingB.order : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b, 'ja');
    });

    musicLibrary =[
        { id: '__all', name: '📚 すべての動画', songs: sortSongs(itemsToProcess) },
        ...folderNames.map(name => ({ id: name, name: `📁 ${name}`, songs: sortSongs(folderMap[name]) }))
    ];
}

function sortSongs(songs) {
    return [...songs].sort((a, b) => {
        const safeStr = (s) => s || "";
        const getTime = (d) => d ? new Date(d).getTime() : 0;
        switch (currentSortOrder) {
            case 'title_asc': return safeStr(a.title).localeCompare(safeStr(b.title));
            case 'title_desc': return safeStr(b.title).localeCompare(safeStr(a.title));
            case 'newest': return getTime(b.savedAt) - getTime(a.savedAt);
            case 'oldest': return getTime(a.savedAt) - getTime(b.savedAt);
            case 'playCount_desc': return (b.playCount || 0) - (a.playCount || 0);
            case 'custom': default: return (a.order ?? getTime(a.savedAt)) - (b.order ?? getTime(b.savedAt));
        }
    });
}

// --- UI Rendering ---
function renderFolders() {
    folderListEl.innerHTML = '';
    musicLibrary.forEach(folder => {
        const div = document.createElement('div');
        div.className = 'w-f-item'; div.textContent = folder.name; div.dataset.folderId = folder.id;
        div.onclick = () => selectFolder(folder.id);
        folderListEl.appendChild(div);
    });
}

function selectFolder(folderId) {
    currentFolderId = folderId;
    document.querySelectorAll('.w-f-item').forEach(el => {
        const isActive = el.dataset.folderId === folderId;
        el.classList.toggle('active', isActive);
        if (isActive && window.innerWidth <= 900) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
    const folder = musicLibrary.find(f => f.id === folderId);
    renderTracks(folder ? folder.songs :[]);
}

function renderTracks(songs) {
    trackListEl.innerHTML = ''; trackListEl.scrollTop = 0;
    if (songs.length === 0) { trackListEl.innerHTML = '<div style="padding:20px; text-align:center;">動画がありません</div>'; return; }

    songs.forEach((song, index) => {
        const div = document.createElement('div');
        div.className = 'w-t-item';
        
        let tagsHtml = '';
        if (song.tags && song.tags.length > 0) {
            tagsHtml = '<div class="track-tags">';
            song.tags.forEach(tag => {
                tagsHtml += `<span class="tag-badge" onclick="event.stopPropagation(); executeTagSearch('${escapeHTML(tag)}')">${escapeHTML(tag)}</span>`;
            });
            tagsHtml += '</div>';
        }

        div.innerHTML = `
            <span class="w-t-idx">${index + 1}</span>
            <span class="w-t-playing-icon hidden"><i class="fa-solid fa-volume-high"></i></span>
            <div class="track-info">
                <span class="track-title-text" title="${escapeHTML(song.title)}">${escapeHTML(song.title)}</span>
                ${tagsHtml}
            </div>`;
        
        div.onclick = () => startPlaylist(songs, index);
        trackListEl.appendChild(div);
    });
    updateActiveTrackUI();
}

function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function updateActiveTrackUI() {
    document.querySelectorAll('.w-t-item').forEach(el => {
        el.classList.remove('active');
        el.querySelector('.w-t-idx').classList.remove('hidden');
        el.querySelector('.w-t-playing-icon').classList.add('hidden');
    });

    if (currentPlayingItem) {
        const songsInView = Array.from(trackListEl.children);
        const activeIndex = songsInView.findIndex(el => {
            const titleEl = el.querySelector('.track-title-text');
            return titleEl && titleEl.textContent === currentPlayingItem.title;
        });
        if (activeIndex > -1) {
            const activeEl = songsInView[activeIndex];
            activeEl.classList.add('active');
            activeEl.querySelector('.w-t-idx').classList.add('hidden');
            activeEl.querySelector('.w-t-playing-icon').classList.remove('hidden');
            activeEl.scrollIntoView({ behavior: 'smooth', block: window.innerWidth <= 900 ? 'center' : 'nearest' });
        }
    }
}

// --- Event Handlers ---
function handleSearch(e) { currentSearchQuery = e.target.value; buildLibrary(); renderFolders(); selectFolder(currentFolderId || musicLibrary[0]?.id); }
function handleSortChange(e) { currentSortOrder = e.target.value; buildLibrary(); selectFolder(currentFolderId || musicLibrary[0]?.id); }
function handleNicoFilterChange(e) { excludeNico = e.target.checked; buildLibrary(); renderFolders(); selectFolder(currentFolderId || musicLibrary[0]?.id); }

// タグ検索のショートカット関数
window.executeTagSearch = function(tag) {
    currentSearchQuery = tag;
    searchBox.value = tag;
    buildLibrary();
    renderFolders();
    selectFolder(currentFolderId || musicLibrary[0]?.id);
    // スクロールをトップに戻して移し合わせる
    trackListEl.scrollTop = 0;
    searchBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// --- Player Logic ---
function setupPlayerControls() {
    document.getElementById('widget-btn-play').onclick = togglePlay;
    document.getElementById('widget-btn-next').onclick = playNextVideo;
    document.getElementById('widget-btn-prev').onclick = playPrevVideo;
}

function startPlaylist(items, startIndex = 0) {
    if (items.length === 0) return;
    currentPlaylist = items; currentIndex = startIndex; loadVideo(currentIndex);
}

function playNextVideo() {
    if (currentPlaylist.length === 0 || isTransitioning) return;
    isTransitioning = true; setTimeout(() => { isTransitioning = false; }, 1000);
    currentIndex = (currentIndex + 1) % currentPlaylist.length;
    loadVideo(currentIndex);
}

function playPrevVideo() {
    if (currentPlaylist.length === 0 || isTransitioning) return;
    isTransitioning = true; setTimeout(() => { isTransitioning = false; }, 1000);
    currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    loadVideo(currentIndex);
}

function loadVideo(index) {
    if (index < 0 || index >= currentPlaylist.length) return;
    currentIndex = index; isTransitioning = false;
    const item = currentPlaylist[index];
    currentPlayingItem = item; isPlaying = true;
    
    updatePlayerUI(item);
    updateActiveTrackUI();

    const container = document.getElementById('player-container');

    if (item.site === 'youtube') {
        const videoId = getYouTubeId(item.url);
        if (container.querySelector('#nico-player') || container.querySelector('iframe')) {
            container.innerHTML = '<div id="yt-player-mount"></div>'; ytPlayer = null; 
        }
        if (!ytPlayer) {
            container.innerHTML = '<div id="yt-player-mount"></div>'; createYouTubePlayer(videoId);
        } else {
            if (typeof ytPlayer.loadVideoById === 'function') ytPlayer.loadVideoById(videoId);
            else { container.innerHTML = '<div id="yt-player-mount"></div>'; createYouTubePlayer(videoId); }
        }
    } else {
        if (ytPlayer) { try { ytPlayer.destroy(); } catch(e){} ytPlayer = null; }
        container.innerHTML = ''; 
        
        if (item.site === 'niconico') {
            const nicoId = getNicoId(item.url);
            setTimeout(() => {
                const iframe = document.createElement('iframe');
                iframe.id = 'nico-player';
                iframe.src = `https://embed.nicovideo.jp/watch/${nicoId}?jsapi=1&playerId=1`;
                iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
                iframe.style.width = '100%'; iframe.style.height = '100%'; iframe.style.border = 'none';
                container.appendChild(iframe);
            }, 50);
        } else {
            container.innerHTML = `<iframe src="${item.url}" allowfullscreen allow="autoplay" style="width:100%; height:100%; border:none;"></iframe>`;
        }
    }
}

function getYouTubeId(url) {
    try { const urlObj = new URL(url); return urlObj.searchParams.get('v') || url.split('/').pop(); } 
    catch(e) { const match = url.match(/[?&]v=([^&]+)/); if(match) return match[1]; return url.split('/').pop(); }
}

function getNicoId(url) {
    try { const urlObj = new URL(url); return urlObj.pathname.split('/').pop(); } 
    catch(e) { return url.split('?')[0].split('/').pop(); }
}

function createYouTubePlayer(videoId) {
    if (typeof YT !== 'undefined' && YT.Player) {
        ytPlayer = new YT.Player('yt-player-mount', {
            height: '100%', width: '100%', videoId: videoId,
            playerVars: { 'playsinline': 1, 'autoplay': 1, 'rel': 0 },
            events: { 
                'onReady': () => { isPlaying = true; updatePlayPauseIcon(); },
                'onStateChange': onPlayerStateChange,
                'onError': (e) => { setTimeout(playNextVideo, 5000); }
            }
        });
    } else setTimeout(() => createYouTubePlayer(videoId), 500);
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) { isPlaying = true; updatePlayPauseIcon(); } 
    else if (event.data === YT.PlayerState.PAUSED) { isPlaying = false; updatePlayPauseIcon(); } 
    else if (event.data === YT.PlayerState.ENDED) playNextVideo(); 
}

function handleNicoMessage(e) {
    if (e.origin !== 'https://embed.nicovideo.jp' || !currentPlayingItem || currentPlayingItem.site !== 'niconico' || !e.data || !e.data.eventName) return;
    const eventName = e.data.eventName;
    if (eventName === 'loadComplete') {
        const nicoIframe = document.getElementById('nico-player');
        if (nicoIframe && nicoIframe.contentWindow) {
            setTimeout(() => { nicoIframe.contentWindow.postMessage({ sourceConnectorType: 1, playerId: "1", eventName: "play" }, 'https://embed.nicovideo.jp'); }, 150);
        }
    } else if (eventName === 'playerStatusChange') {
        const status = e.data.data.playerStatus;
        if (status === 4) playNextVideo(); 
        else if (status === 2) { isPlaying = true; updatePlayPauseIcon(); } 
        else if (status === 3) { isPlaying = false; updatePlayPauseIcon(); }
    } else if (eventName === 'error') setTimeout(() => playNextVideo(), 5000);
}

function togglePlay() {
    if (!currentPlayingItem) return;
    isPlaying = !isPlaying; updatePlayPauseIcon();
    if (currentPlayingItem.site === 'youtube' && ytPlayer && typeof ytPlayer.playVideo === 'function') {
        if (isPlaying) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
    } else if (currentPlayingItem.site === 'niconico') {
        const nicoIframe = document.getElementById('nico-player');
        if (nicoIframe && nicoIframe.contentWindow) nicoIframe.contentWindow.postMessage({ sourceConnectorType: 1, playerId: "1", eventName: isPlaying ? "play" : "pause" }, 'https://embed.nicovideo.jp');
    }
}

function updatePlayerUI(item) {
    document.getElementById('widget-title').textContent = item.title;
    document.getElementById('widget-artist').textContent = item.channelName || item.site;
    const thumb = item.thumbnail || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>";
    document.getElementById('widget-art').src = thumb;
    updatePlayPauseIcon();

    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: item.title, artist: item.channelName || item.site,
            artwork:[{ src: thumb, sizes: '512x512', type: 'image/jpeg' }, { src: thumb, sizes: '256x256', type: 'image/jpeg' }]
        });
        navigator.mediaSession.setActionHandler('play', togglePlay);
        navigator.mediaSession.setActionHandler('pause', togglePlay);
        navigator.mediaSession.setActionHandler('previoustrack', playPrevVideo);
        navigator.mediaSession.setActionHandler('nexttrack', playNextVideo);
    }
}

function updatePlayPauseIcon() {
    const icon = document.getElementById('widget-play-icon');
    icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
}

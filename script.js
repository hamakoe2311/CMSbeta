// --- Global State ---
let allItems =[];
let folderSettings =[];
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
let nicoEndTimer = null; // ニコニコ動画の終了タイマー
let isTransitioning = false; // 連続スキップによるバグ防止用フラグ

// --- DOM Elements ---
const importScreen = document.getElementById('import-screen');
const readyScreen = document.getElementById('ready-screen');
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
    importJsonInput.addEventListener('change', handleFileImport);
    btnUserStart.addEventListener('click', startGame);
    searchBox.addEventListener('input', handleSearch);
    sortSelect.addEventListener('change', handleSortChange);
    nicoCheckbox.addEventListener('change', handleNicoFilterChange);
    setupPlayerControls();
});

// JSONファイルの読み込み
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

                buildLibrary();
                renderFolders();
                selectFolder(musicLibrary[0]?.id || '__all');
            } else {
                alert('動画データがありません。');
            }
        } catch (error) {
            alert('JSONファイルの解析に失敗しました。');
            console.error(error);
        }
    };
    reader.readAsText(file);
}

// STARTボタンで自動再生制限を突破
function startGame() {
    readyScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    
    if (currentFolderId) {
        const folder = musicLibrary.find(f => f.id === currentFolderId);
        const songs = folder ? folder.songs :[];
        if (songs.length > 0) {
            startPlaylist(songs, 0);
        } else {
            startPlaylist(musicLibrary.find(f=>f.id==='__all')?.songs ||[], 0);
        }
    }
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
        const folders = item.folders && item.folders.length > 0 ? item.folders :[item.folder || 'Manual'];
        folders.forEach(fName => {
            if (!folderMap[fName]) folderMap[fName] = [];
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

    const allFolder = {
        id: '__all',
        name: '📚 すべての動画',
        songs: sortSongs(itemsToProcess)
    };

    musicLibrary =[
        allFolder,
        ...folderNames.map(name => ({
            id: name,
            name: `📁 ${name}`,
            songs: sortSongs(folderMap[name])
        }))
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
            case 'custom': default:
                return (a.order ?? getTime(a.savedAt)) - (b.order ?? getTime(b.savedAt));
        }
    });
}

// --- UI Rendering ---
function renderFolders() {
    folderListEl.innerHTML = '';
    musicLibrary.forEach(folder => {
        const div = document.createElement('div');
        div.className = 'w-f-item';
        div.textContent = folder.name;
        div.dataset.folderId = folder.id;
        div.onclick = () => selectFolder(folder.id);
        folderListEl.appendChild(div);
    });
}

function selectFolder(folderId) {
    currentFolderId = folderId;
    
    document.querySelectorAll('.w-f-item').forEach(el => {
        const isActive = el.dataset.folderId === folderId;
        el.classList.toggle('active', isActive);
        
        if (isActive && window.innerWidth <= 900) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    });

    const folder = musicLibrary.find(f => f.id === folderId);
    renderTracks(folder ? folder.songs :[]);
}

function renderTracks(songs) {
    trackListEl.innerHTML = '';
    trackListEl.scrollTop = 0;
    
    if (songs.length === 0) {
        trackListEl.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">動画がありません</div>';
        return;
    }

    songs.forEach((song, index) => {
        const div = document.createElement('div');
        div.className = 'w-t-item';
        div.innerHTML = `
            <span class="w-t-idx">${index + 1}</span>
            <span class="w-t-playing-icon hidden"><i class="fa-solid fa-volume-high"></i></span>
            <span class="track-title-text" title="${escapeHTML(song.title)}">${escapeHTML(song.title)}</span>`;
        div.onclick = () => {
            startPlaylist(songs, index);
        };
        trackListEl.appendChild(div);
    });

    updateActiveTrackUI();
}

function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
function handleSearch(e) {
    currentSearchQuery = e.target.value;
    buildLibrary();
    renderFolders();
    selectFolder(currentFolderId || musicLibrary[0]?.id);
}

function handleSortChange(e) {
    currentSortOrder = e.target.value;
    buildLibrary();
    selectFolder(currentFolderId || musicLibrary[0]?.id);
}

function handleNicoFilterChange(e) {
    excludeNico = e.target.checked;
    buildLibrary();
    renderFolders();
    selectFolder(currentFolderId || musicLibrary[0]?.id);
}

// --- Player Logic ---
function setupPlayerControls() {
    document.getElementById('widget-btn-play').onclick = togglePlay;
    document.getElementById('widget-btn-next').onclick = playNextVideo;
    document.getElementById('widget-btn-prev').onclick = playPrevVideo;
}

function startPlaylist(items, startIndex = 0) {
    if (items.length === 0) return;
    currentPlaylist = items;
    currentIndex = startIndex;
    loadVideo(currentIndex);
}

function playNextVideo() {
    if (currentPlaylist.length === 0 || isTransitioning) return;
    isTransitioning = true;
    setTimeout(() => { isTransitioning = false; }, 1000); // 連続発火防止
    
    currentIndex = (currentIndex + 1) % currentPlaylist.length;
    loadVideo(currentIndex);
}

function playPrevVideo() {
    if (currentPlaylist.length === 0 || isTransitioning) return;
    isTransitioning = true;
    setTimeout(() => { isTransitioning = false; }, 1000); // 連続発火防止
    
    currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    loadVideo(currentIndex);
}

function loadVideo(index) {
    if (index < 0 || index >= currentPlaylist.length) return;
    
    currentIndex = index;
    isTransitioning = false; 
    const item = currentPlaylist[index];
    
    currentPlayingItem = item;
    isPlaying = true;
    
    updatePlayerUI(item);
    updateActiveTrackUI();

    // 次の動画が読み込まれたら、既存のニコニコタイマーは確実に解除する
    if (nicoEndTimer) {
        clearTimeout(nicoEndTimer);
        nicoEndTimer = null;
    }

    const container = document.getElementById('player-container');

    if (item.site === 'youtube') {
        const videoId = getYouTubeId(item.url);
        
        // ニコニコのIframeが残っている等、汚染されている場合はコンテナを掃除する
        if (container.querySelector('#nico-player') || container.querySelector('iframe')) {
            container.innerHTML = '<div id="yt-player-mount"></div>';
            ytPlayer = null; 
        }

        if (!ytPlayer) {
            container.innerHTML = '<div id="yt-player-mount"></div>';
            createYouTubePlayer(videoId);
        } else {
            if (typeof ytPlayer.loadVideoById === 'function') {
                ytPlayer.loadVideoById(videoId);
            } else {
                container.innerHTML = '<div id="yt-player-mount"></div>';
                createYouTubePlayer(videoId);
            }
        }
    } else {
        // YouTube以外の再生（ニコニコ動画含む）
        if (ytPlayer) { 
            try { ytPlayer.destroy(); } catch(e){} 
            ytPlayer = null; 
        }
        
        // 前のDOMを完全に削除
        container.innerHTML = ''; 
        
        if (item.site === 'niconico') {
            const nicoId = getNicoId(item.url);
            
            // ★安定版: API(jsapi)を利用せず、単純なiframe + autoplayで再生
            container.innerHTML = `
                <iframe id="nico-player"
                    src="https://embed.nicovideo.jp/watch/${nicoId}?autoplay=1"
                    allow="autoplay; fullscreen; encrypted-media"
                    style="width:100%; height:100%; border:none;">
                </iframe>
            `;

            // ★安定版: JSON内に duration (秒数) があれば、疑似タイマーで次へ進める
            const durationSec = parseInt(item.duration, 10);
            if (!isNaN(durationSec) && durationSec > 0) {
                // 動画の長さ + 2秒の猶予を持たせて次の動画へ自動遷移
                nicoEndTimer = setTimeout(() => {
                    playNextVideo();
                }, (durationSec * 1000) + 2000);
            }

        } else {
            // その他のサイト用フォールバック
            container.innerHTML = `<iframe src="${item.url}" allowfullscreen allow="autoplay" style="width:100%; height:100%; border:none;"></iframe>`;
        }
    }
}

function getYouTubeId(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('v') || url.split('/').pop();
    } catch(e) { 
        const match = url.match(/[?&]v=([^&]+)/);
        if(match) return match[1];
        return url.split('/').pop(); 
    }
}

// ★ ニコニコ動画のID抽出を強化 (sm/nm/so 等に確実に対応)
function getNicoId(url) {
    const match = url.match(/(sm|nm|so)\d+/);
    if (match) {
        return match[0];
    }
    // 例外的なURLのフォールバック
    try {
        const urlObj = new URL(url);
        return urlObj.pathname.split('/').pop();
    } catch(e) {
        return url.split('?')[0].split('/').pop();
    }
}

function createYouTubePlayer(videoId) {
    if (typeof YT !== 'undefined' && YT.Player) {
        ytPlayer = new YT.Player('yt-player-mount', {
            height: '100%', 
            width: '100%', 
            videoId: videoId,
            playerVars: { 'playsinline': 1, 'autoplay': 1, 'rel': 0 },
            events: { 
                'onReady': () => {
                    isPlaying = true;
                    updatePlayPauseIcon();
                },
                'onStateChange': onPlayerStateChange,
                'onError': (e) => {
                    console.warn("YouTube Error", e.data);
                    setTimeout(playNextVideo, 5000);
                }
            }
        });
    } else {
        setTimeout(() => createYouTubePlayer(videoId), 500);
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        updatePlayPauseIcon();
    } else if (event.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        updatePlayPauseIcon();
    } else if (event.data === YT.PlayerState.ENDED) {
        playNextVideo(); 
    }
}

function togglePlay() {
    if (!currentPlayingItem) return;
    
    isPlaying = !isPlaying;
    updatePlayPauseIcon();

    if (currentPlayingItem.site === 'youtube' && ytPlayer && typeof ytPlayer.playVideo === 'function') {
        if (isPlaying) {
            ytPlayer.playVideo();
        } else {
            ytPlayer.pauseVideo();
        }
    } else if (currentPlayingItem.site === 'niconico') {
        // ※ NiconicoはAPIを使用しないため、外部からの確実な一時停止/再生操作はできません。
        // UI（アイコン）の切り替えのみを行い、実際の再生状態はユーザーが動画内をクリックして操作する想定です。
    }
}

function updatePlayerUI(item) {
    document.getElementById('widget-title').textContent = item.title;
    document.getElementById('widget-artist').textContent = item.channelName || item.site;
    const thumb = item.thumbnail || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>";
    document.getElementById('widget-art').src = thumb;
    document.getElementById('widget-bg').style.backgroundImage = `url('${thumb}')`;
    updatePlayPauseIcon();

    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: item.title,
            artist: item.channelName || item.site,
            artwork:[
                { src: thumb, sizes: '512x512', type: 'image/jpeg' },
                { src: thumb, sizes: '256x256', type: 'image/jpeg' }
            ]
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

    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
}

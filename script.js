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
let nicoEndTimer = null;

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
            // エクスポート形式の違いに対応
            const mediaItems = Array.isArray(data) ? data : (data.mediaItems ||[]);
            
            // システムアイテムは除外
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

// ユーザーアクション（STARTボタン）で自動再生制限を突破
function startGame() {
    readyScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    
    // 現在選択されているフォルダの曲からプレイリストを作成して再生
    if (currentFolderId) {
        const folder = musicLibrary.find(f => f.id === currentFolderId);
        const songs = folder ? folder.songs :[];
        if (songs.length > 0) {
            startPlaylist(songs, 0);
        } else {
            // "すべての動画"などフォールバック
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
        const folders = item.folders && item.folders.length > 0 ? item.folders : [item.folder || 'Manual'];
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

    // 「すべての動画」を作成
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
        el.classList.toggle('active', el.dataset.folderId === folderId);
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
            // スクロール時に画面が飛ぶのを防ぐための調整
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    if (currentPlaylist.length === 0) return;
    currentIndex = (currentIndex + 1) % currentPlaylist.length;
    loadVideo(currentIndex);
}

function playPrevVideo() {
    if (currentPlaylist.length === 0) return;
    currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    loadVideo(currentIndex);
}

// ★動作確認済みの再生ロジックを組み込み
function loadVideo(index) {
    if (index < 0 || index >= currentPlaylist.length) return;
    currentIndex = index;
    const item = currentPlaylist[index];
    
    currentPlayingItem = item;
    isPlaying = true;
    
    updatePlayerUI(item);
    updateActiveTrackUI();

    if (nicoEndTimer) clearTimeout(nicoEndTimer);

    const container = document.getElementById('player-container');

    if (item.site === 'youtube') {
        const videoId = getYouTubeId(item.url);
        
        // ★重要: iframeがなければマウント用DIVを作ってAPIで生成。あればloadVideoById
        if (!container.querySelector('iframe') || !ytPlayer) {
            container.innerHTML = '<div id="yt-player-mount"></div>';
            createYouTubePlayer(videoId);
        } else {
            if (typeof ytPlayer.loadVideoById === 'function') {
                ytPlayer.loadVideoById(videoId);
            } else {
                // 安全策
                container.innerHTML = '<div id="yt-player-mount"></div>';
                createYouTubePlayer(videoId);
            }
        }
    } else {
        // ニコニコ等他のサイトの場合は、YouTubeプレイヤーを破棄
        if (ytPlayer) { 
            ytPlayer.destroy(); 
            ytPlayer = null; 
        }
        
        let html = '';
        if (item.site === 'niconico') {
            const nicoId = item.url.split('/').pop();
            // jsapi=1&autoplay=1 を付与して自動再生を試みる
            html = `<iframe src="https://embed.nicovideo.jp/watch/${nicoId}?jsapi=1&autoplay=1" allow="autoplay; fullscreen; encrypted-media" style="width:100%; height:100%; border:none;"></iframe>`;
            
            // 疑似終了タイマー
            if (item.duration > 0) {
                nicoEndTimer = setTimeout(playNextVideo, (item.duration * 1000) + 2000);
            }
        } else {
            html = `<iframe src="${item.url}" allowfullscreen style="width:100%; height:100%; border:none;"></iframe>`;
        }
        container.innerHTML = html;
    }
}

function getYouTubeId(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('v') || url.split('/').pop();
    } catch(e) { 
        // URL解析失敗時のフォールバック
        const match = url.match(/[?&]v=([^&]+)/);
        if(match) return match[1];
        return url.split('/').pop(); 
    }
}

// 動作確認済みのYouTubeプレイヤー生成
function createYouTubePlayer(videoId) {
    // window.YT が準備できている前提
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
                    // エラー時は5秒後に次へ
                    setTimeout(playNextVideo, 5000);
                }
            }
        });
    } else {
        // APIロードが間に合わなかった場合の再試行
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
    }
    // iframe埋め込みのニコニコ動画は外部からのPlay/Pauseが難しいためUIの切り替えのみ
}

function updatePlayerUI(item) {
    document.getElementById('widget-title').textContent = item.title;
    document.getElementById('widget-artist').textContent = item.channelName || item.site;
    const thumb = item.thumbnail || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>";
    document.getElementById('widget-art').src = thumb;
    document.getElementById('widget-bg').style.backgroundImage = `url('${thumb}')`;
    updatePlayPauseIcon();
}

function updatePlayPauseIcon() {
    const icon = document.getElementById('widget-play-icon');
    icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
}
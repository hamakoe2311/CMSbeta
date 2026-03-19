// ============================================
// 1. 設定とグローバル変数の定義
// ============================================

const defaultSettings = {
    theme: 'modern',
    bgImage: '',
    bgOpacity: 0.5,
    bootSound: '',
    musicMode: false,
    showClock: true,
    showThumbnails: true,
    customColorEnabled: false,
    customAccentColor: '#00aaff',
    customBorderColor: '#ffffff'
};
let appSettings = { ...defaultSettings };

// グローバル状態
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

// タイマー関連（重さ軽減、UI更新用）
let bootTimeoutId;
let toyotaStepTimeoutId;
let resizeTimer;       
let progressInterval;  

// DOM要素
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


// ============================================
// 2. 初期化とイベント登録
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    applyThemeSettings();

    // 時計の更新開始
    updateClock();
    setInterval(updateClock, 1000);

    // IFrame Player API (YouTube) の動的読み込み
    loadYouTubeAPI();

    // リサイズ時はみ出し(マーキー)再計算 (デバウンス処理で軽くする)
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(scheduleMarqueeUpdate, 200);
    });

    // 各種イベントリスナー登録
    importJsonInput.addEventListener('change', handleFileImport);
    btnUserStart.addEventListener('click', startGame);
    searchBox.addEventListener('input', handleSearch);
    sortSelect.addEventListener('change', handleSortChange);
    nicoCheckbox.addEventListener('change', handleNicoFilterChange);
    
    // 全画面表示・プログレスバー操作
    document.getElementById('widget-btn-fullscreen').addEventListener('click', toggleFullscreen);
    document.getElementById('progress-container').addEventListener('click', handleProgressClick);

    setupPlayerControls();
    setupSettingsModal();
    
    // Niconico Playerからのメッセージ受信用
    window.addEventListener('message', handleNicoMessage);
});


// ============================================
// 3. 外部APIの読み込み処理
// ============================================
function loadYouTubeAPI() {
    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
}


// ============================================
// 4. 設定管理とUI適用
// ============================================
function loadSettings() {
    try {
        const saved = localStorage.getItem('cms_player_settings_v3');
        if (saved) appSettings = { ...defaultSettings, ...JSON.parse(saved) };
    } catch (e) { console.error("設定読み込みエラー", e); }
}

function saveSettings() {
    localStorage.setItem('cms_player_settings_v3', JSON.stringify(appSettings));
}

function applyThemeSettings() {
    // クラスの付け替え
    document.body.className = `theme-${appSettings.theme}`;
    document.body.classList.toggle('music-mode', appSettings.musicMode);
    document.body.classList.toggle('show-list-thumbnails', appSettings.showThumbnails);
    document.body.classList.toggle('show-clock', appSettings.showClock);
    
    // 背景画像の設定
    if (appSettings.bgImage) {
        document.documentElement.style.setProperty('--bg-image', `url(${appSettings.bgImage})`);
    } else {
        document.documentElement.style.setProperty('--bg-image', 'none');
    }
    
    // カスタムカラーの上書き
    if (appSettings.customColorEnabled) {
        document.documentElement.style.setProperty('--accent-color', appSettings.customAccentColor);
        document.documentElement.style.setProperty('--border-color', appSettings.customBorderColor);
    } else {
        document.documentElement.style.removeProperty('--accent-color');
        document.documentElement.style.removeProperty('--border-color');
    }

    // 透明度とぼかしの連動
    const op = parseFloat(appSettings.bgOpacity);
    document.documentElement.style.setProperty('--panel-alpha', op);
    document.documentElement.style.setProperty('--panel-blur', `${op * 20}px`);
}

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

function setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    
    document.getElementById('btn-open-settings').onclick = () => {
        document.getElementById('set-theme').value = appSettings.theme;
        document.getElementById('set-opacity').value = appSettings.bgOpacity;
        document.getElementById('op-val').textContent = appSettings.bgOpacity;
        document.getElementById('set-music-mode').checked = appSettings.musicMode;
        document.getElementById('set-show-clock').checked = appSettings.showClock;
        document.getElementById('set-show-thumbnails').checked = appSettings.showThumbnails;
        document.getElementById('set-use-custom-color').checked = appSettings.customColorEnabled;
        document.getElementById('set-accent-color').value = appSettings.customAccentColor;
        document.getElementById('set-border-color').value = appSettings.customBorderColor;
        modal.classList.remove('hidden');
    };

    document.getElementById('set-opacity').oninput = (e) => {
        const val = e.target.value;
        document.getElementById('op-val').textContent = val;
        // プレビューとしてリアルタイムに適用
        document.documentElement.style.setProperty('--panel-alpha', val);
        document.documentElement.style.setProperty('--panel-blur', `${val * 20}px`);
    };

    document.getElementById('btn-close-settings').onclick = () => {
        modal.classList.add('hidden');
        applyThemeSettings(); // キャンセル時は元の設定に戻す
    };

    document.getElementById('btn-reset-settings').onclick = () => {
        if (confirm('設定をすべて初期化してリロードしますか？')) {
            localStorage.removeItem('cms_player_settings_v3');
            location.reload();
        }
    };

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
        appSettings.musicMode = document.getElementById('set-music-mode').checked;
        appSettings.showClock = document.getElementById('set-show-clock').checked;
        appSettings.showThumbnails = document.getElementById('set-show-thumbnails').checked;
        
        appSettings.customColorEnabled = document.getElementById('set-use-custom-color').checked;
        appSettings.customAccentColor = document.getElementById('set-accent-color').value;
        appSettings.customBorderColor = document.getElementById('set-border-color').value;

        saveSettings();
        modal.classList.add('hidden');
        applyThemeSettings();
        scheduleMarqueeUpdate(); 
    };
}


// ============================================
// 5. 時計とマーキー（文字はみ出し）機能
// ============================================
function updateClock() {
    if (!appSettings.showClock) return;
    const now = new Date();
    document.getElementById('clock-time').textContent = now.toLocaleTimeString('ja-JP', { hour12: false });
    document.getElementById('clock-date').textContent = now.toLocaleDateString('ja-JP');
}

function updateMarquee() {
    requestAnimationFrame(() => {
        document.querySelectorAll('.marquee-wrapper').forEach(wrapper => {
            const content = wrapper.querySelector('.marquee-content');
            if (!content) return;
            const wrapperWidth = wrapper.clientWidth;
            const contentWidth = content.scrollWidth;
            
            // 幅が親(表示領域)より大きければアニメーションクラスを付与
            if (contentWidth > wrapperWidth + 2) {
                wrapper.style.setProperty('--parent-width', `${wrapperWidth}px`);
                content.classList.add('is-marquee');
            } else {
                content.classList.remove('is-marquee');
            }
        });
    });
}

function scheduleMarqueeUpdate() {
    setTimeout(updateMarquee, 100);
}


// ============================================
// 6. 起動シーケンスとデータ読み込み
// ============================================
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
            alert('JSONの解析に失敗しました。'); 
        }
    };
    reader.readAsText(file);
}

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

    // トヨタナビ用ステップアニメーション
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

    // スキップイベント
    bootScreen.onclick = endBootSequence;

    // 4秒で自動遷移
    bootTimeoutId = setTimeout(endBootSequence, 4000);
}

function endBootSequence() {
    clearTimeout(bootTimeoutId);
    clearTimeout(toyotaStepTimeoutId);
    bootScreen.onclick = null; 

    bootScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    
    scheduleMarqueeUpdate(); 
    
    if (currentFolderId) {
        const folder = musicLibrary.find(f => f.id === currentFolderId);
        const songs = folder ? folder.songs :[];
        if (songs.length > 0) startPlaylist(songs, 0);
        else startPlaylist(musicLibrary.find(f => f.id === '__all')?.songs ||[], 0);
    }
}


// ============================================
// 7. ライブラリ構築とレンダリング
// ============================================
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

function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderTracks(songs) {
    trackListEl.innerHTML = ''; 
    trackListEl.scrollTop = 0;
    
    if (songs.length === 0) { 
        trackListEl.innerHTML = '<div style="padding:20px; text-align:center;">動画がありません</div>'; 
        return; 
    }

    songs.forEach((song, index) => {
        const div = document.createElement('div');
        div.className = 'w-t-item';
        
        const title = escapeHTML(song.title);
        const artist = escapeHTML(song.channelName || song.site);
        const thumbSrc = song.thumbnail || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><rect width='1' height='1' fill='%23333'/></svg>";

        div.innerHTML = `
            <span class="w-t-idx">${index + 1}</span>
            <span class="w-t-playing-icon hidden"><i class="fa-solid fa-volume-high"></i></span>
            <img class="w-t-thumb" src="${thumbSrc}" loading="lazy">
            <div class="w-t-info overflow-hidden">
                <div class="marquee-wrapper"><span class="track-title-text marquee-content" title="${title}">${title}</span></div>
                <div class="marquee-wrapper"><span class="track-artist-text marquee-content">${artist}</span></div>
            </div>`;
            
        div.onclick = () => startPlaylist(songs, index);
        trackListEl.appendChild(div);
    });
    
    updateActiveTrackUI();
    scheduleMarqueeUpdate();
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


// ============================================
// 8. 検索・フィルタハンドラ
// ============================================
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


// ============================================
// 9. プレイヤー操作関連 (全画面・プログレスなど)
// ============================================
function setupPlayerControls() {
    document.getElementById('widget-btn-play').onclick = togglePlay;
    document.getElementById('widget-btn-next').onclick = playNextVideo;
    document.getElementById('widget-btn-prev').onclick = playPrevVideo;
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`全画面表示エラー: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

function startProgressTimer() {
    clearInterval(progressInterval);
    progressInterval = setInterval(updateProgress, 1000);
}

function stopProgressTimer() {
    clearInterval(progressInterval);
}

function updateProgress() {
    if (!isPlaying) return;
    
    let current = 0;
    let duration = 0;

    // YouTubeのみAPIで時間を取得
    if (currentPlayingItem && currentPlayingItem.site === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
        current = ytPlayer.getCurrentTime();
        duration = ytPlayer.getDuration();
    } else {
        return; // Niconicoは時間取得が難しいためバーは初期状態のまま
    }

    if (duration > 0) {
        const percent = (current / duration) * 100;
        document.getElementById('progress-bar').style.width = `${percent}%`;
        document.getElementById('time-current').textContent = formatTime(current);
        document.getElementById('time-duration').textContent = formatTime(duration);
    }
}

function formatTime(seconds) {
    if (!seconds) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function handleProgressClick(e) {
    if (!currentPlayingItem || currentPlayingItem.site !== 'youtube' || !ytPlayer || typeof ytPlayer.getDuration !== 'function') return;
    
    const rect = e.target.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const duration = ytPlayer.getDuration();
    
    if (duration > 0) {
        ytPlayer.seekTo(duration * pos, true);
        updateProgress();
    }
}


// ============================================
// 10. 再生ロジック (YouTube / Niconico)
// ============================================
function startPlaylist(items, startIndex = 0) {
    if (items.length === 0) return;
    currentPlaylist = items; 
    currentIndex = startIndex; 
    loadVideo(currentIndex);
}

function playNextVideo() {
    if (currentPlaylist.length === 0 || isTransitioning) return;
    isTransitioning = true; 
    setTimeout(() => { isTransitioning = false; }, 1000);
    currentIndex = (currentIndex + 1) % currentPlaylist.length;
    loadVideo(currentIndex);
}

function playPrevVideo() {
    if (currentPlaylist.length === 0 || isTransitioning) return;
    isTransitioning = true; 
    setTimeout(() => { isTransitioning = false; }, 1000);
    currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    loadVideo(currentIndex);
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

function getNicoId(url) {
    try { 
        const urlObj = new URL(url); 
        return urlObj.pathname.split('/').pop(); 
    } catch(e) { 
        return url.split('?')[0].split('/').pop(); 
    }
}

function createYouTubePlayer(videoId) {
    // APIの準備ができていればプレイヤーを構築
    if (window.YT && window.YT.Player) {
        ytPlayer = new YT.Player('yt-player-mount', {
            height: '100%', width: '100%', videoId: videoId,
            playerVars: { 'playsinline': 1, 'autoplay': 1, 'rel': 0 },
            events: { 
                'onReady': () => { 
                    isPlaying = true; 
                    updatePlayPauseIcon();
                    startProgressTimer(); 
                },
                'onStateChange': onPlayerStateChange,
                'onError': (e) => { setTimeout(playNextVideo, 5000); }
            }
        });
    } else {
        // まだロードされていない場合は少し待機 (無限ループを回避するため再帰は遅延させる)
        setTimeout(() => createYouTubePlayer(videoId), 1000);
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) { 
        isPlaying = true; 
        updatePlayPauseIcon(); 
        startProgressTimer();
    } else if (event.data === YT.PlayerState.PAUSED) { 
        isPlaying = false; 
        updatePlayPauseIcon(); 
        stopProgressTimer();
    } else if (event.data === YT.PlayerState.ENDED) {
        stopProgressTimer();
        document.getElementById('progress-bar').style.width = '0%';
        playNextVideo(); 
    }
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

    // プログレスバーの初期化
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('time-current').textContent = '0:00';
    document.getElementById('time-duration').textContent = '0:00';
    stopProgressTimer();

    const container = document.getElementById('player-container');

    if (item.site === 'youtube') {
        const videoId = getYouTubeId(item.url);
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
        // Niconicoなどの場合、YouTubeプレイヤーを破棄
        if (ytPlayer) { 
            try { ytPlayer.destroy(); } catch(e){} 
            ytPlayer = null; 
        }
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

function handleNicoMessage(e) {
    if (e.origin !== 'https://embed.nicovideo.jp' || !currentPlayingItem || currentPlayingItem.site !== 'niconico' || !e.data || !e.data.eventName) return;
    const eventName = e.data.eventName;
    
    if (eventName === 'loadComplete') {
        const nicoIframe = document.getElementById('nico-player');
        if (nicoIframe && nicoIframe.contentWindow) {
            setTimeout(() => { 
                nicoIframe.contentWindow.postMessage({ sourceConnectorType: 1, playerId: "1", eventName: "play" }, 'https://embed.nicovideo.jp'); 
            }, 150);
        }
    } else if (eventName === 'playerStatusChange') {
        const status = e.data.data.playerStatus;
        if (status === 4) { // 4: ENDED
            playNextVideo(); 
        } else if (status === 2) { // 2: PLAYING
            isPlaying = true; updatePlayPauseIcon(); 
        } else if (status === 3) { // 3: PAUSED
            isPlaying = false; updatePlayPauseIcon(); 
        }
    } else if (eventName === 'error') {
        setTimeout(() => playNextVideo(), 5000);
    }
}

function togglePlay() {
    if (!currentPlayingItem) return;
    isPlaying = !isPlaying; 
    updatePlayPauseIcon();
    
    if (isPlaying) {
        startProgressTimer();
    } else {
        stopProgressTimer();
    }
    
    if (currentPlayingItem.site === 'youtube' && ytPlayer && typeof ytPlayer.playVideo === 'function') {
        if (isPlaying) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
    } else if (currentPlayingItem.site === 'niconico') {
        const nicoIframe = document.getElementById('nico-player');
        if (nicoIframe && nicoIframe.contentWindow) {
            nicoIframe.contentWindow.postMessage({ sourceConnectorType: 1, playerId: "1", eventName: isPlaying ? "play" : "pause" }, 'https://embed.nicovideo.jp');
        }
    }
}

function updatePlayerUI(item) {
    document.getElementById('widget-title').textContent = item.title;
    document.getElementById('widget-artist').textContent = item.channelName || item.site;
    const thumb = item.thumbnail || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>";
    document.getElementById('widget-art').src = thumb;
    
    updatePlayPauseIcon();
    scheduleMarqueeUpdate(); 

    // OSのメディアコントローラー(通知領域など)と連携
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
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
}

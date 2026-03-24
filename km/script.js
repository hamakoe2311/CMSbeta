// ============================================
// 1. 設定とグローバル変数の定義
// ============================================

const defaultSettings = {
    theme: 'modern',
    bgImage: '',
    bgPosition: 'center',
    bgSize: 'cover',
    bgOpacity: 0.5,
    bootSound: '',
    baseFontSize: 100,         
    pcLeftWidth: 350,          
    musicMode: false,
    showClock: true,
    showThumbnails: true,
    simpleLayoutMode: false,   
    performanceMode: false,
    customColorEnabled: false,
    customAccentColor: '#00aaff',
    customBorderColor: '#ffffff'
};
let appSettings = { ...defaultSettings };

let allItems = [];
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
let isTransitioning = false;
let isListVisible = false;

let bootTimeoutId;
let toyotaStepTimeoutId;
let resizeTimer;       
let progressInterval;  

let currentRenderedCount = 0;
const RENDER_CHUNK_SIZE = 50;
let currentRenderSongs =[];

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

    updateClock();
    setInterval(updateClock, 1000);
    loadYouTubeAPI();

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(scheduleMarqueeUpdate, 200);
    });

    // 仮想リスト用スクロール & モバイル最小化判定
    trackListEl.addEventListener('scroll', () => {
        if (trackListEl.scrollTop + trackListEl.clientHeight >= trackListEl.scrollHeight - 100) {
            loadMoreTracks();
        }
        
        // スマホ時、スクロールでプレイヤーを最小化
        if (window.innerWidth <= 900) {
            if (trackListEl.scrollTop > 30) {
                document.body.classList.add('player-minimized');
            } else {
                document.body.classList.remove('player-minimized');
            }
        }
    });

    // 最小化されたプレイヤーをタップで元に戻す
    const infoContainer = document.querySelector('.widget-info-container');
    const artImage = document.getElementById('widget-art');
    const restorePlayer = (e) => {
        if (document.body.classList.contains('player-minimized') && !e.target.closest('.widget-controls') && !e.target.closest('.progress-area')) {
            document.body.classList.remove('player-minimized');
            trackListEl.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };
    infoContainer.addEventListener('click', restorePlayer);
    artImage.addEventListener('click', restorePlayer);

    importJsonInput.addEventListener('change', handleFileImport);
    btnUserStart.addEventListener('click', startGame);
    searchBox.addEventListener('input', handleSearch);
    sortSelect.addEventListener('change', handleSortChange);
    nicoCheckbox.addEventListener('change', handleNicoFilterChange);
    
    document.getElementById('widget-btn-fullscreen').addEventListener('click', toggleFullscreen);
    document.getElementById('progress-container').addEventListener('click', handleProgressClick);

    document.getElementById('btn-open-mobile-folder').addEventListener('click', () => {
        document.getElementById('mobile-folder-modal').classList.remove('hidden');
    });
    document.getElementById('btn-close-folder-modal').addEventListener('click', () => {
        document.getElementById('mobile-folder-modal').classList.add('hidden');
    });

    document.getElementById('btn-toggle-list').addEventListener('click', () => {
        isListVisible = !isListVisible;
        document.body.classList.toggle('list-visible', isListVisible);
        const textSpan = document.getElementById('toggle-list-text');
        textSpan.textContent = isListVisible ? 'リストを隠す' : 'リストを表示';
        scheduleMarqueeUpdate();
    });

    setupPlayerControls();
    setupSettingsModal();
    window.addEventListener('message', handleNicoMessage);
});


// ============================================
// 3. API読み込みと設定管理
// ============================================
function loadYouTubeAPI() {
    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem('cms_player_settings_v10');
        if (saved) {
            appSettings = { ...defaultSettings, ...JSON.parse(saved) };
        } else {
            // 初回起動時、モバイルなら自動で軽量化ON
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 900;
            if (isMobile) {
                appSettings.performanceMode = true;
            }
        }
    } catch (e) { console.error("設定読み込みエラー", e); }
}

function saveSettings() {
    localStorage.setItem('cms_player_settings_v10', JSON.stringify(appSettings));
}

function applyThemeSettings() {
    document.body.className = `theme-${appSettings.theme}`;
    document.body.classList.toggle('music-mode', appSettings.musicMode);
    document.body.classList.toggle('show-list-thumbnails', appSettings.showThumbnails);
    document.body.classList.toggle('show-clock', appSettings.showClock);
    document.body.classList.toggle('simple-layout-mode', appSettings.simpleLayoutMode);
    document.body.classList.toggle('performance-mode', appSettings.performanceMode);
    
    if (appSettings.simpleLayoutMode && isListVisible) {
        document.body.classList.add('list-visible');
        document.getElementById('toggle-list-text').textContent = 'リストを隠す';
    } else {
        document.body.classList.remove('list-visible');
        document.getElementById('toggle-list-text').textContent = 'リストを表示';
    }
    
    document.documentElement.style.setProperty('--base-font-size', `${appSettings.baseFontSize}%`);
    document.documentElement.style.setProperty('--pc-left-width', `${appSettings.pcLeftWidth}px`);

    if (appSettings.bgImage) {
        document.documentElement.style.setProperty('--bg-image', `url(${appSettings.bgImage})`);
        document.documentElement.style.setProperty('--bg-position', appSettings.bgPosition);
        document.documentElement.style.setProperty('--bg-size', appSettings.bgSize);
    } else {
        document.documentElement.style.setProperty('--bg-image', 'none');
    }
    
    if (appSettings.customColorEnabled) {
        document.body.style.setProperty('--text-color', appSettings.customAccentColor);
        document.body.style.setProperty('--accent-color', appSettings.customAccentColor); 
        document.body.style.setProperty('--border-color', appSettings.customBorderColor);
    } else {
        document.body.style.removeProperty('--text-color');
        document.body.style.removeProperty('--accent-color');
        document.body.style.removeProperty('--border-color');
    }

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
            let width = img.width; let height = img.height;
            if (width > height) { if (width > 1920) { height *= 1920 / width; width = 1920; } } 
            else { if (height > 1080) { width *= 1080 / height; height = 1080; } }
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
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
        document.getElementById('set-font-size').value = appSettings.baseFontSize;
        document.getElementById('font-val').textContent = appSettings.baseFontSize;
        document.getElementById('set-pc-left-width').value = appSettings.pcLeftWidth;
        document.getElementById('pc-width-val').textContent = appSettings.pcLeftWidth;
        document.getElementById('set-bg-position').value = appSettings.bgPosition;
        document.getElementById('set-bg-size').value = appSettings.bgSize;
        document.getElementById('set-opacity').value = appSettings.bgOpacity;
        document.getElementById('op-val').textContent = appSettings.bgOpacity;
        document.getElementById('set-simple-layout').checked = appSettings.simpleLayoutMode;
        document.getElementById('set-performance-mode').checked = appSettings.performanceMode;
        document.getElementById('set-music-mode').checked = appSettings.musicMode;
        document.getElementById('set-show-clock').checked = appSettings.showClock;
        document.getElementById('set-show-thumbnails').checked = appSettings.showThumbnails;
        document.getElementById('set-use-custom-color').checked = appSettings.customColorEnabled;
        document.getElementById('set-accent-color').value = appSettings.customAccentColor;
        document.getElementById('set-border-color').value = appSettings.customBorderColor;
        modal.classList.remove('hidden');
    };

    document.getElementById('set-font-size').oninput = (e) => {
        document.getElementById('font-val').textContent = e.target.value;
    };
    document.getElementById('set-pc-left-width').oninput = (e) => {
        document.getElementById('pc-width-val').textContent = e.target.value;
    };
    document.getElementById('set-opacity').oninput = (e) => {
        const val = e.target.value;
        document.getElementById('op-val').textContent = val;
        document.documentElement.style.setProperty('--panel-alpha', val);
        document.documentElement.style.setProperty('--panel-blur', `${val * 20}px`);
    };

    document.getElementById('btn-close-settings').onclick = () => {
        modal.classList.add('hidden');
        applyThemeSettings(); 
    };

    document.getElementById('btn-reset-settings').onclick = () => {
        if (confirm('設定をすべて初期化してリロードしますか？')) {
            localStorage.removeItem('cms_player_settings_v10');
            location.reload();
        }
    };

    document.getElementById('set-bg-img').onchange = (e) => {
        const file = e.target.files[0];
        if (file) resizeAndSaveImage(file, (base64) => { appSettings.bgImage = base64; applyThemeSettings(); });
    };
    document.getElementById('btn-clear-bg').onclick = () => {
        appSettings.bgImage = ''; document.getElementById('set-bg-img').value = ''; applyThemeSettings();
    };

    document.getElementById('set-boot-sound').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const r = new FileReader();
            r.onload = (ev) => appSettings.bootSound = ev.target.result;
            r.readAsDataURL(file);
        }
    };
    document.getElementById('btn-clear-sound').onclick = () => {
        appSettings.bootSound = ''; document.getElementById('set-boot-sound').value = '';
    };

    document.getElementById('btn-save-settings').onclick = () => {
        appSettings.theme = document.getElementById('set-theme').value;
        appSettings.baseFontSize = document.getElementById('set-font-size').value;
        appSettings.pcLeftWidth = document.getElementById('set-pc-left-width').value;
        appSettings.bgPosition = document.getElementById('set-bg-position').value;
        appSettings.bgSize = document.getElementById('set-bg-size').value;
        appSettings.bgOpacity = document.getElementById('set-opacity').value;
        appSettings.simpleLayoutMode = document.getElementById('set-simple-layout').checked;
        appSettings.performanceMode = document.getElementById('set-performance-mode').checked;
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
// 4. UI機能 (時計・マーキー)
// ============================================
function updateClock() {
    if (!appSettings.showClock) return;
    const now = new Date();
    document.getElementById('clock-time').textContent = now.toLocaleTimeString('ja-JP', { hour12: false });
    document.getElementById('clock-date').textContent = now.toLocaleDateString('ja-JP');
}

function updateMarquee() {
    if (appSettings.performanceMode) {
        document.querySelectorAll('.marquee-content').forEach(c => c.classList.remove('is-marquee'));
        return;
    }

    requestAnimationFrame(() => {
        document.querySelectorAll('.marquee-wrapper').forEach(wrapper => {
            const content = wrapper.querySelector('.marquee-content');
            if (!content) return;
            const wrapperWidth = wrapper.clientWidth;
            const contentWidth = content.scrollWidth;
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
// 5. データ読み込みとライブラリ構築
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
        } catch (error) { alert('JSONの解析に失敗しました。'); }
    };
    reader.readAsText(file);
}

function startGame() {
    readyScreen.classList.add('hidden');
    bootScreen.classList.remove('hidden');
    document.querySelectorAll('.boot-container').forEach(el => el.classList.add('hidden'));
    
    const activeBoot = document.querySelector(`.boot-${appSettings.theme}`);
    if (activeBoot) activeBoot.classList.remove('hidden');

    if (appSettings.bootSound) {
        const audio = new Audio(appSettings.bootSound);
        audio.volume = 0.5; audio.play().catch(e=>{});
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

    // クリック＆タッチでスキップ
    bootScreen.addEventListener('click', endBootSequence);
    bootScreen.addEventListener('touchstart', endBootSequence, {passive: true});
    
    bootTimeoutId = setTimeout(endBootSequence, 4000);
}

function endBootSequence() {
    clearTimeout(bootTimeoutId);
    clearTimeout(toyotaStepTimeoutId);
    bootScreen.removeEventListener('click', endBootSequence);
    bootScreen.removeEventListener('touchstart', endBootSequence);
    
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
        { id: '__all', name: '📚 All', songs: sortSongs(itemsToProcess) },
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


// ============================================
// 6. フォルダ・リスト描画 (仮想リスト化対応)
// ============================================
function renderFolders() {
    folderListEl.innerHTML = '';
    const mobileModalListEl = document.getElementById('mobile-folder-list-modal');
    if (mobileModalListEl) mobileModalListEl.innerHTML = '';

    musicLibrary.forEach(folder => {
        const div = document.createElement('div');
        div.className = 'w-f-item'; 
        div.textContent = folder.name; 
        div.dataset.folderId = folder.id;
        div.onclick = () => selectFolder(folder.id);
        folderListEl.appendChild(div);

        if (mobileModalListEl) {
            const mDiv = document.createElement('div');
            mDiv.className = 'm-f-item';
            mDiv.dataset.folderId = folder.id;
            mDiv.innerHTML = `<span>${folder.name.replace('📁 ', '').replace('📚 ', '')}</span> <i class="fas fa-music" style="opacity:0.6; font-size:0.9rem;"></i>`;
            mDiv.onclick = () => {
                selectFolder(folder.id);
                document.getElementById('mobile-folder-modal').classList.add('hidden');
            };
            mobileModalListEl.appendChild(mDiv);
        }
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

    document.querySelectorAll('.m-f-item').forEach(el => {
        const isActive = el.dataset.folderId === folderId;
        el.classList.toggle('active', isActive);
        const text = el.textContent.trim();
        if (isActive) {
            el.innerHTML = `<span><i class="fas fa-check" style="margin-right:8px;"></i>${text}</span> <i class="fas fa-music"></i>`;
        } else {
            el.innerHTML = `<span>${text}</span> <i class="fas fa-music" style="opacity:0.6; font-size:0.9rem;"></i>`;
        }
    });

    const folder = musicLibrary.find(f => f.id === folderId);
    
    if (folder) {
        document.getElementById('current-folder-name').textContent = folder.name.replace('📁 ', '').replace('📚 ', '');
        document.getElementById('current-folder-count').textContent = `${folder.songs.length}件のアイテム`;
    }

    renderTracks(folder ? folder.songs :[]);
}

function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderTracks(songs) {
    trackListEl.innerHTML = ''; 
    trackListEl.scrollTop = 0;
    currentRenderSongs = songs;
    currentRenderedCount = 0;
    
    if (songs.length === 0) { 
        trackListEl.innerHTML = '<div style="padding:20px; text-align:center;">動画がありません</div>'; 
        return; 
    }

    loadMoreTracks();
}

function loadMoreTracks() {
    if (currentRenderedCount >= currentRenderSongs.length) return;

    const fragment = document.createDocumentFragment();
    const endIndex = Math.min(currentRenderedCount + RENDER_CHUNK_SIZE, currentRenderSongs.length);

    for (let i = currentRenderedCount; i < endIndex; i++) {
        const song = currentRenderSongs[i];
        const div = document.createElement('div');
        div.className = 'w-t-item';
        
        const title = escapeHTML(song.title);
        const artist = escapeHTML(song.channelName || song.site);
        const thumbSrc = song.thumbnail || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><rect width='1' height='1' fill='%23333'/></svg>";

        div.innerHTML = `
            <span class="w-t-idx">${i + 1}</span>
            <span class="w-t-playing-icon hidden"><i class="fa-solid fa-volume-high"></i></span>
            <img class="w-t-thumb" src="${thumbSrc}" loading="lazy">
            <div class="w-t-info overflow-hidden">
                <div class="marquee-wrapper"><span class="track-title-text marquee-content" title="${title}">${title}</span></div>
                <div class="marquee-wrapper"><span class="track-artist-text marquee-content">${artist}</span></div>
            </div>`;
            
        div.onclick = () => startPlaylist(currentRenderSongs, i);
        fragment.appendChild(div);
    }
    
    trackListEl.appendChild(fragment);
    currentRenderedCount = endIndex;
    
    updateActiveTrackUI();
    scheduleMarqueeUpdate();
}

function updateActiveTrackUI() {
    if (currentPlayingItem && currentRenderSongs) {
        const activeIndex = currentRenderSongs.findIndex(s => s === currentPlayingItem);
        while(activeIndex >= currentRenderedCount && currentRenderedCount < currentRenderSongs.length) {
            loadMoreTracks();
        }
    }

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
            
            // 全体スクロールバグを防ぐため scrollTop で位置を合わせる
            const listTop = trackListEl.scrollTop;
            const listHeight = trackListEl.clientHeight;
            const elTop = activeEl.offsetTop;
            const elHeight = activeEl.clientHeight;
            
            if (elTop < listTop || elTop + elHeight > listTop + listHeight) {
                trackListEl.scrollTo({ top: elTop - listHeight / 2 + elHeight / 2, behavior: 'smooth' });
            }
        }
    }
}

function handleSearch(e) { 
    currentSearchQuery = e.target.value; buildLibrary(); renderFolders(); selectFolder(currentFolderId || musicLibrary[0]?.id); 
}
function handleSortChange(e) { 
    currentSortOrder = e.target.value; buildLibrary(); selectFolder(currentFolderId || musicLibrary[0]?.id); 
}
function handleNicoFilterChange(e) { 
    excludeNico = e.target.checked; buildLibrary(); renderFolders(); selectFolder(currentFolderId || musicLibrary[0]?.id); 
}


// ============================================
// 7. 再生機能とプログレスバー操作
// ============================================
function setupPlayerControls() {
    document.getElementById('widget-btn-play').onclick = togglePlay;
    document.getElementById('widget-btn-next').onclick = playNextVideo;
    document.getElementById('widget-btn-prev').onclick = playPrevVideo;
}

// 🌟 iOS対応 フォールバック付き疑似フルスクリーン
function toggleFullscreen() {
    const elem = document.documentElement; 
    let promise;
    
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (elem.requestFullscreen) {
            promise = elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            promise = elem.webkitRequestFullscreen();
        }
        
        if (promise) {
            promise.catch(err => {
                document.body.classList.toggle('pseudo-fullscreen'); // iOS Safariなど
            });
        } else {
            document.body.classList.toggle('pseudo-fullscreen'); // APIが存在しない場合
        }
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
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
    let current = 0; let duration = 0;
    if (currentPlayingItem && currentPlayingItem.site === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
        current = ytPlayer.getCurrentTime();
        duration = ytPlayer.getDuration();
    } else return;

    if (duration > 0) {
        document.getElementById('progress-bar').style.width = `${(current / duration) * 100}%`;
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
    if (duration > 0) { ytPlayer.seekTo(duration * pos, true); updateProgress(); }
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

function getYouTubeId(url) {
    try { const urlObj = new URL(url); return urlObj.searchParams.get('v') || url.split('/').pop(); } 
    catch(e) { const match = url.match(/[?&]v=([^&]+)/); if(match) return match[1]; return url.split('/').pop(); }
}

function getNicoId(url) {
    try { const urlObj = new URL(url); return urlObj.pathname.split('/').pop(); } 
    catch(e) { return url.split('?')[0].split('/').pop(); }
}

function createYouTubePlayer(videoId) {
    if (window.YT && window.YT.Player) {
        ytPlayer = new YT.Player('yt-player-mount', {
            height: '100%', width: '100%', videoId: videoId,
            playerVars: { 'playsinline': 1, 'autoplay': 1, 'rel': 0 },
            events: { 
                'onReady': () => { isPlaying = true; updatePlayPauseIcon(); startProgressTimer(); },
                'onStateChange': onPlayerStateChange,
                'onError': () => { setTimeout(playNextVideo, 5000); }
            }
        });
    } else setTimeout(() => createYouTubePlayer(videoId), 1000);
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) { 
        isPlaying = true; updatePlayPauseIcon(); startProgressTimer();
    } else if (event.data === YT.PlayerState.PAUSED) { 
        isPlaying = false; updatePlayPauseIcon(); stopProgressTimer();
    } else if (event.data === YT.PlayerState.ENDED) {
        stopProgressTimer(); document.getElementById('progress-bar').style.width = '0%'; playNextVideo(); 
    }
}

function loadVideo(index) {
    if (index < 0 || index >= currentPlaylist.length) return;
    currentIndex = index; isTransitioning = false;
    currentPlayingItem = currentPlaylist[index]; isPlaying = true;
    
    updatePlayerUI(currentPlayingItem);
    updateActiveTrackUI();

    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('time-current').textContent = '0:00';
    document.getElementById('time-duration').textContent = '0:00';
    stopProgressTimer();

    const container = document.getElementById('player-container');
    if (currentPlayingItem.site === 'youtube') {
        const videoId = getYouTubeId(currentPlayingItem.url);
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
        if (currentPlayingItem.site === 'niconico') {
            const nicoId = getNicoId(currentPlayingItem.url);
            setTimeout(() => {
                const iframe = document.createElement('iframe');
                iframe.id = 'nico-player';
                iframe.src = `https://embed.nicovideo.jp/watch/${nicoId}?jsapi=1&playerId=1`;
                iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
                iframe.style.width = '100%'; iframe.style.height = '100%'; iframe.style.border = 'none';
                container.appendChild(iframe);
            }, 50);
        } else {
            container.innerHTML = `<iframe src="${currentPlayingItem.url}" allowfullscreen allow="autoplay" style="width:100%; height:100%; border:none;"></iframe>`;
        }
    }
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
    
    if (isPlaying) startProgressTimer(); else stopProgressTimer();
    
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
    scheduleMarqueeUpdate(); 

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

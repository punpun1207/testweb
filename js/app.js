let playlist = JSON.parse(localStorage.getItem('myPlaylist')) || [
    { id: 'jfKfPfyJRdk', title: 'Lofi Girl - Chill Beats' },
    { id: '3B2hS48rR34', title: 'MIMI - サイエンス (maimai)' }
];
let currentTrackIndex = 0;
let isPlaying = false;
let isDraggingProgress = false;

const visualizer = document.getElementById('visualizer');
const playPauseBtn = document.getElementById('btn-play-pause');
const trackNameDisplay = document.getElementById('current-track-name');
const progressBar = document.getElementById('progress-bar');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');

// --- HỆ THỐNG MENU SETTINGS ---
document.getElementById('btn-open-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('hidden');
});
document.getElementById('btn-close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
});

// --- TÌM KIẾM METADATA (dùng nhiều server Piped dự phòng, chỉ để tra tên bài -> videoId) ---
const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi-libre.kavin.rocks',
    'https://pipedapi.leptons.xyz',
    'https://pipedapi.adminforge.de',
    'https://api.piped.yt',
    'https://pipedapi.drgns.space',
    'https://pipedapi.owo.si',
    'https://pipedapi.darkness.services'
];

// Fetch có timeout để không bị treo lâu khi 1 instance bị chết
async function fetchWithTimeout(url, ms = 6000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(url, { signal: controller.signal });
        return res;
    } finally {
        clearTimeout(id);
    }
}

// --- PHÁT NHẠC BẰNG YOUTUBE IFRAME PLAYER API (ẩn video, chỉ giữ tiếng) ---
// Lý do đổi từ Piped stream-scraping sang cách này: YouTube liên tục chặn IP
// của các server Piped khiến endpoint /streams hay trả lỗi 403 / rỗng, không
// phải lỗi cấu hình mà là vấn đề nguồn cứ lặp lại. IFrame API là API chính
// chủ của YouTube nên ổn định hơn nhiều, đổi lại đôi khi sẽ có quảng cáo.
let ytPlayer = null;
let playerReady = false;
let pendingLoadIndex = null;
let progressInterval = null;
let hasUserInteracted = false;

// Nạp script IFrame API động (theo đúng khuyến nghị của Google)
(function loadYouTubeIframeAPI() {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
})();

// Container hiển thị thật (46x46px trong mini-player) — KHÔNG giấu off-screen,
// vì YouTube chặn phát (lỗi 150) khi phát hiện player bị ẩn hoàn toàn khỏi màn hình.

// Hàm này bắt buộc phải là hàm global tên đúng "onYouTubeIframeAPIReady"
window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('yt-player-container', {
        height: '46',
        width: '46',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, playsinline: 1 },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
        }
    });
};

function onPlayerReady() {
    playerReady = true;
    if (pendingLoadIndex !== null) {
        const idx = pendingLoadIndex;
        pendingLoadIndex = null;
        loadTrack(idx);
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        visualizer.classList.add('active');
        playPauseBtn.innerText = '⏸';
        playPauseBtn.classList.replace('is-success', 'is-warning');
        timeTotal.innerText = formatTime(ytPlayer.getDuration());
        startProgressPolling();
    } else if (event.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        visualizer.classList.remove('active');
        playPauseBtn.innerText = '▶';
        playPauseBtn.classList.replace('is-warning', 'is-success');
        stopProgressPolling();
    } else if (event.data === YT.PlayerState.ENDED) {
        nextTrack();
    }
}

function onPlayerError(event) {
    // 2=id sai, 5=lỗi HTML5 player, 100=video bị xoá/riêng tư, 101/150=video chặn nhúng
    console.log('Lỗi phát video, mã lỗi:', event.data);
    trackNameDisplay.innerText = 'Video lỗi / bị chặn, đang chuyển bài...';
    setTimeout(nextTrack, 1500);
}

function startProgressPolling() {
    stopProgressPolling();
    progressInterval = setInterval(() => {
        if (!isDraggingProgress && ytPlayer && ytPlayer.getDuration) {
            const current = ytPlayer.getCurrentTime() || 0;
            const duration = ytPlayer.getDuration() || 0;
            progressBar.value = duration ? (current / duration) * 100 : 0;
            timeCurrent.innerText = formatTime(current);
        }
    }, 500);
}

function stopProgressPolling() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function loadTrack(index) {
    currentTrackIndex = index;
    const track = playlist[currentTrackIndex];
    renderPlaylist();

    progressBar.value = 0;
    timeCurrent.innerText = "00:00";
    timeTotal.innerText = "00:00";
    trackNameDisplay.innerText = track.title;

    if (!playerReady) {
        pendingLoadIndex = index;
        return;
    }
    ytPlayer.loadVideoById(track.id);
    if (!hasUserInteracted) {
        // Trước cú click đầu tiên, trình duyệt sẽ tự chặn autoplay có tiếng,
        // nên chỉ cue video, đợi người dùng bấm play/next/prev để phát.
        ytPlayer.pauseVideo();
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

progressBar.addEventListener('mousedown', () => isDraggingProgress = true);
progressBar.addEventListener('mouseup', () => isDraggingProgress = false);
progressBar.addEventListener('input', (e) => {
    if (!ytPlayer) return;
    const seekTime = (e.target.value / 100) * (ytPlayer.getDuration() || 0);
    timeCurrent.innerText = formatTime(seekTime);
});
progressBar.addEventListener('change', (e) => {
    if (!ytPlayer) return;
    const seekTime = (e.target.value / 100) * (ytPlayer.getDuration() || 0);
    ytPlayer.seekTo(seekTime, true);
});

window.addEventListener('DOMContentLoaded', () => {
    if (playerReady) loadTrack(currentTrackIndex);
    else pendingLoadIndex = currentTrackIndex;

    document.body.addEventListener('click', () => {
        hasUserInteracted = true;
        if (ytPlayer && ytPlayer.playVideo && !isPlaying) ytPlayer.playVideo();
    }, { once: true });
});

function nextTrack() {
    hasUserInteracted = true;
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    loadTrack(currentTrackIndex);
    if (playerReady) ytPlayer.playVideo();
}

function prevTrack() {
    hasUserInteracted = true;
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    loadTrack(currentTrackIndex);
    if (playerReady) ytPlayer.playVideo();
}

playPauseBtn.addEventListener('click', () => {
    hasUserInteracted = true;
    if (!ytPlayer) return;
    isPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
});
document.getElementById('btn-next').addEventListener('click', nextTrack);
document.getElementById('btn-prev').addEventListener('click', prevTrack);

// --- TÌM KIẾM & PLAYLIST ---
function renderPlaylist() {
    const ul = document.getElementById('playlist-ui');
    ul.innerHTML = '';
    playlist.forEach((track, index) => {
        const li = document.createElement('li');
        li.innerText = track.title;
        if (index === currentTrackIndex) li.classList.add('playing');
        li.onclick = () => loadTrack(index);
        ul.appendChild(li);
    });
    localStorage.setItem('myPlaylist', JSON.stringify(playlist));
}

function extractVideoID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

document.getElementById('btn-add-song').addEventListener('click', async() => {
    const input = document.getElementById('new-yt-id');
    const statusMsg = document.getElementById('search-status');
    const query = input.value.trim();
    if (!query) return;

    statusMsg.innerText = "Đang tìm kiếm...";
    let videoId = extractVideoID(query);
    let videoTitle = "Track mới";

    if (!videoId && query.length === 11 && !query.includes(' ')) videoId = query;

    if (!videoId) {
        let found = false;
        for (const instance of PIPED_INSTANCES) {
            try {
                const res = await fetchWithTimeout(`${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`);
                if (!res.ok) continue;
                const data = await res.json();
                if (data.items && data.items.length > 0) {
                    const firstVideo = data.items.find(item => item.type === 'stream');
                    if (firstVideo) {
                        videoId = firstVideo.url.replace('/watch?v=', '');
                        videoTitle = firstVideo.title;
                        found = true;
                        break;
                    }
                }
            } catch (err) { console.log(`Server ${instance} lỗi, thử server khác...`); }
        }
        if (!found) {
            statusMsg.innerText = "Lỗi tìm kiếm! (không server nào phản hồi)";
            return;
        }
    } else { videoTitle = `Track: ${videoId}`; }

    if (videoId) {
        playlist.push({ id: videoId, title: videoTitle });
        renderPlaylist();
        input.value = '';
        statusMsg.innerText = "Thêm thành công!";
        setTimeout(() => statusMsg.innerText = "", 3000);
    } else { statusMsg.innerText = "Không tìm thấy!"; }
});

// --- POMODORO ---
let pomoTime = 25 * 60;
let pomoInterval = null;
const timerDisplay = document.getElementById('timer-display');

function updateTimerDisplay() {
    let m = Math.floor(pomoTime / 60).toString().padStart(2, '0');
    let s = (pomoTime % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${m}:${s}`;
}

document.getElementById('btn-pomo-start').addEventListener('click', (e) => {
    const btn = e.target;
    if (pomoInterval) {
        clearInterval(pomoInterval);
        pomoInterval = null;
        btn.innerText = 'Start';
        btn.classList.replace('is-warning', 'is-success');
    } else {
        btn.innerText = 'Pause';
        btn.classList.replace('is-success', 'is-warning');
        pomoInterval = setInterval(() => {
            if (pomoTime > 0) {
                pomoTime--;
                updateTimerDisplay();
            } else {
                clearInterval(pomoInterval);
                alert("Hết 25 phút!");
            }
        }, 1000);
    }
});
document.getElementById('btn-pomo-reset').addEventListener('click', () => {
    clearInterval(pomoInterval);
    pomoInterval = null;
    pomoTime = 25 * 60;
    updateTimerDisplay();
    const btn = document.getElementById('btn-pomo-start');
    btn.innerText = 'Start';
    btn.classList.replace('is-warning', 'is-success');
});

// --- QUẢN LÝ HÌNH NỀN ---
const bgOverlay = document.getElementById('bg-overlay');
const bgUpload = document.getElementById('bg-upload');
const sliderZoom = document.getElementById('slider-zoom');
const sliderX = document.getElementById('slider-x');
const sliderY = document.getElementById('slider-y');
const valZoom = document.getElementById('val-zoom');
const valX = document.getElementById('val-x');
const valY = document.getElementById('val-y');

let bgSettings = JSON.parse(localStorage.getItem('bgSettings')) || { zoom: 100, x: 50, y: 50 };

function applyBgSettings() {
    bgOverlay.style.backgroundSize = `${bgSettings.zoom}%`;
    bgOverlay.style.backgroundPosition = `${bgSettings.x}% ${bgSettings.y}%`;
    sliderZoom.value = bgSettings.zoom;
    valZoom.innerText = bgSettings.zoom;
    sliderX.value = bgSettings.x;
    valX.innerText = bgSettings.x;
    sliderY.value = bgSettings.y;
    valY.innerText = bgSettings.y;
    localStorage.setItem('bgSettings', JSON.stringify(bgSettings));
}

sliderZoom.addEventListener('input', (e) => { bgSettings.zoom = e.target.value;
    applyBgSettings(); });
sliderX.addEventListener('input', (e) => { bgSettings.x = e.target.value;
    applyBgSettings(); });
sliderY.addEventListener('input', (e) => { bgSettings.y = e.target.value;
    applyBgSettings(); });

window.addEventListener('DOMContentLoaded', () => {
    const savedBg = localStorage.getItem('userBg');
    if (savedBg) bgOverlay.style.backgroundImage = `url(${savedBg})`;
    applyBgSettings();
});

bgUpload.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    if (file.type === 'image/gif') {
        if (file.size > 3.5 * 1024 * 1024) { alert("GIF > 3.5MB!"); return; }
        reader.onload = function(e) {
            bgOverlay.style.backgroundImage = `url(${e.target.result})`;
            try { localStorage.setItem('userBg', e.target.result); } catch (err) {}
        };
        reader.readAsDataURL(file);
        return;
    }
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const scaleSize = 1920 / img.width;
            canvas.width = 1920;
            canvas.height = img.height * scaleSize;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg', 0.6);
            bgOverlay.style.backgroundImage = `url(${base64})`;
            try { localStorage.setItem('userBg', base64); } catch (err) {}
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

document.getElementById('btn-clear-bg').addEventListener('click', () => {
    localStorage.removeItem('userBg');
    // Trả về ảnh mặc định khi người dùng bấm reset
    bgOverlay.style.backgroundImage = "url('../gif.jpg')";
    bgSettings = { zoom: 100, x: 50, y: 50 };
    applyBgSettings();
});

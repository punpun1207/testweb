let playlist = JSON.parse(localStorage.getItem('myPlaylist')) || [
    { id: 'jfKfPfyJRdk', title: 'Lofi Girl - Chill Beats' },
    { id: '3B2hS48rR34', title: 'MIMI - サイエンス (maimai)' }
];
let currentTrackIndex = 0;
let isPlaying = false;
let isDraggingProgress = false;

const audioPlayer = document.getElementById('audio-player');
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

// --- LẤY NHẠC VỚI HỆ THỐNG BACKUP SERVER MỚI NHẤT ---
const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://api.piped.projectsegfau.lt',
    'https://piped-api.lunar.icu',
    'https://pipedapi.smnz.de',
    'https://piped-api.garudalinux.org'
];
async function fetchNoAdsAudio(videoId) {
    trackNameDisplay.innerText = "Đang tải...";
    for (const instance of PIPED_INSTANCES) {
        try {
            const res = await fetch(`${instance}/streams/${videoId}`);
            if (!res.ok) continue;
            const data = await res.json();
            if (data.audioStreams && data.audioStreams.length > 0) {
                return data.audioStreams[0].url;
            }
        } catch (error) { console.log(`Thử server khác...`); }
    }
    trackNameDisplay.innerText = "Lỗi tải nhạc!";
    return null;
}

async function loadTrack(index) {
    currentTrackIndex = index;
    const track = playlist[currentTrackIndex];
    renderPlaylist();

    audioPlayer.pause();
    progressBar.value = 0;
    timeCurrent.innerText = "00:00";

    const audioUrl = await fetchNoAdsAudio(track.id);

    if (audioUrl) {
        audioPlayer.src = audioUrl;
        trackNameDisplay.innerText = track.title;
        audioPlayer.play().catch(() => console.log("Chờ user click..."));
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

audioPlayer.addEventListener('timeupdate', () => {
    if (!isDraggingProgress) {
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressBar.value = percent || 0;
        timeCurrent.innerText = formatTime(audioPlayer.currentTime);
    }
});

audioPlayer.addEventListener('loadedmetadata', () => {
    timeTotal.innerText = formatTime(audioPlayer.duration);
});

progressBar.addEventListener('mousedown', () => isDraggingProgress = true);
progressBar.addEventListener('mouseup', () => isDraggingProgress = false);
progressBar.addEventListener('input', (e) => {
    const seekTime = (e.target.value / 100) * audioPlayer.duration;
    timeCurrent.innerText = formatTime(seekTime);
});
progressBar.addEventListener('change', (e) => {
    const seekTime = (e.target.value / 100) * audioPlayer.duration;
    audioPlayer.currentTime = seekTime;
});

window.addEventListener('DOMContentLoaded', () => {
    loadTrack(currentTrackIndex);
    document.body.addEventListener('click', () => {
        if (audioPlayer.paused && audioPlayer.src) audioPlayer.play();
    }, { once: true });
});

audioPlayer.addEventListener('play', () => {
    isPlaying = true;
    visualizer.classList.add('active');
    playPauseBtn.innerText = '⏸';
    playPauseBtn.classList.replace('is-success', 'is-warning');
});
audioPlayer.addEventListener('pause', () => {
    isPlaying = false;
    visualizer.classList.remove('active');
    playPauseBtn.innerText = '▶';
    playPauseBtn.classList.replace('is-warning', 'is-success');
});
audioPlayer.addEventListener('ended', nextTrack);

function nextTrack() {
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    loadTrack(currentTrackIndex);
}

function prevTrack() {
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    loadTrack(currentTrackIndex);
}
playPauseBtn.addEventListener('click', () => isPlaying ? audioPlayer.pause() : audioPlayer.play());
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
        try {
            // Cập nhật API tìm kiếm sang server dự phòng ổn định hơn
            const res = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=music_songs`);
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                const firstVideo = data.items.find(item => item.type === 'stream');
                if (firstVideo) {
                    videoId = firstVideo.url.replace('/watch?v=', '');
                    videoTitle = firstVideo.title;
                }
            }
        } catch (err) {
            statusMsg.innerText = "Lỗi tìm kiếm!";
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

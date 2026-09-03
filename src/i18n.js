export const STRINGS = {
  en: {
    controls: 'Controls',
    hideControls: 'Hide controls',
    laundry: 'Laundry',
    tshirt: 'T-shirt',
    sock: 'Sock',
    towel: 'Towel',
    pants: 'Pants',
    random: 'Random',
    remove: 'Remove',
    empty: 'Empty',
    mode: 'Mode',
    auto: 'AUTO',
    manual: 'MANUAL',
    pause: 'Pause',
    resume: 'Resume',
    rpm: 'RPM',
    reverse: 'Reverse',
    water: 'Water',
    skip: 'Skip stage',
    lowPower: 'Low graphics',
    lowPowerHint: 'Lighter rendering for slow devices: 1x resolution, plainer garment detail, half the foam, up to 12 items. Turns on by itself when frames run slow.',
    sound: 'Sound',
    volume: 'Volume',
    muteSwitchHint: 'No sound? Check the mute switch on your device.',
    switchLang: 'Switch to Korean',
    canvasLabel: 'A front-loading drum washing machine running a wash cycle',
    paused: 'Paused',
    stages: {
      fill: 'Fill',
      wash: 'Wash',
      drain: 'Drain',
      rinse: 'Rinse',
      spin: 'Spin',
      done: 'Done',
    },
    live: (stage, time, rpm) => `${stage}, ${time} remaining, ${rpm} RPM`,
  },
  ko: {
    controls: '조작',
    hideControls: '조작 숨기기',
    laundry: '빨래',
    tshirt: '티셔츠',
    sock: '양말',
    towel: '수건',
    pants: '바지',
    random: '랜덤',
    remove: '빼기',
    empty: '비우기',
    mode: '모드',
    auto: '자동',
    manual: '수동',
    pause: '일시정지',
    resume: '재생',
    rpm: 'RPM',
    reverse: '역회전',
    water: '급수',
    skip: '다음 단계',
    lowPower: '저사양 모드',
    lowPowerHint: '느린 기기용으로 렌더링을 가볍게 합니다. 해상도 1배, 옷 디테일 간소화, 거품 절반, 빨래 최대 12개. 프레임이 느리면 자동으로 켜집니다.',
    sound: '소리',
    volume: '볼륨',
    muteSwitchHint: '소리가 안 들리면 기기의 무음 스위치를 확인하세요.',
    switchLang: '영어로 전환',
    canvasLabel: '세탁 코스가 진행 중인 드럼 세탁기',
    paused: '일시정지',
    stages: {
      fill: '급수',
      wash: '세탁',
      drain: '배수',
      rinse: '헹굼',
      spin: '탈수',
      done: '종료',
    },
    live: (stage, time, rpm) => `${stage}, 남은 시간 ${time}, ${rpm} RPM`,
  },
};

export function detectLang(saved) {
  if (saved && STRINGS[saved]) return saved;
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('ko') ? 'ko' : 'en';
}

export function t(lang, key) {
  const dict = STRINGS[lang] || STRINGS.en;
  return dict[key] ?? STRINGS.en[key] ?? key;
}

export function stageName(lang, id) {
  const dict = STRINGS[lang] || STRINGS.en;
  return dict.stages[id] ?? STRINGS.en.stages[id] ?? id;
}

export function applyI18n(root, lang) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(lang, el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-label]').forEach((el) => {
    el.setAttribute('aria-label', t(lang, el.dataset.i18nLabel));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(lang, el.dataset.i18nTitle));
  });
  const langBtn = root.querySelector('#lang');
  if (langBtn) langBtn.textContent = lang === 'ko' ? 'English' : '한국어';
}

(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const progressBar = document.querySelector('.progress-bar');
  const cursor = document.querySelector('.cursor-glow');
  const audio = document.querySelector('#ambient-audio');
  const soundToggle = document.querySelector('.sound-toggle');
  const soundLabel = document.querySelector('.sound-label');
  const memoryHeart = document.querySelector('#memory-heart');
  const closing = document.querySelector('#closing');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const endingRevealDelay = prefersReducedMotion ? 0 : 2600;

  let currentScroll = window.scrollY;
  let targetScroll = currentScroll;
  let progressTicking = false;
  let audioFadeTimer;
  let closingRevealTimer;

  body.classList.add('js-enabled');

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const createMemoryHeart = () => {
    if (!memoryHeart) return;

    const layer = memoryHeart.parentElement;
    const context = memoryHeart.getContext('2d');
    const phrase = 'I love you';
    if (!layer || !context) return;

    const render = () => {
      const bounds = layer.getBoundingClientRect();
      const width = bounds.width;
      const height = bounds.height;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      if (!width || !height) return;

      memoryHeart.width = Math.round(width * pixelRatio);
      memoryHeart.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = 'rgba(216, 198, 184, 1)';
      context.font = `700 ${clamp(width * 0.014, 9, 13)}px Arial, sans-serif`;

      // The same parametric heart equation as the reference's turtle drawing.
      // Several close scales create the dense, hand-written silhouette.
      const unit = Math.min(width / 840, height / 560);
      for (let scale = 11; scale <= 16; scale += 1) {
        for (let index = 0; index < 120; index += 1) {
          const angle = (index * Math.PI * 2) / 120;
          const x = 16 * Math.sin(angle) ** 3;
          const y = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
          const positionX = width * 0.5 + x * scale * unit;
          const positionY = height * 0.5 - y * scale * unit;
          context.fillText(phrase, positionX, positionY);
        }
      }

    };

    render();
    window.addEventListener('resize', () => window.requestAnimationFrame(render), { passive: true });
    if (document.fonts?.ready) document.fonts.ready.then(render);
  };

  const wrapHeadingCharacters = () => {
    document.querySelectorAll('.reveal-heading').forEach((heading) => {
      if (heading.dataset.wrapped === 'true') return;

      const text = heading.textContent;
      heading.textContent = '';
      let characterIndex = 0;

      (text.match(/\s+|[^\s]+/g) || []).forEach((token) => {
        if (/\s+/.test(token)) {
          heading.appendChild(document.createTextNode(token));
          characterIndex += token.length;
          return;
        }

        const word = document.createElement('span');
        word.className = 'word';

        [...token].forEach((character) => {
          const span = document.createElement('span');
          span.className = 'char';
          span.textContent = character;
          span.style.transitionDelay = `${characterIndex * 60}ms`;
          word.appendChild(span);
          characterIndex += 1;
        });

        heading.appendChild(word);
      });
      heading.dataset.wrapped = 'true';
    });
  };

  const setupRevealObserver = () => {
    const revealItems = document.querySelectorAll('[data-reveal], .reveal-heading');

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      revealItems.forEach((item) => {
        item.classList.add('is-visible');
        item.querySelectorAll?.('.char').forEach((character) => character.classList.add('is-visible'));
      });
      return;
    }

    const observer = new IntersectionObserver((entries, revealObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add('is-visible');
        entry.target.querySelectorAll?.('.char').forEach((character) => {
          character.classList.add('is-visible');
        });
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    revealItems.forEach((item) => observer.observe(item));
  };

  const updateProgressAndMemory = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollProgress = maxScroll > 0 ? clamp(currentScroll / maxScroll, 0, 1) : 0;

    if (progressBar) progressBar.style.width = `${scrollProgress * 100}%`;

    const peak = Math.max(0, 1 - Math.abs(scrollProgress - 0.7) / 0.34);
    const fadeIn = clamp(scrollProgress / 0.18, 0, 1);
    const fadeOut = clamp((1 - scrollProgress) / 0.22, 0, 1);
    const opacity = 0.032 + peak * 0.07;
    root.style.setProperty('--memory-opacity', `${opacity * fadeIn * fadeOut}`);
    progressTicking = false;
  };

  const requestProgressUpdate = () => {
    targetScroll = window.scrollY;
    if (progressTicking) return;
    progressTicking = true;
    window.requestAnimationFrame(() => {
      currentScroll = targetScroll;
      updateProgressAndMemory();
    });
  };

  const setupCursor = () => {
    if (!cursor || prefersReducedMotion || window.matchMedia('(pointer: coarse)').matches) return;

    window.addEventListener('pointermove', (event) => {
      cursor.classList.add('is-active');
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    }, { passive: true });
  };

  const setSoundState = (isPlaying) => {
    if (!soundToggle) return;

    soundToggle.classList.toggle('is-playing', isPlaying);
    soundToggle.setAttribute('aria-pressed', String(isPlaying));
    soundToggle.setAttribute('aria-label', isPlaying ? 'Mute ambient music' : 'Unmute ambient music');
    if (soundLabel) soundLabel.textContent = isPlaying ? 'Sound on' : 'Sound off';
  };

  const fadeAudioIn = () => {
    if (!audio) return;

    window.clearInterval(audioFadeTimer);
    audio.volume = 0;

    const beginFade = () => {
      const steps = prefersReducedMotion ? 1 : 30;
      const stepDuration = prefersReducedMotion ? 0 : 100;
      let step = 0;

      audioFadeTimer = window.setInterval(() => {
        step += 1;
        audio.volume = Math.min(0.08, (0.08 * step) / steps);
        if (step >= steps) {
          window.clearInterval(audioFadeTimer);
          audio.volume = 0.08;
        }
      }, stepDuration);
      setSoundState(true);
    };

    const started = audio.play();
    if (started?.then) {
      started.then(beginFade).catch(() => setSoundState(false));
    } else {
      beginFade();
    }
  };

  const toggleAudio = () => {
    if (!audio) return;

    if (audio.paused) {
      fadeAudioIn();
      return;
    }

    audio.pause();
    audio.volume = 0;
    setSoundState(false);
  };

  const setupAudio = () => {
    if (!audio || !soundToggle) return;

    // Use an explicit ended handler instead of relying on browser loop behavior.
    audio.loop = false;
    audio.addEventListener('ended', () => {
      audio.currentTime = 0;
      const restarted = audio.play();
      if (restarted?.catch) restarted.catch(() => setSoundState(false));
    });
    soundToggle.addEventListener('click', toggleAudio);
    audio.addEventListener('play', () => setSoundState(true));
    audio.addEventListener('pause', () => setSoundState(false));

    const beginOnInteraction = () => {
      fadeAudioIn();
      window.removeEventListener('pointerdown', beginOnInteraction);
      window.removeEventListener('keydown', beginOnInteraction);
      window.removeEventListener('scroll', beginOnInteraction);
    };

    window.addEventListener('pointerdown', beginOnInteraction, { once: true, passive: true });
    window.addEventListener('keydown', beginOnInteraction, { once: true });
    window.addEventListener('scroll', beginOnInteraction, { once: true, passive: true });
    fadeAudioIn();
  };

  const setupClosingReveal = () => {
    if (!closing) return;

    const reveal = () => {
      window.clearTimeout(closingRevealTimer);
      closingRevealTimer = window.setTimeout(() => {
        closing.classList.add('is-revealed');
        body.classList.add('ending-revealed');
      }, endingRevealDelay);
    };

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      reveal();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
        reveal();
      } else {
        window.clearTimeout(closingRevealTimer);
        closing.classList.remove('is-revealed');
        body.classList.remove('ending-revealed');
      }
    }, { threshold: [0, 0.35, 0.65] });

    observer.observe(closing);
  };

  createMemoryHeart();
  wrapHeadingCharacters();
  setupRevealObserver();
  setupCursor();
  setupAudio();
  setupClosingReveal();
  updateProgressAndMemory();

  window.addEventListener('scroll', requestProgressUpdate, { passive: true });
  window.addEventListener('resize', requestProgressUpdate, { passive: true });
})();
